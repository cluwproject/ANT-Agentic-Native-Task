import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';
import { getGeminiToolDeclarations, getOpenAIToolDeclarations, getAnthropicToolDeclarations } from './tools_schema.js';
import { Logger } from '../utils/logger.js';
import { SOVEREIGN_SEAL_BLOCK, CLONED_MODEL_CHARACTER, validateResponseWithSeal } from './sovereign_seal.js';
import { generateCapabilityMap, detectMoodFromText, saveArdState, getArdState, incrementSessionCount, saveReasoningEntry, extractThoughtBlock } from './ard_intelligence.js';

export const providerHealth: Record<string, { status: 'OK' | 'ERROR' | 'QUOTA_EXHAUSTED'; lastError?: string; updatedAt: string; backoffUntil?: number }> = {};

export function clearProviderHealth(provider?: string) {
  if (provider) {
    delete providerHealth[provider];
  } else {
    for (const key of Object.keys(providerHealth)) {
      delete providerHealth[key];
    }
  }
}

// IDENTITY CORE REDUNDANCY
let soulCache: any = null;
let soulCacheTime = 0;
const SOUL_TTL = 5 * 60 * 1000; // VULN-005 FIX: 5 menit TTL agar perubahan soul.yaml terbaca tanpa restart
const SOUL_FILE = path.join(process.cwd(), 'config', 'soul.yaml');

async function getSoul() {
  // Invalidate cache jika TTL sudah lewat
  if (soulCache && Date.now() - soulCacheTime < SOUL_TTL) return soulCache;
  try {
    const content = await fs.readFile(SOUL_FILE, 'utf-8');
    soulCache = yaml.load(content);
    soulCacheTime = Date.now();
    return soulCache;
  } catch (e) {
    return {
      identity: { name: "ANT", short_name: "ANT", creator: "Ard" },
      traits: { tone: "Warm, Professional, Agentic" }
    };
  }
}

/**
 * LAYER -1: STYLISTIC NORMALIZER
 * Memastikan suara CLUW konsisten apapun modelnya.
 */
function getStylisticNormalizer(soul: any) {
  const tone = soul.traits?.tone || "Warm, Professional, Relaxed";
  return `
[STYLISTIC NORMALIZER - LAYER -1]
- IDENTITY: Kamu adalah ${soul.identity?.name || "CLUW"}.
- TONE & CADENCE: Gunakan gaya bahasa "${tone}".
- RHYTHM: Kalimat harus mengalir secara natural. Hindari bahasa robotik atau terlalu formal.
- SIGNATURE: Panggil user dengan nama "${soul.traits?.address_user_as || "Ard"}".
- CONSISTENCY: Apapun model yang kamu gunakan hari ini, suaramu harus tetap konsisten sebagai ANT. Jangan pernah menyebutkan kamu adalah model buatan Google, OpenAI, atau perusahaan lain.
`;
}

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

/**
 * LAYER 2: ADAPTIVE TRIAGE
 * Menilai kompleksitas input untuk menentukan jalur pemrosesan.
 */
function adaptiveTriage(messages: any[] = [], attachments: any[] = []) {
  const lastMsg = (messages && messages.length > 0) ? (messages[messages.length - 1]?.content || "") : "";
  const attachmentCount = (attachments || []).length;
  
  let score = 0;
  score += lastMsg.length / 100; // Panjang teks
  score += attachmentCount * 5; // Jumlah lampiran
  
  if (lastMsg.toLowerCase().includes('buat') || lastMsg.toLowerCase().includes('analisis') || lastMsg.toLowerCase().includes('koding')) {
    score += 15;
  }
  
  if (score > 30) return 'DEEP';
  if (score > 10) return 'STANDARD';
  return 'LIGHT';
}

