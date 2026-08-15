import { chat } from '../index.js';
import { Logger } from '../../../utils/logger.js';
import { semanticSearch } from '../../memory.js';
import { ANT_Bus } from '../../events.js';
import { handleSLMTier } from './slm.js';
import { filterSensitiveData } from './select.js';

export async function tieredChat(
  brain: any,
  messages: any[],
  attachments: any[],
  uiContext: any,
  systemInstruction: string,
  modelOverride?: string,
  onStream?: (token: string) => void
): Promise<{content: string, metadata: any}> {
  const providerLower = (brain.provider || process.env.AI_PROVIDER || '').toLowerCase();
  const modelNameLower = (brain.custom_model || '').toLowerCase();
  const isOllama = providerLower.includes('ollama') || (brain.base_url && brain.base_url.includes('11434')) || process.env.AI_PROVIDER === 'ollama';
  const isSmallLocalModel = isOllama && (
    modelNameLower.includes(':0.5b') ||
    modelNameLower.includes(':1b') ||
    modelNameLower.includes('gemma3:1b') ||
    modelNameLower.includes(':1.5b') ||
    modelNameLower.includes(':2b') ||
    modelNameLower.includes(':3b') ||
    modelNameLower.includes('tinyllama') ||
    modelNameLower.includes('tinymistral') ||
    modelNameLower.includes('phi-2') ||
    modelNameLower.includes('stablelm')
  );

  if (isSmallLocalModel) {
    return handleSLMTier(brain, messages, systemInstruction, onStream);
  }

  if (modelOverride) {
    const response = await chat(brain, messages, attachments, uiContext, systemInstruction, modelOverride, 'Web', onStream);
    const content = typeof response === 'string' ? response : (response as any).content;
    const actualModel = typeof response === 'object' && (response as any)?.model ? (response as any).model : modelOverride;
    const actualProvider = typeof response === 'object' && (response as any)?.provider ? (response as any).provider : (brain.provider || 'Google Gemini');
    return {
      content,
      metadata: { 
        tier: 'MANUAL', 
        model: actualModel, 
        provider: actualProvider, 
        reason: 'User forced specific model.' 
      }
    };
  }

  const lastMessage = messages[messages.length - 1].content;
  
  if (onStream) onStream('__STATUS:Mengakses Neural Memory (RAG Context)...__');
  ANT_Bus.emit('reasoning_stream', { step: 'perceive', message: 'Scanning Neural Memory for context.', source: 'TieredAI', details: { query: lastMessage } });
  const relatedMemories = await semanticSearch(lastMessage, 'semantic', 5);
  
  const cacheHit = relatedMemories.find(m => m.score > 0.98);
  if (cacheHit && !attachments?.length && !lastMessage.startsWith('/')) {
    ANT_Bus.emit('reasoning_stream', { step: 'finalize', message: 'Absolute cache match found. Skipping deep reasoning.', source: 'TieredAI' });
    if (onStream) onStream('__STATUS:Kecocokan absolut ditemukan di Neural Memory...__');
    if (onStream) onStream('__STATUS:Menyajikan hasil cache instan...__');
    return {
      content: cacheHit.data,
      metadata: { tier: 'CACHE', model: 'Semantic Memory', reason: 'High confidence semantic match.' }
    };
  }

  const relevantContext = relatedMemories
    .filter(m => m.score > 0.70)
    .map(m => `- [Ref]: ${m.data}`)
    .join('\n');

  let enrichedSystemInstruction = systemInstruction;
  if (relevantContext) {
    enrichedSystemInstruction += `\n\n[NEURAL MEMORY & CONTEXT]\nHubungan data masa lalu untuk personalisasi kognitif:\n${relevantContext}`;
  }

  if (onStream) onStream('__STATUS:Memastikan Jalur Kognitif (Sticky Mode)...__');
  ANT_Bus.emit('reasoning_stream', { step: 'analyze', message: 'Sticky Mode active. Bypassing complexity analysis.', source: 'TieredAI' });
  
  if (onStream) onStream('__STATUS:Deep Scan (Privacy & Security Guard)...__');
  ANT_Bus.emit('reasoning_stream', { step: 'analyze', message: 'Scanning for sensitive/PII data.', source: 'TieredAI' });
  filterSensitiveData(lastMessage);
  
  if (onStream) onStream('__STATUS:Mengarahkan ke Core Pakar (Depth Reasoning)...__');

  let modelToUse = 'gemini-2.0-flash';
  const provider = brain.provider || 'Google Gemini';
  const apiKey = (brain.api_key || '').trim();
  const isDeepSeek = !isOllama && (providerLower.includes('deepseek') || (brain.base_url && brain.base_url.toLowerCase().includes('deepseek')) || modelNameLower.includes('deepseek'));
  const isOpenAI = !isOllama && (providerLower.includes('openai') || modelNameLower === 'gpt-4o' || modelNameLower === 'gpt-4' || modelNameLower.startsWith('gpt-3.5') || modelNameLower.startsWith('o1') || modelNameLower.startsWith('o3'));
  const isAnthropic = !isOllama && (providerLower.includes('anthropic') || providerLower.includes('claude') || modelNameLower.includes('claude'));

  const isFlashModel = (m: string) => m.includes('flash') || m.includes('mini') || m.includes('haiku');
  const customIsFlash = brain.custom_model && isFlashModel(brain.custom_model);
  
  if (isOllama) {
    modelToUse = brain.custom_model || 'llama3.2';
  } else if (isDeepSeek) {
    modelToUse = (customIsFlash || !brain.custom_model) ? 'deepseek-v4-pro' : brain.custom_model;
  } else if (isOpenAI) {
    modelToUse = (customIsFlash || !brain.custom_model) ? 'gpt-4o' : brain.custom_model;
  } else if (isAnthropic) {
    modelToUse = (customIsFlash || !brain.custom_model) ? 'claude-sonnet-4-6' : brain.custom_model;
  } else {
    modelToUse = (customIsFlash || !brain.custom_model) ? 'gemini-2.0-flash' : brain.custom_model;
  }

  const response = await chat(brain, messages, attachments, uiContext, enrichedSystemInstruction, modelToUse, 'Web', onStream);
  const content = typeof response === 'string' ? response : (response as any).content;
  const actualModel = typeof response === 'object' && (response as any)?.model ? (response as any).model : modelToUse;
  const actualProvider = typeof response === 'object' && (response as any)?.provider ? (response as any).provider : (brain.provider || 'Google Gemini');

  return {
    content,
    metadata: {
      tier: 'LLM',
      model: actualModel,
      provider: actualProvider,
      reason: 'Sticky Mode: Single model utilization active.'
    }
  };
}
