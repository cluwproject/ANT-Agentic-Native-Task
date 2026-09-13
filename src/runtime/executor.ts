import { randomUUID } from 'crypto';
import { RuntimeEventBus } from './events.js';
import { parseToolCall, nativeCallsToToolCalls } from '../core/agent_loop/toolCallParser.js';
import { executeAction } from '../core/actions/index.js';
import { buildFullSystemInstruction, type BrainState } from '../core/ai/prompts.js';
import { detectProvider } from '../core/ai/router.js';
import type { RuntimeToolCall, Turn, RuntimeOptions, BrainConfig } from './types.js';

/**
 * Jalankan satu task menggunakan agent loop ReAct.
 * Mengembalikan Task object dengan semua turn history.
 */
export async function executeTask(
  prompt: string,
  bus: RuntimeEventBus,
  options: RuntimeOptions = {},
): Promise<{
  id: string;
  prompt: string;
  turns: Turn[];
  finalAnswer: string;
  totalMs: number;
  error: string | null;
}> {
  const taskId = randomUUID().slice(0, 8);
  const maxTurns = options.maxTurns ?? 20;
  const maxToolResultChars = options.maxToolResultChars ?? 4000;
  const autoApprove = options.autoApprove ?? false;
  const startTime = Date.now();

  const turns: Turn[] = [];
  let finalAnswer = '';
  let error: string | null = null;

  // Build brain config
  const brain: BrainConfig = options.brain ?? {};
  if (!brain.api_key) {
    brain.api_key = (
      process.env.OPENAI_API_KEY ||
      process.env.OPENROUTER_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      ''
    ).trim();
  }

  const provider = brain.provider || process.env.AI_PROVIDER || 'Google Gemini';
  const { detectedProvider, isGemini } = detectProvider(
    provider, brain.api_key, brain.base_url, brain.custom_model,
  );

  bus.taskStart(taskId, prompt, 1);

  // Messages array untuk AI
  const messages: Array<{ role: string; content: string }> = [
    { role: 'user', content: prompt },
  ];

  // System instruction
  const systemInstruction = options.systemPrompt ?? 'You are ANT, an agentic coding assistant. Use tools to complete tasks.';
  let fullSystemInst: string;
  try {
    fullSystemInst = await buildFullSystemInstruction(systemInstruction, brain as BrainState, isGemini);
  } catch {
    fullSystemInst = systemInstruction;
  }

  // Import chat dynamically to avoid circular deps
  const { chat } = await import('../core/ai/index.js');

  for (let turnNum = 1; turnNum <= maxTurns; turnNum++) {

    // ── THINK ────────────────────────────────────────────────────────
    bus.taskThink(taskId, turnNum, `Requesting AI response (turn ${turnNum})...`);
    bus.aiRequest(taskId, brain.custom_model || 'default', detectedProvider, turnNum);

    let aiResponse: { content?: string; nativeToolCalls?: unknown[]; model?: string; provider?: string } | string;
    try {
      aiResponse = await chat(
        brain,
        messages,
        [], // attachments
        {}, // uiContext
        fullSystemInst,
        brain.custom_model,
        'Runtime',
        (token: string) => bus.aiToken(taskId, token),
      );
    } catch (e: unknown) {
      const errText = e instanceof Error ? e.message : String(e);
      bus.aiError(taskId, errText, detectedProvider);
      error = `AI request failed: ${errText}`;
      bus.taskError(taskId, turnNum, error, false);
      break;
    }

    const responseText = typeof aiResponse === 'string' ? aiResponse : (aiResponse?.content ?? '');
    const nativeToolCalls = aiResponse?.nativeToolCalls ?? [];

    bus.aiResponse(taskId, responseText, turnNum);

    // Parse tool calls dari response
    const parsed = parseToolCall(responseText);
    const nativeConverted = nativeCallsToToolCalls(nativeToolCalls);
    const allToolCalls: RuntimeToolCall[] = [...nativeConverted, ...parsed.toolCalls];

    // Jika tidak ada tool call → task selesai
    if (allToolCalls.length === 0) {
      finalAnswer = responseText;
      const totalMs = Date.now() - startTime;
      bus.taskComplete(taskId, turnNum, finalAnswer, totalMs);
      return { id: taskId, prompt, turns, finalAnswer, totalMs, error: null };
    }

    // Tambah assistant message
    messages.push({ role: 'assistant', content: responseText });

    // ── ACT & OBSERVE ────────────────────────────────────────────────
    for (const toolCall of allToolCalls) {
      bus.taskAct(taskId, turnNum, toolCall.tool, toolCall.args);
      bus.toolStart(taskId, toolCall.tool, toolCall.args, turnNum);

      const toolStart = Date.now();
      let toolResult: string;
      let toolSuccess = true;

      try {
        const result = await executeAction(toolCall.tool, toolCall.args, 3, {
          manual_approval: autoApprove,
        });
        const resultStr = typeof result === 'string'
          ? result
          : JSON.stringify(result ?? {}, null, 2);
        toolResult = resultStr.length > maxToolResultChars
          ? resultStr.slice(0, maxToolResultChars) + '\n... [TRUNCATED]'
          : resultStr;
      } catch (e: unknown) {
        const errText = e instanceof Error ? e.message : String(e);
        toolResult = `ERROR: ${errText}`;
        toolSuccess = false;
        bus.toolError(taskId, toolCall.tool, errText, turnNum);
      }

      const toolElapsed = Date.now() - toolStart;
      bus.toolDone(taskId, toolCall.tool, toolResult, toolElapsed, turnNum);
      bus.taskObserve(taskId, turnNum, toolCall.tool, toolResult, toolElapsed);

      // Tambah tool result ke messages
      messages.push({
        role: 'user',
        content: `[Tool Result: ${toolCall.tool}]\n${toolResult}`,
      });

      turns.push({
        number: turnNum,
        thought: parsed.cleanedText.slice(0, 500),
        action: toolCall,
        observation: toolResult,
        elapsedMs: toolElapsed,
      });

      if (!toolSuccess) {
        // Cek apakah error fatal
        const isFatal = toolResult.includes('ACCESS_DENIED') ||
          toolResult.includes('SECURITY_VIOLATION') ||
          toolResult.includes('APPROVAL_REQUIRED') ||
          toolResult.includes('FATAL');
        if (isFatal) {
          error = `Fatal tool error: ${toolResult}`;
          bus.taskError(taskId, turnNum, error, false);
          const totalMs = Date.now() - startTime;
          return { id: taskId, prompt, turns, finalAnswer: toolResult, totalMs, error };
        }
      }
    }
  }

  // Max turns exceeded
  if (!finalAnswer) {
    finalAnswer = `[Max turns (${maxTurns}) reached. Last observation used as final answer.]`;
    const lastTurn = turns[turns.length - 1];
    if (lastTurn) {
      finalAnswer = lastTurn.observation || finalAnswer;
    }
  }

  const totalMs = Date.now() - startTime;
  bus.taskComplete(taskId, turns.length, finalAnswer, totalMs);
  return { id: taskId, prompt, turns, finalAnswer, totalMs, error };
}
