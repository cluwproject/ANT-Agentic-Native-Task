import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicToolDeclarations } from '../../tools_schema.js';

export async function callAnthropic(
  apiKey: string,
  model: string,
  messages: any[],
  attachments: any[],
  systemInstruction: string,
  onStream?: (token: string) => void
): Promise<{ text: string; nativeToolCalls: any[] }> {
  const anthropic = new Anthropic({ apiKey, defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' } });
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
  const cachedSystem: any[] = [{ type: 'text', text: systemInstruction, cache_control: { type: 'ephemeral' } }];
  let aiResponseText = '';

  if (onStream) {
    const stream = await anthropic.messages.create({
      model, max_tokens: 8192, system: cachedSystem as any,
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
      model, max_tokens: 8192, system: cachedSystem as any,
      messages: anthropicMessages, tools: getAnthropicToolDeclarations() as any,
    });
    aiResponseText = (msg.content as any[]).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    const toolUse = (msg.content as any[]).find((c: any) => c.type === 'tool_use');
    if (toolUse) nativeToolCalls = [{ name: toolUse.name, args: toolUse.input }];
  }

  if (!aiResponseText && nativeToolCalls.length > 0) aiResponseText = ' ';

  return { text: aiResponseText, nativeToolCalls };
}
