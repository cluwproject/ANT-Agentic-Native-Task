import { GoogleGenAI } from '@google/genai';
import { getGeminiToolDeclarations } from '../../tools_schema.js';

export async function callGemini(
  apiKey: string,
  model: string,
  messages: any[],
  attachments: any[],
  systemInstruction: string,
  channel: string,
  onStream?: (token: string) => void
): Promise<{ text: string; nativeToolCalls: any[] }> {
  if (!apiKey || apiKey.trim().length < 5) {
    throw new Error("API Key Gemini tidak ditemukan atau belum dikonfigurasi.");
  }
  const ai = new GoogleGenAI({ apiKey });
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
  const lastContent = messages[messages.length - 1]?.content || '';
  const isResearchNeeded = channel.includes('LLM') || lastContent.toLowerCase().includes('cari') || lastContent.toLowerCase().includes('search');
  const aiTools: any[] = getGeminiToolDeclarations();
  if (isResearchNeeded) aiTools.push({ googleSearch: {} });

  let aiResponseText = '';

  if (onStream) {
    if (isResearchNeeded) onStream(`__STATUS:Mempersiapkan riset web real-time...__`);
    const result = await ai.models.generateContentStream({
      model,
      contents,
      config: { systemInstruction, tools: aiTools as any }
    });
    for await (const chunk of result) {
      const chunkText = chunk.text || "";
      if (chunkText) { aiResponseText += chunkText; onStream(chunkText); }
      if ((chunk as any).functionCalls && (chunk as any).functionCalls.length > 0) {
        nativeToolCalls.push(...(chunk as any).functionCalls.map((fc: any) => ({ name: fc.name, args: fc.args })));
      }
    }
  } else {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction, tools: aiTools as any }
    });
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

  return { text: aiResponseText, nativeToolCalls };
}
