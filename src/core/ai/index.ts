import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import fs from 'fs/promises';
import { Logger } from '../../utils/logger.js';
import { validateResponseWithSeal } from '../../security/sovereign_seal.js';
import { generateCapabilityMap, detectMoodFromText, saveArdState, incrementSessionCount, saveReasoningEntry, extractThoughtBlock } from '../ard_intelligence.js';
import { buildFullSystemInstruction } from './prompts.js';
import { detectProvider, providerHealth, clearProviderHealth, getLocalSandboxResponse } from './router.js';
import { callGemini } from './providers/gemini.js';
import { callAnthropic } from './providers/anthropic.js';
import { callOpenAICompatible } from './providers/openai.js';

export { providerHealth, clearProviderHealth };

export function getModelDirectory(provider: string) {
  const providers: Record<string, any> = {
    'Google Gemini': {
      models: [
        { id: 'gemini-2.0-flash', tier: 'Balanced', desc: 'Gemini 2.0 Flash (Sovereign Core)' },
        { id: 'gemini-1.5-pro', tier: 'Pure Reasoning', desc: 'Gemini 1.5 Pro (Pure Reasoning)' },
        { id: 'gemini-2.0-flash-lite', tier: 'Eco Speed', desc: 'Gemini 2.0 Flash Lite (Eco Speed)' },
      ],
      baseURL: 'https://generativelanguage.googleapis.com',
      docs: 'https://aistudio.google.com/app/apikey'
    },
    'OpenAI': {
      models: [
        { id: 'gpt-4o', tier: 'Omni Balanced', desc: 'GPT-4o (Omni Balanced)' },
        { id: 'gpt-4o-mini', tier: 'Eco Speed', desc: 'GPT-4o Mini (Eco Speed)' },
        { id: 'o3-mini', tier: 'High-speed Reasoning', desc: 'o3-mini (High-speed Reasoning)' },
        { id: 'gpt-5.5', tier: 'Frontier', desc: 'GPT-5.5 (Frontier)' },
      ],
      baseURL: 'https://api.openai.com/v1',
      docs: 'https://platform.openai.com/api-keys'
    },
    'DeepSeek': {
      models: [
        { id: 'deepseek-v4-flash', tier: 'Naluri', desc: 'DeepSeek-V4-Flash (Fast)' },
        { id: 'deepseek-v4-pro', tier: 'Expert', desc: 'DeepSeek-V4-Pro (Reasoning)' }
      ],
      baseURL: 'https://api.deepseek.com',
      docs: 'https://platform.deepseek.com/api_keys'
    },
    'Anthropic Claude': {
      models: [
        { id: 'claude-opus-4-8', tier: 'Frontier Agentic', desc: 'Claude Opus 4.8 (Frontier Agentic)' },
        { id: 'claude-opus-4-7', tier: 'Full Power', desc: 'Claude Opus 4.7 (Full Power)' },
        { id: 'claude-sonnet-4-6', tier: 'Balanced', desc: 'Claude Sonnet 4.6 (Balanced)' },
        { id: 'claude-haiku-4-5-20251001', tier: 'Eco Speed', desc: 'Claude Haiku 4.5 (Eco Speed)' },
      ],
      baseURL: 'https://api.anthropic.com',
      docs: 'https://console.anthropic.com/'
    }
  };
  return providers[provider] || providers['Google Gemini'];
}

function adaptiveTriage(messages: any[] = [], attachments: any[] = []) {
  const lastMsg = (messages && messages.length > 0) ? (messages[messages.length - 1]?.content || "") : "";
  const attachmentCount = (attachments || []).length;
  let score = lastMsg.length / 100 + attachmentCount * 5;
  if (lastMsg.toLowerCase().includes('buat') || lastMsg.toLowerCase().includes('analisis') || lastMsg.toLowerCase().includes('koding')) {
    score += 15;
  }
  if (score > 30) return 'DEEP';
  if (score > 10) return 'STANDARD';
  return 'LIGHT';
}