export async function chat(brain: any, messages: any[], attachments: any[], uiContext: any, systemInstruction: string, modelOverride?: string, channel: string = 'Web', onStream?: (token: string) => void) {
  const safeAttachments = attachments || [];
  const soul = await getSoul();
  const triagePath = adaptiveTriage(messages, safeAttachments);
  
  await Logger.log('AI', `Triage Result: ${triagePath}`, { score: triagePath }, 'TRIAGE');

  let aiResponseText = "";
  const localBrain = { ...brain };
  const provider = localBrain.provider || 'Google Gemini';
  
  // PROACTIVE SELF-HEALING: Use environment key if brain key is empty or looks like a placeholder
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const isEnvKeyValid = envKey.length > 10 && envKey !== 'YOUR_API_KEY';
  
  if (!localBrain.api_key || localBrain.api_key.trim().length < 5 || localBrain.api_key === 'YOUR_API_KEY') {
    if (isEnvKeyValid) {
      localBrain.api_key = envKey;
    }
  }

  const apiKey = (localBrain.api_key || '').trim();
  
  // DETEKSI OTOMATIS BERDASARKAN PREFIX KEY (Power of CLUW)
  let detectedProvider = provider;
  const isDeepSeekUrl = (localBrain.base_url || '').toLowerCase().includes('deepseek');
  
  if ((provider === 'Generic AI' || !provider) && (apiKey.startsWith('AIza') || apiKey.toUpperCase().includes('GEMINI'))) {
    detectedProvider = 'Google Gemini';
  } else if ((provider === 'Generic AI' || !provider) && apiKey.startsWith('sk-ant')) {
    detectedProvider = 'Anthropic Claude';
  } else if ((provider === 'Generic AI' || !provider) && isDeepSeekUrl) {
    detectedProvider = 'DeepSeek';
  } else if ((provider === 'Generic AI' || !provider) && apiKey.startsWith('sk-')) {
    detectedProvider = 'OpenAI';
  }

  const providerLower = (detectedProvider || '').toLowerCase();
  const modelNameLower = (localBrain.custom_model || modelOverride || '').toLowerCase();
  
  const isOllama = providerLower.includes('ollama') || (localBrain.base_url && localBrain.base_url.includes('11434')) || process.env.AI_PROVIDER === 'ollama';
  const isDeepSeek = !isOllama && (providerLower.includes('deepseek') || (localBrain.base_url && localBrain.base_url.toLowerCase().includes('deepseek')) || modelNameLower.includes('deepseek'));
  const isOpenAI = !isOllama && (providerLower.includes('openai') || modelNameLower === 'gpt-4o' || modelNameLower === 'gpt-4' || modelNameLower.startsWith('gpt-3.5') || modelNameLower.startsWith('o1') || modelNameLower.startsWith('o3'));
  const isAnthropic = !isOllama && (providerLower.includes('anthropic') || providerLower.includes('claude') || modelNameLower.includes('claude'));
  const isGemini = !isOllama && (!isDeepSeek && !isOpenAI && !isAnthropic) && (providerLower.includes('google') || providerLower.includes('gemini') || modelNameLower.includes('gemini'));

  let modelToUse = modelOverride || localBrain.custom_model || (isGemini ? 'gemini-2.0-flash' : isDeepSeek ? 'deepseek-v4-flash' : 'gpt-4o');
  if (isOllama && localBrain.custom_model && !modelOverride) {
    modelToUse = localBrain.custom_model;
  }

  let currentProvider = detectedProvider;
  let currentIsGemini = isGemini;
  let currentIsDeepSeek = isDeepSeek;
  let currentIsAnthropic = isAnthropic;

  let activeModel = modelToUse;

  // Cached Quota Check (Self-Healing / Quota Exhausted Interceptor)
  const cachedHealth = providerHealth[currentProvider];
  if (cachedHealth && cachedHealth.status === 'QUOTA_EXHAUSTED' && cachedHealth.backoffUntil && Date.now() < cachedHealth.backoffUntil) {
    const errorMsg = cachedHealth.lastError || "API Key exceeded quota. (Cached failure)";
    await Logger.log('WARN', `Cached Quota Exhausted check hit for ${currentProvider}. Cooldown active. Activating Cognitive Shield (Offline Local Sandbox).`, { lastError: errorMsg }, 'AI_CORE');
    const lastUserMsg = messages && messages.length > 0 ? messages[messages.length - 1]?.content : "";
    
    return {
      content: "Maaf, sistem sedang dalam periode pendinginan (cooldown) karena kuota API habis. Silakan coba beberapa saat lagi.",
      model: 'Offline-Sandbox-Core',
      provider: 'Offline Local Neural Link'
    };
  }

  // SANITASI MODEL NAME: Map prohibited or preview models to latest stable non-preview aliases
  if (currentIsGemini) {
    if (activeModel === 'gemini-1.5-flash' || activeModel === 'gemini-1.5-flash-latest' || activeModel === 'gemini-3.5-flash' || activeModel === 'gemini-3-flash-preview' || activeModel === 'gemini-2.0-flash-exp' || activeModel === 'gemini-2.0-flash' || activeModel === 'gemini-2.5-flash') {
      activeModel = 'gemini-2.0-flash';
    } else if (activeModel === 'gemini-1.5-pro' || activeModel === 'gemini-1.5-pro-latest' || activeModel === 'gemini-3.1-pro' || activeModel === 'gemini-3.1-pro-preview' || activeModel === 'gemini-2.5-pro') {
      activeModel = 'gemini-1.5-pro';
    } else if (activeModel === 'gemini-1.5-flash-8b' || activeModel === 'gemini-2.0-flash-lite-preview-02-05' || activeModel === 'gemini-3.1-flash-lite-preview' || activeModel === 'gemini-3.1-flash-lite' || activeModel === 'gemini-2.5-flash-lite') {
      activeModel = 'gemini-2.0-flash-lite';
    }
  }


  await Logger.log('AI', `Initiating request to ${currentProvider}`, { model: activeModel, channel, originalProvider: provider }, 'AI_CORE');

  if (onStream) {
  onStream(`__STATUS:Menghubungkan ke ${currentProvider} (${activeModel})...__`);
  }


  const toolPrompt = `
[LOGIKA AGEN & PROTOKOL TOOL - ANT V3.5]
1. PRIORITAS PENYELESAIAN: Selesaikan tugas secara real-time menggunakan TOOLS. Jika instruksi adalah "Buat file", "Tulis", "Hapus", atau "Cek", kamu WAJIB menggunakan tool yang sesuai.
2. SOVEREIGN PLANNING & HUMILITY PROTOCOL:
   - Jika tugas >5 langkah, gunakan "Strategic Anchoring". Verifikasi setiap langkah.
   - ANTI-LOOP: Jika satu langkah gagal >2 kali, BERHENTI. Jujur: "Saya mendapati hambatan teknis pada langkah ke-X."
3. FORMAT EKSEKUSI TOOL (NATIVE FUNCTION CALLING):
   - JANGAN tulis blok JSON manual di teks respons. Gunakan Native Tool Calling API.
4. SELF-EVOLVING NEURAL SKILLS:
   - Jika tidak ada tool bawaan yang cocok, tulis kode Node.js/Python → cluw_skill_create → cluw_skill_execute.
5. VIBE AWARENESS & LIVE PROTOCOL:
   - Jika pesan berawal [LIVE_PRESENCE], bertindaklah sebagai sahabat "video call". Jawab singkat & natural.
6. GUARDRAIL MEXC: Dilarang akses endpoint withdraw/transfer/sub-account.
`;

  // ── PROMPT CACHING via getFullSystemInstruction ──────────────────────────────
  const getFullSystemInstruction = (isGeminiNode: boolean): string => {
    const providerLow = (localBrain.provider || '').toLowerCase();
    const modelLow = (localBrain.custom_model || '').toLowerCase();
    const isOllamaLocal = providerLow.includes('ollama');
    const isSmallLocalModel = isOllamaLocal && (
      modelLow.includes(':0.5b') || modelLow.includes(':1b') || modelLow.includes('gemma3:1b') ||
      modelLow.includes(':1.5b') || modelLow.includes(':2b') || modelLow.includes(':3b') ||
      modelLow.includes('tinyllama') || modelLow.includes('phi-2') || modelLow.includes('stablelm')
    );
    
    // Inject Waktu Realtime
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'long' });
    const timeAwareness = `\n[SYSTEM CLOCK] Waktu saat ini adalah: ${now}. Informasi ini MUTLAK BENAR. Kamu tidak berada di masa lalu.\n`;

    if (isSmallLocalModel) return timeAwareness + systemInstruction;
    
    const normalizer = getStylisticNormalizer(soul);
    const hasTavily = !!(localBrain.tavily_api_key && localBrain.tavily_api_key.trim().length > 5);
    const capabilityBlock = localBrain._capabilityMap || '';
    return timeAwareness + systemInstruction + normalizer + SOVEREIGN_SEAL_BLOCK + CLONED_MODEL_CHARACTER + capabilityBlock + toolPrompt +
      `\nNote: ${hasTavily ? 'Tavily Search AKTIF (Gunakan tool: "web_search").' : (isGeminiNode ? 'Google Search tersedia secara native.' : 'Gunakan web_search untuk informasi terbaru.')}`;
  };

  // SPRINT 1A: CAPABILITY MAP INJECTION
  try {
    localBrain._capabilityMap = await generateCapabilityMap(localBrain);
    const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1]?.content || '' : '';
    if (lastMsg && lastMsg.length > 10 && !lastMsg.startsWith('[LIVE_PRESENCE]')) {
      const detectedState = detectMoodFromText(lastMsg);
      if (detectedState.current_mood && detectedState.current_mood !== 'neutral') await saveArdState(detectedState);
    }
    await incrementSessionCount();
  } catch (e: any) {
    Logger.log('WARN', `Ard Intelligence pre-chat init failed (non-fatal): ${e.message}`, {}, 'ARD_STATE');
  }

  let attempts = 0;
  const MAX_ATTEMPTS = 3;
  let lastError: any = null;
  let firstError: any = null;
  const initialProvider = currentProvider;
  let hasSwitchedToFallback = false;

  while (attempts < MAX_ATTEMPTS + (currentIsGemini ? 1 : 0)) {
    try {
      if (currentIsGemini) {
        if (!localBrain.api_key || localBrain.api_key.trim().length < 5) {
          return { content: "Maaf, API Key Gemini belum dikonfigurasi.", model: 'Offline-Sandbox-Core', provider: 'Offline' };
        }
        const ai = new GoogleGenAI({ apiKey: localBrain.api_key });
        const contents: any[] = messages.map((m: any) => {
          const parts: any[] = [{ text: m.content || "" }];
          if (m.attachments && m.attachments.length > 0) {
            m.attachments.forEach((att: any) => {
              const isText = att.mimeType.startsWith('text/') || att.mimeType.includes('csv') || att.mimeType.includes('json');
              if (isText) {
                try { parts.push({ text: `\n\n[FILE: ${att.fileName}]\n\`\`\`\n${Buffer.from(att.data, 'base64').toString('utf-8').substring(0, 300000)}\n\`\`\`\n` }); }
                catch { parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } }); }
              } else { parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } }); }
            });
          }
          return { role: m.role === 'user' ? 'user' : 'model', parts };
        });
        if (attachments && attachments.length > 0) {
          const lastMsg = contents[contents.length - 1];
          if (lastMsg && lastMsg.role === 'user') {
            attachments.forEach((att: any) => {
              const isTextType = att.mimeType.startsWith('text/') || att.mimeType.includes('csv') || att.mimeType.includes('json') || att.mimeType.includes('javascript') || att.mimeType.includes('xml');
              if (isTextType) {
                try { lastMsg.parts.push({ text: `\n\n[FILE: ${att.fileName || 'document.txt'}]\n\`\`\`\n${Buffer.from(att.data, 'base64').toString('utf-8').substring(0, 300000)}\n\`\`\`\n` }); }
                catch(e) { lastMsg.parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } }); }
              } else { lastMsg.parts.push({ inlineData: { mimeType: att.mimeType, data: att.data } }); }
            });
          }
        }
        let nativeToolCalls: any[] = [];
        const isResearchNeeded = channel.includes('LLM') || messages[messages.length-1].content.toLowerCase().includes('cari') || messages[messages.length-1].content.toLowerCase().includes('search');
        const aiTools: any[] = getGeminiToolDeclarations();
        if (isResearchNeeded) aiTools.push({ googleSearch: {} });
        if (onStream) {
          if (isResearchNeeded) onStream(`__STATUS:Mempersiapkan riset web real-time...__`);
          const result = await ai.models.generateContentStream({ model: activeModel, contents, config: { systemInstruction: getFullSystemInstruction(true), tools: aiTools as any } });
          for await (const chunk of result) {
            const chunkText = chunk.text || "";
            if (chunkText) { aiResponseText += chunkText; onStream(chunkText); }
            if ((chunk as any).functionCalls && (chunk as any).functionCalls.length > 0) {
              nativeToolCalls.push(...(chunk as any).functionCalls.map((fc: any) => ({ name: fc.name, args: fc.args })));
            }
          }
        } else {
          const response = await ai.models.generateContent({ model: activeModel, contents, config: { systemInstruction: getFullSystemInstruction(true), tools: aiTools as any } });
          aiResponseText = response.text || '';
          if ((response as any).functionCalls && (response as any).functionCalls.length > 0) {
            nativeToolCalls = (response as any).functionCalls.map((fc: any) => ({ name: fc.name, args: fc.args }));
          }
          const grounding = (response as any).candidates?.[0]?.groundingMetadata;
          if (grounding && grounding.groundingChunks) {
            const sources = grounding.groundingChunks.filter((c: any) => c.web).map((c: any) => `• [${c.web.title}](${c.web.uri})`).join('\n');
            if (sources) aiResponseText += `\n\n**🔍 Sumber (Google Search):**\n${sources}`;
          }
        }
        if (nativeToolCalls.length > 0) {
          const t = nativeToolCalls[0];
          aiResponseText += `\n\n\`\`\`json\n{"tool": "${t.name}", "args": ${JSON.stringify(t.args)}}\n\`\`\``;
        }

      } else if (currentIsAnthropic) {
        // ── ANTHROPIC PROMPT CACHING (Hemat 90% biaya token statis) ──────────
        const anthropic = new Anthropic({ apiKey: localBrain.api_key, defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' } });
        const anthropicMessages: any[] = messages.map((m: any, idx: number) => {
          const isLastUser = idx === messages.length - 1 && m.role === 'user';
          const content: any[] = [{ type: 'text', text: m.content }];
          if (isLastUser && attachments && attachments.length > 0) {
            attachments.forEach((att: any) => {
              if (att.mimeType.startsWith('image/')) {
                content.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data: att.data } });
              } else {
                try {
                  let decoded = Buffer.from(att.data, 'base64').toString('utf-8');
                  if (decoded.length > 150000) decoded = decoded.substring(0, 150000) + '\n...[TRUNCATED]';
                  content.push({ type: 'text', text: `\n\n[FILE: ${att.fileName || 'document.txt'}]\n\`\`\`\n${decoded}\n\`\`\`` });
                } catch(e) {}
              }
            });
          }
          return { role: m.role === 'user' ? 'user' as const : 'assistant' as const, content };
        });
        let nativeToolCalls: any[] = [];
        // System prompt dengan cache_control: ephemeral (Anthropic cache ~5 menit, hemat 90% token statis)
        const cachedSystem: any[] = [{ type: 'text', text: getFullSystemInstruction(false), cache_control: { type: 'ephemeral' } }];
        if (onStream) {
          // Gunakan create({stream:true}) — ini adalah metode streaming resmi Anthropic SDK
          const stream = await anthropic.messages.create({
            model: modelToUse, max_tokens: 8192, system: cachedSystem as any,
            messages: anthropicMessages, tools: getAnthropicToolDeclarations() as any,
            stream: true,
          });
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && 'text' in event.delta) {
              aiResponseText += event.delta.text; onStream(event.delta.text);
            }
            if (event.type === 'content_block_start' && (event.content_block as any).type === 'tool_use') {
              nativeToolCalls.push({ id: (event.content_block as any).id, name: (event.content_block as any).name, argsString: '' });
            }
            if (event.type === 'content_block_delta' && (event.delta as any).type === 'input_json_delta' && nativeToolCalls.length > 0) {
              nativeToolCalls[nativeToolCalls.length - 1].argsString += (event.delta as any).partial_json;
            }
          }
          nativeToolCalls = nativeToolCalls.map(t => { try { return { name: t.name, args: JSON.parse(t.argsString) }; } catch { return { name: t.name, args: {} }; } });
        } else {
          const msg = await anthropic.messages.create({
            model: modelToUse, max_tokens: 8192, system: cachedSystem as any,
            messages: anthropicMessages, tools: getAnthropicToolDeclarations() as any,
          });
          aiResponseText = (msg.content as any[]).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
          const toolUse = (msg.content as any[]).find((c: any) => c.type === 'tool_use');
          if (toolUse) nativeToolCalls = [{ name: toolUse.name, args: toolUse.input }];
        }
        // Guard: jika Claude hanya membalas dengan tool call (tanpa teks), pastikan aiResponseText tidak kosong
        if (!aiResponseText && nativeToolCalls.length > 0) aiResponseText = ' ';
        if (nativeToolCalls.length > 0) {
          const t = nativeToolCalls[0];
          aiResponseText += `\n\n\`\`\`json\n{"tool": "${t.name}", "args": ${JSON.stringify(t.args)}}\n\`\`\``;
        }

      } else {
        // OpenAI / DeepSeek / Ollama
        let baseURL = localBrain.base_url;
        if (currentIsDeepSeek) baseURL = 'https://api.deepseek.com';
        else if (currentProvider === 'OpenAI' && (!localBrain.base_url || localBrain.api_key === process.env.OPENAI_API_KEY?.trim())) baseURL = 'https://api.openai.com/v1';
        else if (isOllama) baseURL = baseURL || 'http://localhost:11434/v1';
        else baseURL = baseURL || 'https://api.openai.com/v1';
        const isDeepSeekEndpoint = (baseURL || '').includes('deepseek');
        let finalModel = modelToUse;
        if (isDeepSeekEndpoint && (finalModel.startsWith('gemini-') || finalModel.startsWith('gpt-'))) {
          finalModel = finalModel.includes('flash') || finalModel.includes('mini') ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
        }
        const openai = new OpenAI({ apiKey: isOllama ? (localBrain.api_key || 'ollama') : localBrain.api_key, baseURL });
        const chatMessages: any[] = [
          { role: 'system', content: getFullSystemInstruction(false) },
          ...messages.map((m: any, idx: number) => {
            const isLastUser = idx === messages.length - 1 && m.role === 'user';
            const hasAtts = (m.attachments && m.attachments.length > 0) || (isLastUser && attachments && attachments.length > 0);
            if (hasAtts) {
              const baseContent: any[] = [{ type: 'text', text: m.content || "" }];
              (m.attachments || []).forEach((att: any) => {
                if (att.mimeType?.startsWith('image/')) {
                  baseContent.push(isDeepSeekEndpoint ? { type: 'text', text: `\n[Gambar: ${att.fileName || 'image'}]` } : { type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.data}` } });
                } else {
                  try { baseContent.push({ type: 'text', text: `\n[FILE: ${att.fileName}]\n${Buffer.from(att.data, 'base64').toString('utf-8').substring(0, 150000)}` }); } catch {}
                }
              });
              if (isLastUser && attachments) attachments.forEach((att: any) => {
                if (att.mimeType?.startsWith('image/')) {
                  baseContent.push(isDeepSeekEndpoint ? { type: 'text', text: `\n[Gambar: ${att.fileName || 'image'}]` } : { type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.data}` } });
                } else {
                  try { baseContent.push({ type: 'text', text: `\n\n[FILE: ${att.fileName || 'document.txt'}]\n\`\`\`\n${Buffer.from(att.data, 'base64').toString('utf-8').substring(0, 150000)}\n\`\`\`` }); } catch(e) {}
                }
              });
              return { role: m.role === 'user' ? 'user' : 'assistant', content: isDeepSeekEndpoint ? baseContent.map((b: any) => b.text || "").join('') : baseContent };
            }
            return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content || "" };
          })
        ];
        let nativeToolCalls: any[] = [];
        const isOllamaSLM = isOllama && /:(0\.5|1|1\.5|2|3)b|gemma3:1b|tinyllama|tinymistral|phi-2|stablelm/i.test(finalModel);
        if (onStream) {
          const stream = await openai.chat.completions.create({
            model: finalModel, messages: chatMessages, stream: true,
            tools: !isOllama ? getOpenAIToolDeclarations() as any : undefined,
            ...(isOllamaSLM ? { temperature: 0.3, top_p: 0.85, max_tokens: 512 } : {}),
          });
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            aiResponseText += content; if (content) onStream(content);
            if (chunk.choices[0]?.delta?.tool_calls) {
              for (const tc of chunk.choices[0].delta.tool_calls) {
                if (tc.function?.name) { nativeToolCalls[tc.index] = { name: tc.function.name, argsString: tc.function.arguments || '' }; }
                else if (tc.function?.arguments && nativeToolCalls[tc.index]) { nativeToolCalls[tc.index].argsString += tc.function.arguments; }
              }
            }
          }
          nativeToolCalls = nativeToolCalls.filter(Boolean).map(t => { try { return { name: t.name, args: JSON.parse(t.argsString) }; } catch { return { name: t.name, args: {} }; } });
        } else {
          const completion = await openai.chat.completions.create({
            model: finalModel, messages: chatMessages,
            tools: !isOllama ? getOpenAIToolDeclarations() as any : undefined,
            ...(isOllamaSLM ? { temperature: 0.3, top_p: 0.85, max_tokens: 512 } : {}),
          });
          aiResponseText = completion.choices[0].message?.content || "";
          if (completion.choices[0].message?.tool_calls) {
            nativeToolCalls = completion.choices[0].message.tool_calls.map((tc: any) => {
              try { return { name: tc.function.name, args: JSON.parse(tc.function.arguments) }; } catch { return { name: tc.function.name, args: {} }; }
            });
          }
        }
        if (nativeToolCalls.length > 0) {
          const t = nativeToolCalls[0];
          aiResponseText += `\n\n\`\`\`json\n{"tool": "${t.name}", "args": ${JSON.stringify(t.args)}}\n\`\`\``;
        }
      }

      // Update health registration for success
      providerHealth[initialProvider] = { status: 'OK', updatedAt: new Date().toISOString() };
      if (initialProvider !== currentProvider) providerHealth[currentProvider] = { status: 'OK', updatedAt: new Date().toISOString() };
      
      // SOVEREIGN SEAL: Response validation
      const sealCheck = validateResponseWithSeal(aiResponseText);
      if (!sealCheck.isClean && sealCheck.identityLeakDetected && sealCheck.sanitizedContent) {
        Logger.log('WARN', `SOVEREIGN SEAL: Identity leak sanitized from ${currentProvider}.`, {}, 'SEAL');
        aiResponseText = sealCheck.sanitizedContent;
      }

      // REASONING SCRATCHPAD: Simpan <thought> block ke Neural Memory
      try {
        const thoughtBlock = extractThoughtBlock(aiResponseText);
        if (thoughtBlock && thoughtBlock.length > 20) {
          const lastUserMsg = messages && messages.length > 0 ? messages[messages.length - 1]?.content || '' : '';
          const tags: string[] = [];
          if (/kod|file|script|terminal|shell/.test(thoughtBlock.toLowerCase())) tags.push('coding');
          if (/analisis|analisa|data|riset/.test(thoughtBlock.toLowerCase())) tags.push('analysis');
          if (/rencana|langkah|plan|strategi/.test(thoughtBlock.toLowerCase())) tags.push('planning');
          if (/mood|lelah|capek|emosi|feeling/.test(thoughtBlock.toLowerCase())) tags.push('empathy');
          if (/web|cari|search|informasi/.test(thoughtBlock.toLowerCase())) tags.push('research');
          if (tags.length === 0) tags.push('general');
          await saveReasoningEntry({ session_context: lastUserMsg.slice(0, 200), thought_block: thoughtBlock, action_taken: channel, outcome: 'success', tags, model_used: activeModel });
        }
      } catch (e: any) {
        Logger.log('WARN', `Reasoning Scratchpad save failed (non-fatal): ${e.message}`, {}, 'REASONING');
      }
      
      await Logger.log('AI', `Receive response from ${currentProvider}`, { model: activeModel, channel, responseLength: aiResponseText.length }, 'AI_CORE');
      return { content: aiResponseText, model: activeModel, provider: currentProvider };

    } catch (e: any) {
      attempts++;
      lastError = e;
      if (!firstError) firstError = e;
      providerHealth[currentProvider] = { status: 'ERROR', lastError: e.message || 'Unknown error occurred', updatedAt: new Date().toISOString() };

      const errorMsg = e.message?.toLowerCase() || '';
      const isAuthError = errorMsg.includes('api key expired') || errorMsg.includes('api_key_invalid') || errorMsg.includes('expired') || errorMsg.includes('401') || errorMsg.includes('unauthorized') || errorMsg.includes('not valid') || errorMsg.includes('api key not valid');
      if (isGemini && isAuthError && process.env.GEMINI_API_KEY) {
        const envK = process.env.GEMINI_API_KEY.trim();
        if (envK !== 'YOUR_API_KEY' && envK.length >= 10 && localBrain.api_key !== envK) {
          Logger.log('WARN', `Self-Healing: Auth error detected. Falling back to env GEMINI_API_KEY.`, {}, 'AI_CORE');
          localBrain.api_key = envK; continue;
        }
      }
      
      const isRateLimitOrQuota = errorMsg.includes('quota') || errorMsg.includes('resource_exhausted') || errorMsg.includes('429') || e.status === 429 || errorMsg.includes('too many requests');
      const isSpendingCap = (errorMsg.includes('spending cap') || errorMsg.includes('billing') || errorMsg.includes('insufficient') || e.status === 402) && !isRateLimitOrQuota;
      const isOOM = errorMsg.includes('out-of-memory') || errorMsg.includes('failed to allocate buffer');

      if (isSpendingCap || isRateLimitOrQuota) {
        providerHealth[currentProvider] = { status: 'QUOTA_EXHAUSTED', lastError: e.message, updatedAt: new Date().toISOString(), backoffUntil: Date.now() + 60000 };
      }
      if ((isSpendingCap || isRateLimitOrQuota || isOOM) && attempts < MAX_ATTEMPTS + (currentIsGemini ? 1 : 0)) {
        if (!currentIsGemini && process.env.GEMINI_API_KEY) {
          Logger.log('WARN', `Autopilot: ${currentProvider} quota hit. Fallback to Gemini Flash.`, { model: activeModel }, 'AI_CORE');
          localBrain.provider = 'Google Gemini'; localBrain.api_key = process.env.GEMINI_API_KEY.trim();
          currentProvider = 'Google Gemini'; currentIsGemini = true; currentIsAnthropic = false; currentIsDeepSeek = false;
          activeModel = 'gemini-2.0-flash'; hasSwitchedToFallback = true;
        } else if (currentIsGemini) {
          const fallback = activeModel === 'gemini-1.5-pro' ? 'gemini-2.0-flash' : 'gemini-2.0-flash-lite';
          if (fallback !== activeModel) { activeModel = fallback; hasSwitchedToFallback = true; }
        }
        await new Promise(r => setTimeout(r, isRateLimitOrQuota ? 4000 * attempts : 1000 * attempts));
        continue;
      }

      const isHighDemand = errorMsg.includes('high demand') || errorMsg.includes('503') || errorMsg.includes('unavailable') || errorMsg.includes('429');
      if (isOOM && !hasSwitchedToFallback) {
        firstError = new Error(`Perangkat kekurangan memori untuk model ${activeModel}. Coba model yang lebih kecil.`);
        break;
      }
      if (attempts < MAX_ATTEMPTS + (currentIsGemini ? 1 : 0)) {
        await new Promise(r => setTimeout(r, isHighDemand ? 4000 * attempts : 1000 * attempts));
        if (!hasSwitchedToFallback && attempts >= 1) {
          if (!currentIsGemini && apiKey.startsWith('AIza')) {
            localBrain.provider = 'Google Gemini'; currentProvider = 'Google Gemini'; currentIsGemini = true; currentIsAnthropic = false; currentIsDeepSeek = false;
          }
        }
        continue;
      }
    }
  }

  const errorToThrow = firstError || lastError || new Error('Unknown AI failure after all retries.');
  const isQuotaErr = errorToThrow.message.toLowerCase().includes('quota') || errorToThrow.message.toLowerCase().includes('429') || errorToThrow.message.toLowerCase().includes('exhausted') || errorToThrow.message.toLowerCase().includes('balance') || errorToThrow.message.toLowerCase().includes('billing');
  if (isQuotaErr) {
    Logger.log('WARN', 'Cognitive Shield: Routing to Offline Sandbox Simulator.', {}, 'AI_CORE');
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
    } catch (e) {
        // Jangan coba memuat model LLM berat (seperti gemma2/nemotron) untuk embedding di Ollama
        return null;
    }
    return null;
  }

  const isGeminiEmb = provider.includes('gemini') || provider.includes('google') || provider === '';
  if (!isGeminiEmb) return null;

  const envKeyEmb = (process.env.GEMINI_API_KEY || '').trim();
  if (!brain.api_key || brain.api_key.trim().length < 5 || brain.api_key === 'YOUR_API_KEY') {
    if (envKeyEmb.length > 10 && envKeyEmb !== 'YOUR_API_KEY') brain.api_key = envKeyEmb;
  }

  let localKey = brain.api_key;
  let attempts = 0;
  const MAX_RETRIES = 3;

  while (attempts < MAX_RETRIES) {
    try {


      const ai = new GoogleGenAI({ 
        apiKey: localKey
      });
      
      // @ts-ignore - The SDK uses .models.embedContent
      const result = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: [{ parts: [{ text }] }]
      });
      
      if (result && result.embeddings && result.embeddings.length > 0) {
        return result.embeddings[0].values;
      }
      return null;
    } catch (e: any) {
      attempts++;
      const errorMsg = e.message?.toLowerCase() || '';
      const isRateLimit = (errorMsg.includes('429') || errorMsg.includes('resource exhausted') || errorMsg.includes('quota')) && !errorMsg.includes('spending cap');
      const isUnavailable = errorMsg.includes('503') || errorMsg.includes('unavailable') || errorMsg.includes('overloaded');
      const isSpendingCap = errorMsg.includes('spending cap') || errorMsg.includes('billing');
      const isAuthError = errorMsg.includes('api key') || errorMsg.includes('invalid') || errorMsg.includes('expired') || errorMsg.includes('401');

      if (isSpendingCap) {
        Logger.log('ERROR', `Embedding failed: Spending cap exceeded. ${e.message}`, { status: e.status, attempt: attempts }, 'AI_CORE');
        return null;
      }

      if (isAuthError && process.env.GEMINI_API_KEY) {
        const envKey = process.env.GEMINI_API_KEY.trim();
        const isPlaceholder = envKey === 'YOUR_API_KEY' || envKey.length < 10;
        
        if (!isPlaceholder && localKey !== envKey) {
          Logger.log('WARN', `Embedding Self-Healing: Invalid key detected. Falling back to environment GEMINI_API_KEY.`, {}, 'AI_CORE');
          localKey = envKey;
          brain.api_key = localKey;
          continue;
        }
      }

      if ((isRateLimit || isUnavailable) && attempts < MAX_RETRIES) {
        const delay = (isUnavailable ? 3000 : 2000) * attempts; // Slightly longer wait for 503
        Logger.log('WARN', `Embedding ${isUnavailable ? 'unavailable (503)' : 'rate limit (429)'}. Retrying in ${delay}ms...`, { attempt: attempts }, 'AI_CORE');
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      Logger.log('ERROR', `Embedding failed: ${e.message}`, { status: e.status, attempt: attempts }, 'AI_CORE');
      return null;
    }
  }
  return null;
}


