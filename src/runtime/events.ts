import { EventEmitter } from 'events';

// ============================================================================
// ANT Runtime — Event Bus
// ============================================================================
// Event bus khusus untuk Runtime CLI. Setiap event di-stream secara
// real-time ke terminal dengan format yang jelas dan konsisten.
// Event bus ini TERPISAH dari ANT_Bus (system event bus) agar
// concerns tidak bercampur.

export interface RuntimeEventMap {
  // Task lifecycle
  'task:start':    { taskId: string; task: string; turn: number };
  'task:think':    { taskId: string; turn: number; thought: string };
  'task:act':      { taskId: string; turn: number; tool: string; args: Record<string, unknown> };
  'task:observe':  { taskId: string; turn: number; tool: string; result: string; elapsedMs: number };
  'task:error':    { taskId: string; turn: number; error: string; retriable: boolean };
  'task:complete': { taskId: string; turns: number; finalAnswer: string; totalMs: number };
  'task:abort':    { taskId: string; reason: string };

  // AI provider
  'ai:request':    { taskId: string; model: string; provider: string; turn: number };
  'ai:token':      { taskId: string; token: string };
  'ai:response':   { taskId: string; text: string; turn: number };
  'ai:error':      { taskId: string; error: string; provider: string };

  // Tool execution
  'tool:start':    { taskId: string; tool: string; args: Record<string, unknown>; turn: number };
  'tool:done':     { taskId: string; tool: string; result: string; elapsedMs: number; turn: number };
  'tool:error':    { taskId: string; tool: string; error: string; turn: number };
  'tool:blocked':  { taskId: string; tool: string; reason: string; turn: number };

  // System
  'system:log':    { level: string; message: string };
  'system:status': { status: string };
}

export type RuntimeEvent = keyof RuntimeEventMap;

/**
 * Typed event emitter untuk Runtime.
 * Type-safe: listener harus menerima payload yang sesuai dengan event.
 */
export class RuntimeEventBus {
  private emitter: EventEmitter;

  constructor(maxListeners = 100) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(maxListeners);
  }

  /** Emit event ke semua listener */
  emit<K extends RuntimeEvent>(event: K, data: RuntimeEventMap[K]): void {
    this.emitter.emit(event, data);
  }

  /** Register listener untuk event tertentu */
  on<K extends RuntimeEvent>(event: K, listener: (data: RuntimeEventMap[K]) => void): void {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  /** Register one-time listener */
  once<K extends RuntimeEvent>(event: K, listener: (data: RuntimeEventMap[K]) => void): void {
    this.emitter.once(event, listener as (...args: unknown[]) => void);
  }

  /** Unregister listener */
  off<K extends RuntimeEvent>(event: K, listener: (data: RuntimeEventMap[K]) => void): void {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
  }

  /** Helper: emit task:start */
  taskStart(taskId: string, task: string, turn: number): void {
    this.emit('task:start', { taskId, task, turn });
  }

  /** Helper: emit task:think */
  taskThink(taskId: string, turn: number, thought: string): void {
    this.emit('task:think', { taskId, turn, thought });
  }

  /** Helper: emit task:act */
  taskAct(taskId: string, turn: number, tool: string, args: Record<string, unknown>): void {
    this.emit('task:act', { taskId, turn, tool, args });
  }

  /** Helper: emit task:observe */
  taskObserve(taskId: string, turn: number, tool: string, result: string, elapsedMs: number): void {
    this.emit('task:observe', { taskId, turn, tool, result, elapsedMs });
  }

  /** Helper: emit task:error */
  taskError(taskId: string, turn: number, error: string, retriable: boolean): void {
    this.emit('task:error', { taskId, turn, error, retriable });
  }

  /** Helper: emit task:complete */
  taskComplete(taskId: string, turns: number, finalAnswer: string, totalMs: number): void {
    this.emit('task:complete', { taskId, turns, finalAnswer, totalMs });
  }

  /** Helper: emit task:abort */
  taskAbort(taskId: string, reason: string): void {
    this.emit('task:abort', { taskId, reason });
  }

  /** Helper: emit ai:request */
  aiRequest(taskId: string, model: string, provider: string, turn: number): void {
    this.emit('ai:request', { taskId, model, provider, turn });
  }

  /** Helper: emit ai:token */
  aiToken(taskId: string, token: string): void {
    this.emit('ai:token', { taskId, token });
  }

  /** Helper: emit ai:response */
  aiResponse(taskId: string, text: string, turn: number): void {
    this.emit('ai:response', { taskId, text, turn });
  }

  /** Helper: emit ai:error */
  aiError(taskId: string, error: string, provider: string): void {
    this.emit('ai:error', { taskId, error, provider });
  }

  /** Helper: emit tool:start */
  toolStart(taskId: string, tool: string, args: Record<string, unknown>, turn: number): void {
    this.emit('tool:start', { taskId, tool, args, turn });
  }

  /** Helper: emit tool:done */
  toolDone(taskId: string, tool: string, result: string, elapsedMs: number, turn: number): void {
    this.emit('tool:done', { taskId, tool, result, elapsedMs, turn });
  }

  /** Helper: emit tool:error */
  toolError(taskId: string, tool: string, error: string, turn: number): void {
    this.emit('tool:error', { taskId, tool, error, turn });
  }

  /** Helper: emit tool:blocked */
  toolBlocked(taskId: string, tool: string, reason: string, turn: number): void {
    this.emit('tool:blocked', { taskId, tool, reason, turn });
  }

  /** Remove all listeners */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  /** Get listener count for an event */
  listenerCount(event: RuntimeEvent): number {
    return this.emitter.listenerCount(event);
  }
}

export const runtimeBus = new RuntimeEventBus();
