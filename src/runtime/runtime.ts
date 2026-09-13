import { z } from 'zod';
import { RuntimeEventBus, runtimeBus } from './events.js';
import { executeTask } from './executor.js';
import type { RuntimeOptions, Task as RuntimeTask } from './types.js';

// ============================================================================
// ANT Runtime — Agentic Runtime (CLI Core)
// ============================================================================
// Runtime utama untuk CLI mode. Mengintegrasikan event bus, executor,
// dan lifecycle management. Class ini adalah facade yang menyederhanakan
// akses ke seluruh pipeline agent loop.

export const CognitiveStateSchema = z.object({
  observation: z.string(),
  thought: z.string(),
  action: z.string(),
  verification: z.string().optional(),
  status: z.enum(['PENDING', 'EXECUTING', 'VERIFYING', 'COMPLETED', 'FAILED']),
});

export type CognitiveState = z.infer<typeof CognitiveStateSchema>;

export interface RuntimeSession {
  id: string;
  task: RuntimeTask | null;
  history: string[];
  startedAt: number;
}

/**
 * AgenticRuntime — Core CLI Runtime
 *
 * Menyediakan API tingkat tinggi untuk menjalankan task agent loop:
 *   runtime.runTask("Build a REST API with tests")
 *
 * Setiap task mengikuti siklus ReAct:
 *   1. THINK  — AI merencanakan langkah
 *   2. ACT    — Tool dieksekusi
 *   3. OBSERVE — Hasil diamati
 *   4. Ulangi hingga selesai atau max turns
 *
 * Event bus meng-emit real-time updates untuk setiap tahap.
 */
export class AgenticRuntime {
  private bus: RuntimeEventBus;
  private session: RuntimeSession;
  private state: CognitiveState;

  constructor(bus: RuntimeEventBus = runtimeBus) {
    this.bus = bus;
    this.session = {
      id: `session_${Date.now()}`,
      task: null,
      history: [],
      startedAt: Date.now(),
    };
    this.state = {
      observation: '',
      thought: '',
      action: '',
      status: 'PENDING',
    };
  }

  /**
   * Jalankan satu task agent loop.
   * Mengembalikan hasil task termasuk semua turn history.
   */
  async runTask(prompt: string, options: RuntimeOptions = {}): Promise<RuntimeTask> {
    this.state = {
      observation: `Task received: ${prompt}`,
      thought: '',
      action: '',
      status: 'EXECUTING',
    };

    this.bus.emit('system:log', { level: 'INFO', message: `Starting task: ${prompt.slice(0, 80)}...` });

    const result = await executeTask(prompt, this.bus, options);

    this.state.status = result.error ? 'FAILED' : 'COMPLETED';
    this.state.observation = result.finalAnswer;

    const runtimeTask: RuntimeTask = {
      id: result.id,
      prompt: result.prompt,
      status: result.error ? 'FAILED' : 'COMPLETED',
      turns: result.turns,
      finalAnswer: result.finalAnswer,
      startedAt: Date.now() - result.totalMs,
      completedAt: Date.now(),
      totalMs: result.totalMs,
      error: result.error,
    };

    this.session.task = runtimeTask;
    this.session.history.push(`[${result.id}] ${prompt.slice(0, 100)} → ${runtimeTask.status} (${result.totalMs}ms)`);

    return runtimeTask;
  }

  /**
   * Jalankan loop interaktif — menerima input dari stdin.
   * Digunakan oleh CLI runner untuk mode REPL.
   */
  async runInteractive(options: RuntimeOptions = {}): Promise<void> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // stdout dipakai untuk output
      prompt: '\nANT> ',
    });

    this.bus.emit('system:status', { status: 'READY' });
    process.stderr.write('\nANT Runtime Ready. Ketik task atau /quit untuk keluar.\n');
    rl.prompt();

    rl.on('line', async (line: string) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }

      if (input === '/quit' || input === '/exit') {
        this.bus.emit('system:status', { status: 'SHUTDOWN' });
        process.stderr.write('Bye.\n');
        rl.close();
        process.exit(0);
      }

      if (input === '/history') {
        for (const h of this.session.history) {
          process.stderr.write(`  ${h}\n`);
        }
        rl.prompt();
        return;
      }

      if (input.startsWith('/')) {
        process.stderr.write(`Unknown command: ${input}\n`);
        rl.prompt();
        return;
      }

      try {
        const task = await this.runTask(input, options);
        process.stderr.write(`\n── Result (${task.totalMs}ms) ──\n`);
        process.stdout.write(task.finalAnswer + '\n');
      } catch (e: unknown) {
        const errText = e instanceof Error ? e.message : String(e);
        process.stderr.write(`\n[ERROR] ${errText}\n`);
      }

      rl.prompt();
    });

    rl.on('close', () => {
      this.bus.emit('system:status', { status: 'SHUTDOWN' });
      process.exit(0);
    });
  }

  getState(): CognitiveState {
    return this.state;
  }

  getSession(): RuntimeSession {
    return { ...this.session };
  }

  getBus(): RuntimeEventBus {
    return this.bus;
  }
}

// Entry point for direct runtime testing
if (import.meta.url === `file://${process.argv[1]}` || process.argv.includes('runtime.ts')) {
  const runtime = new AgenticRuntime();
  const taskArg = process.argv[2] || 'Hello World';
  runtime.runTask(taskArg).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.error ? 1 : 0);
  });
}