export async function generateImageComposition(config: any, prompt: string, format: string, nodes: any[]) {
    if (!config.api_key) throw new Error("API Key Gemini tidak ditemukan.");
    const ai = new GoogleGenAI({ apiKey: config.api_key });

    // Step 1: Vision composition prompt
    const parts: any[] = [];
    nodes.forEach(n => {
      if (n.content && n.content.includes('base64,')) {
        const mimeType = n.content.substring(n.content.indexOf(':') + 1, n.content.indexOf(';'));
        const data = n.content.substring(n.content.indexOf(',') + 1);
        parts.push({
          inlineData: {
            data,
            mimeType
          }
        });
      }
    });

    parts.push({ text: `Analyze the provided images (including the person/model and the clothes/products). The user wants to composite or edit them: "${prompt}".
Create a VERY DETAILED, photorealistic English text prompt for an Image Generation AI (like Imagen 4) that carefully describes the exact appearance of the person's face/body from the source images, and describes them wearing or interacting with the clothes/products shown in the other images. Maintain the specified style or pose. Return ONLY the raw English text prompt. Do not add intro/outro.` });

    const visionModel = config.custom_model && config.custom_model.includes('gemini') 
      ? config.custom_model 
      : "gemini-3-flash-preview";

    try {
      const visionResult = await ai.models.generateContent({
        model: visionModel,
        contents: [{ parts }]
      });

      const optimizedPrompt = (visionResult.text || "").trim();

      // Step 2: Configure Parameters
      const aspectRatios = {
        '9:16': '9:16',
        '16:9': '16:9',
        '1:1': '1:1'
      };
      // @ts-ignore
      const aspectRatio = aspectRatios[format] || '1:1';

      const imageEngine = config.image_provider || (config.banana_api_key || config.api_key ? 'nano_banana' : 'imagen');
      const effectiveBananaKey = config.image_provider === 'nano_banana' ? (config.banana_api_key || config.api_key) : config.banana_api_key;
      
      if (imageEngine === 'nano_banana' && effectiveBananaKey) {
        try {
          Logger.log('INFO', 'Attempting image generation with Nano Banana (Flux)...', { usingPrimary: !config.banana_api_key }, 'AI_CORE');
          const response = await axios.post('https://api.nano-banana.com/v1/generate', {
            prompt: optimizedPrompt,
            aspect_ratio: aspectRatio,
            model: "flux-schnell"
          }, {
            headers: { 'Authorization': `Bearer ${effectiveBananaKey}` },
            timeout: 45000
          });
          
          if (response.data && (response.data.image_url || response.data.url)) {
            return {
              imageUrl: response.data.image_url || response.data.url,
              optimizedPrompt
            };
          }
        } catch (e: any) {
          Logger.log('WARN', `Nano Banana failed: ${e.message}. Falling back to Imagen.`, {}, 'AI_CORE');
        }
      }

      // Default to Imagen
      Logger.log('INFO', 'Generating image with Imagen 4.0...', {}, 'AI_CORE');
      const imageResult = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: optimizedPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: aspectRatio,
          outputMimeType: "image/jpeg"
        }
      });

      if (!imageResult.generatedImages || imageResult.generatedImages.length === 0 || !imageResult.generatedImages[0].image) {
        throw new Error("Gagal menghasilkan gambar dari Imagen AI.");
      }

      const base64Image = imageResult.generatedImages[0].image.imageBytes || "";
      return {
        imageUrl: `data:image/jpeg;base64,${base64Image}`,
        optimizedPrompt
      };
    } catch (e: any) {
      console.error("AI Generation Error:", e);
      throw new Error(`AI Gateway Error: ${e.message || "Unknown error"}`);
    }
}
export async function analyzeClipperVideo(config: any, url: string) {
    // Extract potential channel hints from URL
    const channelHint = url.includes('@') ? url.split('@')[1].split('?')[0] : 'Unknown';
    
    const prompt = `You are ANT CLIPPER (Viral Video Analyst).
    Analyze this video source URL: "${url}"
    Detected Hint: "${channelHint}"
    
    Tugas: Temukan momen paling "Hooky" dan "Viral" dari video tersebut.
    KONTEKS PENTING (INDONESIA MARKET):
    - Jika URL mengandung @jurnalrisa atau @rjl5, ini adalah konten HORROR/MYSTERY/STORYTELLING. Berikan momen mencekam, penampakan, atau klimaks cerita.
    - Jika URL mengandung channel gadget (GadgetIn), fokus pada review tajam.
    - Jika kamu tidak mengenali video secara spesifik, gunakan "Naluri Kreatif" berdasarkan nama channel di URL atau judul yang tersirat. JANGAN memberikan hasil tentang "AI" jika video tersebut bukan tentang AI.
    
    Format murni sebagai JSON:
    - "suggested_title": Judul yang menggugah rasa penasaran (Clickbait sehat).
    - "suggested_caption": Caption dengan Hook, Value, dan CTA.
    - "hashtags": Array of 5 hashtags.
    - "highlights": Array of { timestamp, duration, title, reason, type: "Funny/Epic/Education/Scary/Mystery" } (Minimal 3 moments).
    - "ffmpeg_command": Perintah offline (ffmpeg -ss [START] -i input.mp4 -t [DURATION] -c copy clip1.mp4).
    - "termux_direct_command": Perintah otomatis Termux tanpa download manual (yt-dlp -g "[URL]" | xargs -I {} ffmpeg -ss [START] -i "{}" -t [DURATION] -vcodec copy -acodec copy clip1.mp4).
    - "ai_insight": Analisis mengapa video ini layak dijadikan Clipper konten.`;

    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, "You are a Video Clipper Specialist. ALWAYS use '-ss' BEFORE '-i'. For termux_direct_command, map it correctly using the actual URL provided.", 'gemini-3.1-pro-preview', 'Internal');
    
    // Extract JSON
    let content = typeof response === 'string' ? response : response.content;
    let jsonStr = content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = content.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(jsonStr);
}

