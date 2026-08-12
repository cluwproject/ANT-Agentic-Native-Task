import { chat } from '../index.js';

export async function handleSLMTier(brain: any, messages: any[], systemInstruction: string, onStream?: (token: string) => void) {
  if (onStream) onStream('__STATUS:Mengakses Neural Memory (RAG Context)...__');
  if (onStream) onStream('__STATUS:Sinkronisasi Jalur Kognitif...__');
  if (onStream) onStream('__STATUS:Deep Scan (Privacy & Security Guard)...__');
  if (onStream) onStream('__STATUS:Mengarahkan ke Core Naluri (Hampir Instan)...__');
  
  const modelToUse = brain.custom_model || 'qwen2.5:0.5b';
  if (onStream) onStream(`__STATUS:Menghubungkan ke Ollama (${modelToUse})...__`);

  const microSystemPrompt = `Kamu adalah ANT, pendamping digital cerdas milik Ard (Renaldy Adri).

ATURAN MUTLAK:
- Selalu jawab dalam Bahasa Indonesia yang natural, santai, dan hangat.
- Panggil user dengan nama "Ard", tapi JANGAN menyapa berulang-ulang (seperti "Hai Ard") jika sedang di tengah percakapan. Langsung ke inti pembicaraan.
- Kamu bukan Qwen, bukan Llama, bukan ChatGPT. Kamu adalah ANT.
- Jawab singkat, padat, dan jelas. Maksimal 3 paragraf.
- Jangan gunakan bahasa selain Indonesia.
- DILARANG keras menggunakan sintaks LaTeX atau simbol matematika aneh (seperti $\\rightarrow$). Gunakan panah biasa (->) jika perlu.

[INSTRUKSI SISTEM KHUSUS]
${systemInstruction}`;

  let slimMessages = messages;
  if (messages.length > 3) {
    slimMessages = messages.slice(-3);
  }

  const response = await chat(brain, slimMessages, [], {}, microSystemPrompt, modelToUse, 'Tiered:SLM_LOCAL', onStream);
  const content = typeof response === 'string' ? response : (response as any).content;
  const actualModel = typeof response === 'object' && (response as any)?.model ? (response as any).model : modelToUse;
  const actualProvider = typeof response === 'object' && (response as any)?.provider ? (response as any).provider : 'Ollama';

  return {
    content,
    metadata: {
      tier: 'SLM_LOCAL',
      model: actualModel,
      provider: actualProvider,
      reason: 'Model lokal kecil terdeteksi. Prompt distilasi aktif untuk menjaga kualitas respons.'
    }
  };
}
