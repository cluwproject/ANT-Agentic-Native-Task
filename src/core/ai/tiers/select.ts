import { Logger } from '../../../utils/logger.js';
import { semanticSearch } from '../../memory.js';

export async function analyzeComplexity(brain: any, prompt: string, attachments?: any[]): Promise<{ tier: 'SLM' | 'LLM', reason: string }> {
  return { tier: 'LLM', reason: 'Sticky Mode: Dynamic swapping disabled.' };
}

export function filterSensitiveData(text: string): { clean: string, isSensitive: boolean } {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRegex = /(\+62|08)[0-9]{8,12}/g;
  
  let clean = text;
  let isSensitive = false;

  if (emailRegex.test(text)) {
    clean = clean.replace(emailRegex, '[EMAIL]');
    isSensitive = true;
  }
  if (phoneRegex.test(text)) {
    clean = clean.replace(phoneRegex, '[PHONE]');
    isSensitive = true;
  }

  return { clean, isSensitive };
}

export async function checkSemanticCache(query: string): Promise<string | null> {
  try {
    const results = await semanticSearch(query, 'semantic', 1);
    if (results.length > 0 && results[0].score > 0.92) {
      Logger.log('INFO', `Semantic Cache Hit: ${results[0].key}`, { score: results[0].score }, 'CACHE');
      return results[0].data;
    }
  } catch (e) {}
  return null;
}