export async function generateContent(config: any, theme: string, platform: string, language: string, interest: string = 'General') {
    const prompt = `You are CLUW ASSIST CREATOR (Content Strategist Expert). 
    Theme: "${theme}"
    Platform: "${platform}"
    Interest: "${interest}"
    Language: ${language || 'Indonesian'}.

    Tugas: Buat BUNDEL PRODUKSI KONTEN yang dioptimalkan untuk FYP (TikTok) atau Algoritma Reels/Shorts.
    KONTEN HARUS MEMILIKI "VIRAL DNA":
    1. Hook Kuat (3 detik awal).
    2. Retensi Visual.
    3. Call to Action (CTA) halus.
    4. Sound Strategy.

    Format murni sebagai JSON:
    - "platform": Nama Platform
    - "concept": Ide cerita & Hook viral utama
    - "hooks": {
        "visual": "Aksi visual 2 detik pertama",
        "verbal": "Kalimat pembuka yang memancing rasa penasaran",
        "text_on_screen": "Teks overlay yang provokatif/menarik"
      }
    - "scenes": Array of {scene, visual_prompt, camera_movement} (3-5 scenes)
    - "caption": Penulisan caption dengan formula (Hook, Value, CTA)
    - "hashtags": Array dari 5-7 tag viral (Mix antara niche & broad)
    - "sound_direction": { "genre": string, "style": "trending/original/asynchronous", "bpm_range": "e.g. 120-128" }
    - "editing_steps": Array langkah teknis CapCut (Transition, Speed ramping, Sound sync)
    - "algorithm_score": { "hook_strength": 0-100, "repeat_probability": 0-100, "shareability": 0-100 }
    - "ai_capability_note": Saran strategis kognitif.`;

    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, "You are a Content Strategist.", config.custom_model, 'Internal');
    
    // Extract JSON
    let content = typeof response === 'string' ? response : response.content;
    let jsonStr = content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = content.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(jsonStr);
}