export async function chat(
  brain: any,
  messages: any[],
  attachments: any[],
  uiContext: any,
  systemInstruction: string,
  modelOverride?: string,
  channel: string = 'Web',
  onStream?: (token: string) => void
) {
  const safeAttachments = attachments || [];
  const triagePath = adaptiveTriage(messages, safeAttachments);
  await Logger.log('AI', `Triage Result: ${triagePath}`, { score: triagePath }, 'TRIAGE');

  const localBrain = { ...brain };
  const provider = localBrain.provider || 'Google Gemini';
  
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const isEnvKeyValid = envKey.length > 10 && envKey !== 'YOUR_API_KEY';
  
  if (!localBrain.api_key || localBrain.api_key.trim().length < 5 || localBrain.api_key === 'YOUR_API_KEY') {
    if (isEnvKeyValid) localBrain.api_key = envKey;
  }

  const apiKey = (localBrain.api_key || '').trim();
  const { detectedProvider, isOllama, isDeepSeek, isOpenAI, isAnthropic, isGemini } = detectProvider(provider, apiKey, localBrain.base_url);

  let modelToUse = modelOverride || localBrain.custom_model || (isGemini ? 'gemini-2.0-flash' : isDeepSeek ? 'deepseek-v4-flash' : 'gpt-4o');
  if (isOllama && localBrain.custom_model && !modelOverride) {
    modelToUse = localBrain.custom_model;
  }

  let currentProvider = detectedProvider;
  let currentIsGemini = isGemini;
  let currentIsDeepSeek = isDeepSeek;
  let currentIsAnthropic = isAnthropic;
  let activeModel = modelToUse;

  const cachedHealth = providerHealth[currentProvider];
  if (cachedHealth && cachedHealth.status === 'QUOTA_EXHAUSTED' && cachedHealth.backoffUntil && Date.now() < cachedHealth.backoffUntil) {
    const errorMsg = cachedHealth.lastError || "API Key exceeded quota. (Cached failure)";
    await Logger.log('WARN', `Cached Quota Exhausted check hit for ${currentProvider}. Cooldown active.`, { lastError: errorMsg }, 'AI_CORE');
    return {
      content: "Maaf, sistem sedang dalam periode pendinginan (cooldown) karena kuota API habis. Silakan coba beberapa saat lagi.",
      model: 'Offline-Sandbox-Core',
      provider: 'Offline Local Neural Link'
    };
  }

  if (currentIsGemini) {
    if (activeModel.includes('flash')) activeModel = 'gemini-2.0-flash';
    else if (activeModel.includes('pro')) activeModel = 'gemini-1.5-pro';
    else if (activeModel.includes('lite')) activeModel = 'gemini-2.0-flash-lite';
  }

  await Logger.log('AI', `Initiating request to ${currentProvider}`, { model: activeModel, channel, originalProvider: provider }, 'AI_CORE');
  if (onStream) onStream(`__STATUS:Menghubungkan ke ${currentProvider} (${activeModel})...__`);

  try {
    localBrain._capabilityMap = await generateCapabilityMap(localBrain);
    const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1]?.content || '' : '';
    if (lastMsg && lastMsg.length > 10 && !lastMsg.startsWith('[LIVE_PRESENCE]')) {
      const detectedState = detectMoodFromText(lastMsg);
      if (detectedState.current_mood && detectedState.current_mood !== 'neutral') await saveArdState(detectedState);
    }
    await incrementSessionCount();
  } catch (e: any) {
    Logger.log('WARN', `Ard Intelligence pre-chat init failed: ${e.message}`, {}, 'ARD_STATE');
  }

  let attempts = 0;
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;
  let firstError: any = null;
  const initialProvider = currentProvider;
  let hasSwitchedToFallback = false;

  while (attempts < MAX_ATTEMPTS + (currentIsGemini ? 1 : 0)) {
    try {
      const fullSystemInst = await buildFullSystemInstruction(systemInstruction, localBrain, currentIsGemini);
      let resText = '';
      let nativeToolCalls: any[] = [];

      if (currentIsGemini) {
        const gemRes = await callGemini(localBrain.api_key, activeModel, messages, safeAttachments, fullSystemInst, channel, onStream);
        resText = gemRes.text;
        nativeToolCalls = gemRes.nativeToolCalls;
      } else if (currentIsAnthropic) {
        const antRes = await callAnthropic(localBrain.api_key, activeModel, messages, safeAttachments, fullSystemInst, onStream);
        resText = antRes.text;
        nativeToolCalls = antRes.nativeToolCalls;
      } else {
        let baseURL = localBrain.base_url;
        if (currentIsDeepSeek) baseURL = 'https://api.deepseek.com';
        else if (currentProvider === 'OpenAI' && (!localBrain.base_url || localBrain.api_key === process.env.OPENAI_API_KEY?.trim())) baseURL = 'https://api.openai.com/v1';
        else if (isOllama) baseURL = baseURL || 'http://localhost:11434/v1';
        else baseURL = baseURL || 'https://api.openai.com/v1';

        const oaiRes = await callOpenAICompatible(localBrain.api_key, baseURL, activeModel, messages, safeAttachments, fullSystemInst, isOllama, onStream);
        resText = oaiRes.text;
        nativeToolCalls = oaiRes.nativeToolCalls;
      }

      if (nativeToolCalls.length > 0) {
        const t = nativeToolCalls[0];
        resText += `\n\n\`\`\`json\n{"tool": "${t.name}", "args": ${JSON.stringify(t.args)}}\n\`\`\``;
      }

      providerHealth[initialProvider] = { status: 'OK', updatedAt: new Date().toISOString() };
      if (initialProvider !== currentProvider) providerHealth[currentProvider] = { status: 'OK', updatedAt: new Date().toISOString() };
      
      const sealCheck = validateResponseWithSeal(resText);
      if (!sealCheck.isClean && sealCheck.identityLeakDetected && sealCheck.sanitizedContent) {
        Logger.log('WARN', `SOVEREIGN SEAL: Identity leak sanitized from ${currentProvider}.`, {}, 'SEAL');
        resText = sealCheck.sanitizedContent;
      }

      try {
        const thoughtBlock = extractThoughtBlock(resText);
        if (thoughtBlock && thoughtBlock.length > 20) {
          const lastUserMsg = messages && messages.length > 0 ? messages[messages.length - 1]?.content || '' : '';
          await saveReasoningEntry({ session_context: lastUserMsg.slice(0, 200), thought_block: thoughtBlock, action_taken: channel, outcome: 'success', tags: ['general'], model_used: activeModel });
        }
      } catch (e: any) {}
      
      await Logger.log('AI', `Receive response from ${currentProvider}`, { model: activeModel, channel, responseLength: resText.length }, 'AI_CORE');
      return { content: resText, model: activeModel, provider: currentProvider };

    } catch (e: any) {
      attempts++;
      lastError = e;
      if (!firstError) firstError = e;
      providerHealth[currentProvider] = { status: 'ERROR', lastError: e.message || 'Unknown error occurred', updatedAt: new Date().toISOString() };

      const errorMsg = e.message?.toLowerCase() || '';
      const isAuthError = errorMsg.includes('api key expired') || errorMsg.includes('api_key_invalid') || errorMsg.includes('401') || errorMsg.includes('unauthorized');
      if (isGemini && isAuthError && process.env.GEMINI_API_KEY) {
        const envK = process.env.GEMINI_API_KEY.trim();
        if (envK !== 'YOUR_API_KEY' && envK.length >= 10 && localBrain.api_key !== envK) {
          localBrain.api_key = envK; continue;
        }
      }
      
      const isRateLimitOrQuota = errorMsg.includes('quota') || errorMsg.includes('resource_exhausted') || errorMsg.includes('429');
      const isSpendingCap = (errorMsg.includes('spending cap') || errorMsg.includes('billing')) && !isRateLimitOrQuota;

      if (isSpendingCap || isRateLimitOrQuota) {
        providerHealth[currentProvider] = { status: 'QUOTA_EXHAUSTED', lastError: e.message, updatedAt: new Date().toISOString(), backoffUntil: Date.now() + 60000 };
      }
      if ((isSpendingCap || isRateLimitOrQuota) && attempts < MAX_ATTEMPTS + (currentIsGemini ? 1 : 0)) {
        if (!currentIsGemini && process.env.GEMINI_API_KEY) {
          localBrain.provider = 'Google Gemini'; localBrain.api_key = process.env.GEMINI_API_KEY.trim();
          currentProvider = 'Google Gemini'; currentIsGemini = true; currentIsAnthropic = false; currentIsDeepSeek = false;
          activeModel = 'gemini-2.0-flash'; hasSwitchedToFallback = true;
        }
        await new Promise(r => setTimeout(r, 2000 * attempts));
        continue;
      }

      if (attempts < MAX_ATTEMPTS + (currentIsGemini ? 1 : 0)) {
        await new Promise(r => setTimeout(r, 1000 * attempts));
        continue;
      }
    }
  }

  const errorToThrow = firstError || lastError || new Error('Unknown AI failure after all retries.');
  const isQuotaErr = errorToThrow.message.toLowerCase().includes('quota') || errorToThrow.message.toLowerCase().includes('429');
  if (isQuotaErr) {
    const lastUserMsg = messages && messages.length > 0 ? messages[messages.length - 1]?.content : "";
    const localResponse = getLocalSandboxResponse(lastUserMsg);
    if (onStream) { for (const token of localResponse.split(' ')) { onStream(token + ' '); await new Promise(r => setTimeout(r, 20)); } }
    return { content: localResponse, model: 'Offline-Sandbox-Core', provider: 'Offline Local Neural Link' };
  }
  throw errorToThrow;
}

