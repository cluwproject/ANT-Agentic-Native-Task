import OpenAI from 'openai';
import { getOpenAIToolDeclarations } from '../../tools_schema.js';

export async function callOpenAICompatible(
  apiKey: string,
  baseURL: string,
  model: string,
  messages: any[],
  attachments: any[],
  systemInstruction: string,
  isOllama = false,
  onStream?: (token: string) => void
): Promise<{ text: string; nativeToolCalls: any[] }> {
  const isDeepSeekEndpoint = (baseURL || '').includes('deepseek');
  let finalModel = model;
  if (isDeepSeekEndpoint && (finalModel.startsWith('gemini-') || finalModel.startsWith('gpt-'))) {
    finalModel = finalModel.includes('flash') || finalModel.includes('mini') ? 'deepseek-v4-flash' : 'deepseek-v4-pro';
  }

  const openai = new OpenAI({ apiKey: isOllama ? (apiKey || 'ollama') : apiKey, baseURL });
  const chatMessages: any[] = [
    { role: 'system', content: systemInstruction },
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
  let aiResponseText = '';

  if (onStream) {
    const stream: any = await openai.chat.completions.create({
      model: finalModel, messages: chatMessages, stream: true,
      tools: !isOllama ? getOpenAIToolDeclarations() as any : undefined,
      ...(isOllamaSLM ? { temperature: 0.3, top_p: 0.85, max_tokens: 512 } : {}),
      ...(isOllama ? { keep_alive: 0 } : {})
    } as any);
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
      ...(isOllama ? { keep_alive: 0 } : {})
    } as any);
    aiResponseText = completion.choices[0].message?.content || "";
    if (completion.choices[0].message?.tool_calls) {
      nativeToolCalls = completion.choices[0].message.tool_calls.map((tc: any) => {
        try { return { name: tc.function.name, args: JSON.parse(tc.function.arguments) }; } catch { return { name: tc.function.name, args: {} }; }
      });
    }
  }

  return { text: aiResponseText, nativeToolCalls };
}