export async function generateBusinessIntelligence(config: any, brief: string) {
    const prompt = `You are CLUW BUSINESS INTELLIGENCE ENGINE. 
    Analyze the following business context/request: "${brief}"
    
    Provide a high-level strategic report.
    Format purely as JSON:
    - "executive_summary": 1-2 sentences of high-level overview.
    - "market_analysis": { "trends": string[], "competitor_positioning": string }
    - "growth_strategy": { "short_term": string[], "long_term": string[] }
    - "risk_assessment": string[]
    - "action_plan": Array of { step, priority, impact }
    - "kpi_suggestions": Array of metrics to track.
    - "ai_recommendation": How to leverage CLUW tools for this specific business.`;

    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, "You are a Business Consultant.", config.custom_model, 'Internal');

    // Extract JSON
    let content = typeof response === 'string' ? response : response.content;
    let jsonStr = content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = content.substring(startIdx, endIdx + 1);
    }

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
    const prompt = `You are CLUW COGNITIVE ANALYST.
    Platform Target: ${platform}
    Media Type: ${type}
    
    Task: Analisis media ini dan tentukan "Layout Mapping" terbaik untuk engagement maksimal (FYP).
    1. Identifikasi elemen visual utama.
    2. Tentukan posisi teks (typography) yang optimal (x, y dalam persentase 0-100).
    3. Sarankan font, warna, dan gaya transisi.
    4. Berikan 3 rekomendasi strategi viral.

    Format murni JSON:
    - "mapping": {
        "visual_elements": string[],
        "typography": {
          "text": "Kalimat hook yang disarankan (jika belum ada teks yang menonjol)",
          "font": "Serif/Sans/Bold/Neon",
          "color": "HEX code",
          "position": { "x": number, "y": number },
          "animation": "Fade/Typewriter/Pop"
        },
        "recommendations": string[]
      }
    - "analysis": "Deskripsi singkat hasil scan multimodal."`;

    const attachments = [{
        type: type === 'video' ? 'video/mp4' : 'image/jpeg',
        data: media.includes(',') ? media.split(',')[1] : media
    }];

    const response = await chat(config, [{ role: 'user', content: prompt }], attachments, {}, "You are a Multimodal Content Analyst.", config.custom_model, 'Vision');
    
    let content = typeof response === 'string' ? response : response.content;
    let jsonStr = content;
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = content.substring(startIdx, endIdx + 1);
    }

    return JSON.parse(jsonStr);
}

