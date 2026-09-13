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
  /** Working directory aktif untuk task (default: process.cwd()). */
  scope: string;
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
  private busy = false;

  constructor(bus: RuntimeEventBus = runtimeBus) {
    this.bus = bus;
    this.session = {
      id: `session_${Date.now()}`,
      task: null,
      history: [],
      startedAt: Date.now(),
      scope: process.cwd(),
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
    // TODO(antcode#8): output readline + seluruh event stream memakai
    // process.stderr — prompt bisa tertimpa tulisan event saat task
    // berjalan. Refactor UI besar (mis. alihkan renderer ke baris
    // terpisah / mode silent saat busy) ditunda, di luar task ini.
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // stdout dipakai untuk output
      prompt: '\nANT> ',
    });

    this.bus.emit('system:status', { status: 'READY' });
    process.stderr.write(`\nANT-CODE Runtime Ready. 📁 Scope: ${this.session.scope}\n`);
    process.stderr.write('Ketik task, /scope <path> untuk ganti direktori, atau /quit untuk keluar.\n');
    rl.prompt();

    rl.on('line', async (line: string) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }

      if (input === '/quit' || input === '/exit') {
        this.bus.emit('system:status', { status: 'SHUTDOWN' });
        process.stderr.write('Bye.\n');
        rl.close();
        return;
      }

      if (input === '/history') {
        for (const h of this.session.history) {
          process.stderr.write(`  ${h}\n`);
        }
        rl.prompt();
        return;
      }

      // /scope — lihat atau ubah working directory task
      if (input === '/scope' || input.startsWith('/scope ')) {
        const arg = input.slice(6).trim();
        if (!arg) {
          // Tampilkan scope saat ini
          process.stderr.write(`  📁 Scope: ${this.session.scope}\n`);
          rl.prompt();
          return;
        }
        // Resolve path: ~ → home, .. → parent, absolute/relative
        let target = arg;
        if (target === '~') {
          target = (await import('os')).homedir();
        } else if (target === '..') {
          target = require('path').dirname(this.session.scope);
        } else if (!target.startsWith('/')) {
          target = require('path').join(this.session.scope, target);
        }
        // Validasi path ada
        const fs = await import('fs');
        if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
          process.stderr.write(`  ❌ Directory not found: ${target}\n`);
          rl.prompt();
          return;
        }
        // Simpan previous scope untuk /scope -
        this.session.history.push(`[scope] ${this.session.scope}`);
        this.session.scope = target;
        process.chdir(target);
        this.bus.emit('system:log', { level: 'INFO', message: `Scope changed to: ${target}` });
        process.stderr.write(`  📁 Scope: ${this.session.scope}\n`);
        rl.prompt();
        return;
      }

      if (input.startsWith('/')) {
        process.stderr.write(`Unknown command: ${input}\n`);
        rl.prompt();
        return;
      }

      // Guard: tolak task baru saat task sebelumnya masih berjalan.
      // Slash command (mis. /quit, /history) tetap responsif di atas.
      if (this.busy) {
        process.stderr.write('  ⏳ Task masih berjalan, tunggu selesai...\n');
        rl.prompt();
        return;
      }

      this.busy = true;
      try {
        const task = await this.runTask(input, options);
        process.stderr.write(`\n── Result (${task.totalMs}ms) ──\n`);
        process.stdout.write(task.finalAnswer + '\n');
      } catch (e: unknown) {
        const errText = e instanceof Error ? e.message : String(e);
        process.stderr.write(`\n[ERROR] ${errText}\n`);
      } finally {
        this.busy = false;
      }

      rl.prompt();
    });

    rl.on('close', () => {
      // Keluar natural: biarkan event loop kosong sendiri. Jangan
      // process.exit() brutal agar stream/output sempat flush.
      this.bus.emit('system:status', { status: 'SHUTDOWN' });
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
