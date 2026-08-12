/**
 * agentOrchestrator.ts
 * ---------------------
 * "The Gearbox" — mengeksekusi agent loop berdasarkan cognitiveLevel.
 */

import { AgentLoopConfig, CognitiveLevel, getAgentLoopConfig } from './cognitiveLevels.js';
import { Scratchpad, DistillationModel, distillEntry } from './scratchpad.js';
import { evaluateResearchAnswer, ResearchAnswer, GuardVerdict } from './researchVerificationGuard.js';

interface ReActStep {
  thought: string;
  action?: { tool: string; input: Record<string, unknown> };
  final_answer?: ResearchAnswer;
}

export interface ModelClient {
  step(messages: unknown[], systemPrompt: string): Promise<string>;
}

export interface ToolExecutor {
  // Returns evidenceId assigned by evidenceLedger
  execute(tool: string, input: Record<string, unknown>): Promise<{ evidenceId: string }>;
}

export interface OrchestratorResult {
  finalText: string;
  confidence: 'high' | 'low';
  turnsUsed: number;
}

function parseReActStep(raw: string): ReActStep | null {
  try {
    const text = raw.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const parsed = JSON.parse(text);
    if (typeof parsed.thought !== 'string') return null;
    return parsed as ReActStep;
  } catch {
    return null;
  }
}

const MAX_SCHEMA_RETRIES = 2;

export async function runAgentLoop(params: {
  level: CognitiveLevel;
  userQuery: string;
  model: ModelClient;
  distillationModel: DistillationModel;
  tools: ToolExecutor;
}): Promise<OrchestratorResult> {
  const config = getAgentLoopConfig(params.level);
  const scratchpad = new Scratchpad();

  let messages: unknown[] = [{ role: 'user', content: params.userQuery }];
  let guardAttempts = 0;
  let turn = 0;

  while (turn < config.maxTurns) {
    turn++;

    const step = await getValidatedStep(params.model, messages, config.systemPromptInjection);
    if (!step) {
      return { finalText: 'Maaf, terjadi kegagalan format internal saat memproses riset ini.', confidence: 'low', turnsUsed: turn };
    }

    if (step.action) {
      const result = await params.tools.execute(step.action.tool, step.action.input);
      if (result.evidenceId) {
        const distilled = await distillEntry(result.evidenceId, params.distillationModel);
        if (distilled) {
          messages.push({
            role: 'tool',
            content: JSON.stringify({
              summary: distilled.summary,
              sourceUrl: distilled.sourceUrl,
              rawContentHash: distilled.rawContentHash,
            }),
          });
        }
      }
      continue;
    }

    if (step.final_answer) {
      const verdict = evaluateResearchAnswer(step.final_answer, config, scratchpad, guardAttempts);

      if (verdict.status === 'accept') {
        return { finalText: step.final_answer.finalText, confidence: 'high', turnsUsed: turn };
      }

      if (verdict.status === 'escalate') {
        return { finalText: `${step.final_answer.finalText}\n\n[Catatan: confidence rendah — ${verdict.reason}]`, confidence: 'low', turnsUsed: turn };
      }

      guardAttempts++;
      messages.push({ role: 'system', content: verdict.feedbackForModel });
      continue;
    }

    messages.push({ role: 'system', content: 'Lanjutkan: tentukan action atau final_answer.' });
  }

  return { finalText: 'Riset dihentikan karena mencapai batas iterasi maksimum sebelum verifikasi tuntas.', confidence: 'low', turnsUsed: turn };
}

async function getValidatedStep(model: ModelClient, messages: unknown[], systemPrompt: string): Promise<ReActStep | null> {
  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRIES; attempt++) {
    const raw = await model.step(messages, systemPrompt);
    const parsed = parseReActStep(raw);
    if (parsed) return parsed;
    
    messages = [...messages, { role: 'system', content: 'Output tidak sesuai schema JSON ReAct. Kirim ulang dengan field {thought, action?, final_answer?}. Jawab murni dalam JSON.' }];
  }
  return null;
}