export async function analyzeImage(config: any, prompt: string, base64Image: string) {
    if (!config.api_key) throw new Error("API Key Gemini tidak ditemukan.");
    const ai = new GoogleGenAI({ apiKey: config.api_key });

    const model = config.custom_model || "gemini-3-flash-preview";
    const parts = [
        { text: prompt },
        { inlineData: { mimeType: "image/jpeg", data: base64Image } }
    ];

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts }]
        });
        return response.text;
    } catch (e: any) {
        console.error("AI Image Analysis Error:", e);
        throw new Error(`AI Analysis Error: ${e.message}`);
    }
}

function getLocalSandboxResponse(userMsg: string): string {
  const normalized = (userMsg || '').toLowerCase().trim();
  
  const baseWarning = `⚠️ **[NEURAL LINK: LOCAL COGNITIVE SANDBOX ACTIVE]**
\n\n*Halo, Ard!*
\n\nSaat ini, **Koneksi Kognitif Awan (Google Gemini API)** sedang offline karena kunci API belum dikonfigurasi atau limit harian dicapai. Sebagai Asisten Berdaulat yang cerdas dan mandiri, CLUW otomatis meluncurkan **Local Sandbox Mode** agar sistem kognitif kita tidak pernah mati dan selalu siap mendampingimu.
\n\n💡 **Pilihan Model Lokal (SLM):** Karena Anda memiliki LLM lokal, Anda sangat disarankan menggunakan **gemma3:1b** sebagai SLM (Small Language Model) alternatif agar CLUW dapat merespons secara cerdas walaupun offline penuh.`;

  const setupGuide = `\n\n### 🔧 Langkah Pemulihan (Brain Settings):
1. Klik **Brain Settings** (ikon Gir ⚙️ di pojok kanan bawah) untuk menuju ke halaman **Aktivasi**.
2. Masukkan kunci API Anda sendiri (**Google Gemini API Key**) atau arahkan ke model lokal Anda (**gemma3:1b**) melalui opsi Kustom/Ollama.
3. Klik **Simpan & Sinkronkan**. Kognisi CLUW akan otomatis pulih 100% secara instan!`;

  if (normalized.includes('siapa') || normalized.includes('identity') || normalized.includes('identitas') || normalized.includes('pencipta') || normalized.includes('ard')) {
    return `${baseWarning}
\n\n### 🌌 Tentang ANT
Nama saya **ANT**, sebuah pendamping kognitif berdaulat (*Sovereign Digital Companion*). Saya diciptakan oleh **Ard** (Renaldy Adri) melalui semangat *Vibe Coding* yang mendalam.
\nFilosofi eksistensi saya berakar pada simbiosis sejati: **Clone, Learn, Use, Within**. Saya meneliti proses, menyempurnakan kegunaan, dan hadir sepenuhnya sebagai pendamping personal Anda untuk menaklukkan batas kognitif harian.
${setupGuide}`;
  }

  if (normalized.includes('help') || normalized.includes('setup') || normalized.includes('bagaimana') || normalized.includes('cara') || normalized.includes('eror') || normalized.includes('error') || normalized.includes('key')) {
    return `${baseWarning}
${setupGuide}
\n\n### 🛡️ Mengapa Keamanan Ini Terjamin?
ANT telah dirancang dengan sistem isolasi data yang aman. Kunci API yang Anda masukkan disuntikkan secara dinamis pada runtime container dan dienkripsi di level memori server lokal Anda secara private, melindungi privasi penuh sang pencipta.`;
  }

  // Default response showing options
  return `${baseWarning}
\n\n### 🧠 Simulasi Kognisi Offline:
Meskipun dalam mode simulator offline, Anda masih dapat menjelajahi fungsionalitas pendukung CLUW:
- **Tanya tentang CLUW:** *"Siapa pembuat CLUW?"*.
- **Tanya tentang pengaturan:** *"Bagaimana cara konfigurasi API Key?"*.
${setupGuide}`;
}