export async function getEmbedding(brain: any, text: string) {
  const provider = (brain.provider || process.env.AI_PROVIDER || '').toLowerCase();
  
  if (provider.includes('openai')) {
    const apiKey = process.env.API_KEY || brain.api_key;
    try {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: text, model: 'text-embedding-3-small' })
        });
        const data = await res.json();
        if (data.data && data.data.length > 0) return data.data[0].embedding;
    } catch (e) { return null; }
  } else if (provider.includes('ollama')) {
    const baseUrl = (process.env.BASE_URL || 'http://localhost:11434/v1').replace('/v1', '');
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${baseUrl}/api/embeddings`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ prompt: text, model: 'nomic-embed-text' }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();
        if (data && data.embedding) return data.embedding;
    } catch (e) { return null; }
    return null;
  }

  const isGeminiEmb = provider.includes('gemini') || provider.includes('google') || provider === '';
  if (!isGeminiEmb) return null;

  const envKeyEmb = (process.env.GEMINI_API_KEY || '').trim();
  let localKey = brain.api_key || envKeyEmb;

  try {
    const ai = new GoogleGenAI({ apiKey: localKey });
    // @ts-ignore
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [{ parts: [{ text }] }]
    });
    if (result && result.embeddings && result.embeddings.length > 0) {
      return result.embeddings[0].values;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function generateImageComposition(config: any, prompt: string, format: string, nodes: any[]) {
    if (!config.api_key) throw new Error("API Key Gemini tidak ditemukan.");
    const ai = new GoogleGenAI({ apiKey: config.api_key });
    const parts: any[] = [];
    nodes.forEach(n => {
      if (n.content && n.content.includes('base64,')) {
        const mimeType = n.content.substring(n.content.indexOf(':') + 1, n.content.indexOf(';'));
        const data = n.content.substring(n.content.indexOf(',') + 1);
        parts.push({ inlineData: { data, mimeType } });
      }
    });

    parts.push({ text: `Analyze the provided images: "${prompt}". Create a detailed photorealistic English text prompt for Image Generation AI. Return ONLY raw English text.` });
    const visionModel = config.custom_model && config.custom_model.includes('gemini') ? config.custom_model : "gemini-2.0-flash";

    try {
      const visionResult = await ai.models.generateContent({ model: visionModel, contents: [{ parts }] });
      const optimizedPrompt = (visionResult.text || "").trim();

      const aspectRatios: Record<string, string> = { '9:16': '9:16', '16:9': '16:9', '1:1': '1:1' };
      const aspectRatio = aspectRatios[format] || '1:1';

      Logger.log('INFO', 'Generating image with Imagen 4.0...', {}, 'AI_CORE');
      const imageResult = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: optimizedPrompt,
        config: { numberOfImages: 1, aspectRatio, outputMimeType: "image/jpeg" }
      });

      if (!imageResult.generatedImages || imageResult.generatedImages.length === 0 || !imageResult.generatedImages[0].image) {
        throw new Error("Gagal menghasilkan gambar dari Imagen AI.");
      }

      const base64Image = imageResult.generatedImages[0].image.imageBytes || "";
      return { imageUrl: `data:image/jpeg;base64,${base64Image}`, optimizedPrompt };
    } catch (e: any) {
      throw new Error(`AI Gateway Error: ${e.message || "Unknown error"}`);
    }
}

export async function analyzeClipperVideo(config: any, url: string) {
    const prompt = `You are ANT CLIPPER (Viral Video Analyst). Analyze: "${url}". Format purely as JSON with keys: suggested_title, suggested_caption, hashtags, highlights, ffmpeg_command.`;
    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, "You are a Video Clipper Specialist.", 'gemini-1.5-pro', 'Internal');
    let content = typeof response === 'string' ? response : response.content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    const jsonStr = (startIdx !== -1 && endIdx !== -1) ? content.substring(startIdx, endIdx + 1) : content;
    return JSON.parse(jsonStr);
}

export async function generateContent(config: any, theme: string, platform: string, language: string, interest: string = 'General') {
    const prompt = `You are ANT ASSIST CREATOR. Theme: "${theme}", Platform: "${platform}", Interest: "${interest}". Language: ${language || 'Indonesian'}. Format purely as JSON.`;
    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, "You are a Content Strategist.", config.custom_model, 'Internal');
    let content = typeof response === 'string' ? response : response.content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    const jsonStr = (startIdx !== -1 && endIdx !== -1) ? content.substring(startIdx, endIdx + 1) : content;
    return JSON.parse(jsonStr);
}

export async function generateBusinessIntelligence(config: any, brief: string) {
    const prompt = `You are ANT BUSINESS INTELLIGENCE ENGINE. Analyze: "${brief}". Format purely as JSON.`;
    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, "You are a Business Consultant.", config.custom_model, 'Internal');
    let content = typeof response === 'string' ? response : response.content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    const jsonStr = (startIdx !== -1 && endIdx !== -1) ? content.substring(startIdx, endIdx + 1) : content;
    return JSON.parse(jsonStr);
}

export async function searchNews(tavilyKey: string, query: string) {
    if (!tavilyKey) throw new Error('Tavily API Key is missing.');
    const response = await axios.post('https://api.tavily.com/search', {
        api_key: tavilyKey,
        query: query,
        search_depth: "advanced",
        include_images: false,
        max_results: 5
    });
    return response.data;
}

export async function analyzeContentMultimodal(config: any, media: string, platform: string, type: string) {
    const prompt = `You are ANT COGNITIVE ANALYST. Platform: ${platform}, Type: ${type}. Format purely as JSON.`;
    const attachments = [{ type: type === 'video' ? 'video/mp4' : 'image/jpeg', data: media.includes(',') ? media.split(',')[1] : media }];
    const response = await chat(config, [{ role: 'user', content: prompt }], attachments, {}, "You are a Multimodal Content Analyst.", config.custom_model, 'Vision');
    let content = typeof response === 'string' ? response : response.content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    const jsonStr = (startIdx !== -1 && endIdx !== -1) ? content.substring(startIdx, endIdx + 1) : content;
    return JSON.parse(jsonStr);
}

export async function analyzeImage(config: any, prompt: string, base64Image: string) {
    if (!config.api_key) throw new Error("API Key Gemini tidak ditemukan.");
    const ai = new GoogleGenAI({ apiKey: config.api_key });
    const model = config.custom_model || "gemini-2.0-flash";
    const parts = [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: base64Image } }];
    try {
        const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts }] });
        return response.text;
    } catch (e: any) {
        throw new Error(`AI Analysis Error: ${e.message}`);
    }
}
