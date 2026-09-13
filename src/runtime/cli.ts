#!/usr/bin/env node
import { runtimeBus } from './events.js';
import { AgenticRuntime } from './runtime.js';
import type { RuntimeEventMap } from './events.js';

// ============================================================================
// ANT Runtime — Pure CLI Runner
// ============================================================================
// Entry point murni untuk runtime CLI. Setup event listeners untuk
// streaming real-time ke terminal, lalu jalankan task atau REPL.

const bus = runtimeBus;
const runtime = new AgenticRuntime(bus);

// ── Event Listeners ─────────────────────────────────────────────────
// Setiap event di-render ke stderr supaya stdout bersih untuk output.

bus.on('task:start', (d: RuntimeEventMap['task:start']) => {
  process.stderr.write(`\n┌─ Task [${d.taskId}] start ──────────────────────────\n`);
  process.stderr.write(`│ Prompt: ${d.task}\n`);
});

bus.on('task:think', (d: RuntimeEventMap['task:think']) => {
  process.stderr.write(`│ [Turn ${d.turn}] 🧠 Thinking...\n`);
});

bus.on('task:act', (d: RuntimeEventMap['task:act']) => {
  const argsPreview = JSON.stringify(d.args).slice(0, 120);
  process.stderr.write(`│ [Turn ${d.turn}] ⚡ ${d.tool} ${argsPreview}\n`);
});

bus.on('task:observe', (d: RuntimeEventMap['task:observe']) => {
  const resPreview = d.result.slice(0, 200).replace(/\n/g, ' ');
  process.stderr.write(`│ [Turn ${d.turn}] 👁 ${d.tool} (${d.elapsedMs}ms) → ${resPreview}\n`);
});

bus.on('task:error', (d: RuntimeEventMap['task:error']) => {
  process.stderr.write(`│ [Turn ${d.turn}] ❌ ERROR: ${d.error}\n`);
});

bus.on('task:complete', (d: RuntimeEventMap['task:complete']) => {
  process.stderr.write(`└─ Task [${d.taskId}] done in ${d.totalMs}ms (${d.turns} turns) ──\n\n`);
});

bus.on('task:abort', (d: RuntimeEventMap['task:abort']) => {
  process.stderr.write(`└─ Task [${d.taskId}] ABORTED: ${d.reason} ──\n\n`);
});

bus.on('ai:request', (d: RuntimeEventMap['ai:request']) => {
  process.stderr.write(`  → AI: ${d.provider}/${d.model} (turn ${d.turn})\n`);
});

bus.on('ai:token', (d: RuntimeEventMap['ai:token']) => {
  process.stderr.write(d.token);
});

bus.on('ai:response', (_d: RuntimeEventMap['ai:response']) => {
  process.stderr.write('\n');
});

bus.on('ai:error', (d: RuntimeEventMap['ai:error']) => {
  process.stderr.write(`\n  ⚠ AI Error (${d.provider}): ${d.error}\n`);
});

bus.on('tool:start', (d: RuntimeEventMap['tool:start']) => {
  process.stderr.write(`  → Tool: ${d.tool}\n`);
});

bus.on('tool:done', (d: RuntimeEventMap['tool:done']) => {
  const preview = d.result.slice(0, 150).replace(/\n/g, ' ');
  process.stderr.write(`  ✓ ${d.tool} (${d.elapsedMs}ms): ${preview}\n`);
});

bus.on('tool:error', (d: RuntimeEventMap['tool:error']) => {
  process.stderr.write(`  ✗ ${d.tool} ERROR: ${d.error}\n`);
});

bus.on('tool:blocked', (d: RuntimeEventMap['tool:blocked']) => {
  process.stderr.write(`  ⛔ ${d.tool} BLOCKED: ${d.reason}\n`);
});

bus.on('system:log', (d: RuntimeEventMap['system:log']) => {
  process.stderr.write(`[${d.level}] ${d.message}\n`);
});

bus.on('system:status', (d: RuntimeEventMap['system:status']) => {
  process.stderr.write(`\n═══ Status: ${d.status} ═══\n`);
});

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stderr.write(`
ANT Runtime — Pure CLI Agent

Usage:
  ant-runtime <prompt>              Run single task (one-shot)
  ant-runtime                       Start interactive REPL
  ant-runtime --help                Show this help

Environment:
  AI_PROVIDER       AI provider (Google Gemini|OpenAI|Anthropic Claude)
  *_API_KEY         Provider API keys
  CUSTOM_MODEL      Model override

Event stream:
  All lifecycle events are emitted to stderr in real-time.
  Task output goes to stdout (pipe-friendly).

Examples:
  ant-runtime "Create a hello world Express server with tests"
  ant-runtime "List files in current directory"
  echo "What files are here?" | ant-runtime
`);
    process.exit(0);
  }

  if (args.length > 0) {
    // One-shot mode
    const prompt = args.join(' ');
    try {
      const result = await runtime.runTask(prompt);
      process.stdout.write(result.finalAnswer + '\n');
      process.exit(result.error ? 1 : 0);
    } catch (e: unknown) {
      const errText = e instanceof Error ? e.message : String(e);
      process.stderr.write(`\n[ERROR] ${errText}\n`);
      process.exit(1);
    }
  } else {
    // REPL mode
    await runtime.runInteractive();
  }
}

main();
