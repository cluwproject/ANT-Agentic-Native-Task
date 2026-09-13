import { z } from 'zod';

// ============================================================================
// ANT Runtime — Types
// ============================================================================

/** Status transisi task dalam agent loop */
export const TaskStatus = z.enum([
  'PENDING',
  'THINKING',
  'ACTING',
  'OBSERVING',
  'COMPLETED',
  'FAILED',
  'ABORTED',
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Tool call yang diparsing dari response AI */
export interface RuntimeToolCall {
  tool: string;
  args: Record<string, unknown>;
}

/** Hasil eksekusi tool */
export interface RuntimeToolResult {
  tool: string;
  success: boolean;
  result: string;
  elapsedMs: number;
}

/** Satu iterasi dalam agent loop (ReAct cycle) */
export interface Turn {
  number: number;
  thought: string;
  action: RuntimeToolCall | null;
  observation: string;
  elapsedMs: number;
}

/** Task — unit kerja utama runtime */
export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  turns: Turn[];
  finalAnswer: string;
  startedAt: number;
  completedAt: number | null;
  totalMs: number;
  error: string | null;
}

/** Brain config — konfigurasi AI provider untuk task */
export interface BrainConfig {
  provider?: string;
  api_key?: string;
  base_url?: string;
  custom_model?: string;
  tavily_api_key?: string;
  [key: string]: unknown;
}

/** Runtime options — kontrol perilaku agent loop */
export interface RuntimeOptions {
  maxTurns?: number;
  maxToolResultChars?: number;
  autoApprove?: boolean;
  brain?: BrainConfig;
  systemPrompt?: string;
}

/** Tool handler signature — setiap tool harus implement ini */
export type ToolHandler = (
  action: string,
  details: Record<string, unknown>,
  workspaceDir: string,
  baseDir: string,
  context?: Record<string, unknown>,
) => Promise<Record<string, unknown> | null>;

// Zod schemas for runtime state
export const TurnSchema = z.object({
  number: z.number(),
  thought: z.string(),
  action: z.object({ tool: z.string(), args: z.record(z.unknown()) }).nullable(),
  observation: z.string(),
  elapsedMs: z.number(),
});

export const TaskSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  status: TaskStatus,
  turns: z.array(TurnSchema),
  finalAnswer: z.string(),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  totalMs: z.number(),
  error: z.string().nullable(),
});

export const RuntimeOptionsSchema = z.object({
  maxTurns: z.number().min(1).max(100).optional(),
  maxToolResultChars: z.number().optional(),
  autoApprove: z.boolean().optional(),
  brain: z.record(z.unknown()).optional(),
  systemPrompt: z.string().optional(),
});
