// ============================================================================
// ANT — CLI Agent Loop — Terminal UI Layer
// ============================================================================
// Semua tampilan terminal (banner, box tool call, notifikasi brain-switch,
// render markdown) dikumpulkan di sini. Tujuannya: agentLoop.ts fokus ke
// alur logika, bukan urusan kosmetik. Lapisan tampilan ini tidak pernah
// menyimpan state keputusan, hanya menampilkan apa yang diberikan padanya.

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import type { RoutingMetadata } from './types.js';
import fs from 'fs';
import path from 'path';

// ── Output Router & Silent Mode ─────────────────────────────────────
// Semua output UI melewati emit(). Dalam mode silent (headless JSON),
// output UI dialihkan ke stderr supaya stdout murni berisi data JSON
// yang bisa dipipe ke jq/dll tanpa tercemar noise visual.
let uiSilent = false;

export function setUiSilent(silent: boolean): void {
    uiSilent = silent;
}

export function isUiSilent(): boolean {
    return uiSilent;
}

function emit(line?: string): void {
    const text = line === undefined ? '\n' : line + '\n';
    if (uiSilent) {
        process.stderr.write(text);
    } else {
        process.stdout.write(text);
    }
}

export function getTerminalWidth(): number {
    const cols = process.stdout.columns || 80;
    return Math.max(40, cols);
}

export function getDivider(): string {
    return chalk.dim('─'.repeat(getTerminalWidth()));
}

export interface AntSpinner {
    stop(): void;
    clear(): void;
    /** Status utama yang ditampilkan di baris spinner. */
    text: string;
    /**
     * Potongan live preview (mis. aliran token dari model). Ditampilkan
     * inline di baris yang sama — aman untuk Termux & terminal sempit.
     */
    preview: string;
}

export function startSpinner(text: string): AntSpinner {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let currentText = text;
    let preview = '';
    const startTime = Date.now();

    const makeHandle = (animate: boolean, useTimer: boolean): AntSpinner => {
        const timer = useTimer
            ? setInterval(() => {
                process.stdout.write(`\r\x1b[K${renderLine()}`);
                i = (i + 1) % frames.length;
            }, 80)
            : null;
        return {
            stop: () => {
                if (timer) clearInterval(timer);
                if (animate) process.stdout.write('\r\x1b[K');
            },
            clear: () => {
                if (timer) clearInterval(timer);
                if (animate) process.stdout.write('\r\x1b[K');
            },
            get text() { return currentText; },
            set text(val: string) { currentText = val; },
            get preview() { return preview; },
            set preview(val: string) { preview = val; }
        };
    };

    const renderLine = (): string => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        let line = `${chalk.cyan(frames[i])} ${chalk.blueBright(currentText)} ${chalk.dim(`${elapsed}s`)}`;
        const pv = preview.replace(/\s+/g, ' ').trim();
        if (pv) {
            // Ambil potongan AKHIR supaya teks terbaru selalu terlihat
            line += chalk.dim(` › ${pv.slice(-32)}`);
        }
        return line;
    };

    // Mode silent (headless JSON): tanpa animasi agar output tetap bersih.
    if (uiSilent) return makeHandle(false, false);

    // Fallback non-TTY: satu baris statis, tanpa animasi.
    if (!process.stdout.isTTY) {
        emit(chalk.blueBright(`- ${currentText}...`));
        return makeHandle(false, false);
    }

    return makeHandle(true, true);
}

/**
 * Tampilkan status routing kognitif (model/provider/tier/reason).
 * Hanya ditampilkan saat awal sesi atau ketika model berganti.
 */
export function printRoutingStatus(metadata: RoutingMetadata, lastModel: string): string {
    const currentModel = metadata.model || 'Unknown';
    const currentProvider = metadata.provider || 'Unknown';
    const currentTier = metadata.tier || 'SLM';
    const currentReason = metadata.reason || '-';

    if (lastModel && lastModel !== currentModel) {
        emit(chalk.yellow(`\n[Model Switched] `) + chalk.dim(`${lastModel} ➔ `) + chalk.cyan.bold(`${currentModel} (${currentProvider})`) + '\n');
    } else if (!lastModel) {
        const isDebug = process.env.ANT_DEBUG === '1' || process.env.ANT_DEBUG === 'true';
        const reasonStr = isDebug ? ` [Reason: ${chalk.italic(currentReason)}]` : '';
        emit(chalk.dim(`Cognitive Route: ${chalk.cyan(currentTier)} (${chalk.white(currentModel)} via ${chalk.white(currentProvider)})${reasonStr}`) + '\n');
    }
    return currentModel;
}

/** Format thoughts process within clean vertical lines (AGY Styled) */
export function printThought(thought: string, durationSec: number = 0, estimatedTokens: number = 0) {
    const tokenStr = estimatedTokens >= 1000 
        ? `${(estimatedTokens / 1000).toFixed(1)}k` 
        : `${estimatedTokens || Math.round(thought.length / 3.7)}`;
    const durSec = durationSec || Math.max(1, Math.round(thought.length / 500));
    
    // Extract clean topic headline from thought
    const lines = thought.trim().split('\n').map(l => l.trim()).filter(Boolean);
    let title = '';
    if (lines.length > 0) {
        const rawFirst = lines[0].replace(/^[\d#\-*.: ]+/, '').trim();
        if (rawFirst && rawFirst.length >= 3 && rawFirst.length <= 65) {
            title = rawFirst;
        }
    }

    emit(chalk.cyan(`\n▸ Thought for ${durSec}s, ${tokenStr} tokens`));
    if (title) {
        emit(chalk.dim(`  ${title}`));
    }
}

/** Render a beautiful unified-like git diff for file writes and edits */
export function printFileDiff(filePath: string, newContent: string) {
    let absolutePath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(absolutePath)) {
        const workspacePath = path.resolve(process.cwd(), 'workspace', filePath);
        if (fs.existsSync(workspacePath)) {
            absolutePath = workspacePath;
        }
    }
    emit(chalk.cyan(`\nFILE TARGET: ${chalk.bold(filePath)}`));
    emit(chalk.dim('──────────────────────────────────────────────────────────────────'));

    let oldLines: string[] = [];
    if (fs.existsSync(absolutePath)) {
        try {
            const oldContent = fs.readFileSync(absolutePath, 'utf8');
            oldLines = oldContent.split('\n');
        } catch {}
    }

    const newLines = (newContent || '').split('\n');

    // LCS Diff Algorithm
    const matrix: number[][] = [];
    for (let i = 0; i <= oldLines.length; i++) {
        matrix[i] = [0];
    }
    for (let j = 0; j <= newLines.length; j++) {
        matrix[0][j] = 0;
    }
    for (let i = 1; i <= oldLines.length; i++) {
        for (let j = 1; j <= newLines.length; j++) {
            if (oldLines[i - 1] === newLines[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    const diff: string[] = [];
    let i = oldLines.length;
    let j = newLines.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            diff.unshift(`   ${i} │ ${oldLines[i - 1]}`);
            i--;
            j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift(chalk.green(`+  ${j} │ ${newLines[j - 1]}`));
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diff.unshift(chalk.red(`-  ${i} │ ${oldLines[i - 1]}`));
            i--;
        }
    }

    // Limit lines shown
    if (diff.length > 25) {
        const firstPart = diff.slice(0, 10);
        const lastPart = diff.slice(-10);
        emit(firstPart.join('\n'));
        emit(chalk.yellow(`     @@ ... [${diff.length - 20} lines hidden] ... @@`));
        emit(lastPart.join('\n'));
    } else {
        emit(diff.join('\n'));
    }
    emit(chalk.dim('──────────────────────────────────────────────────────────────────'));
}

export interface ResponseMetrics {
    durationSec: number | string;
    tokens?: number;
    speed?: number | string;
}

/** Prints assistant response cleanly with dynamic word-wrapping, generation metrics, and turn boundaries */
export async function printAssistantText(text: string, metrics?: ResponseMetrics) {
    if (!text.trim()) return;
    const termWidth = getTerminalWidth();
    marked.setOptions({
        mangle: false,
        headerIds: false,
        renderer: new TerminalRenderer({
            width: termWidth,
            code: chalk.cyan,
            strong: chalk.bold.white,
            em: chalk.italic,
            firstHeading: chalk.bold.magenta.underline,
            heading: chalk.bold.magenta,
            tab: 2,
            tableOptions: {
                style: { head: ['cyan'], border: ['gray'] },
                wordWrap: true
            }
        }) as any
    });
    const rendered = await marked(text);
    emit(`\n${chalk.magenta.bold('ANT ❯')}`);
    emit(rendered.trim());

    if (metrics && metrics.durationSec) {
        const tokInfo = metrics.tokens ? ` (${metrics.tokens} tokens${metrics.speed ? `, ${metrics.speed} tok/s` : ''})` : '';
        emit(chalk.dim(`\nRespons selesai dalam ${metrics.durationSec}s${tokInfo}`));
    }

    emit('');
}

export function printToolSuccess(toolName: string, args: Record<string, any> = {}, evidenceId?: string) {
    const { label, argSummary } = describeToolCall(toolName, args);
    const evidStr = evidenceId ? chalk.dim(` [EVID:${evidenceId}]`) : '';
    emit(chalk.cyan(`● ${label}(${argSummary})`) + evidStr);
}

/** Print clean, compact 3-5 line preview of tool execution stdout */
export function printToolResultPreview(result: any, maxLines: number = 4) {
    if (!result) return;
    let outputStr = '';
    if (typeof result === 'string') outputStr = result;
    else if (result.stdout) outputStr = result.stdout;
    else if (result.output) outputStr = result.output;
    else if (result.content) outputStr = result.content;
    
    if (!outputStr || typeof outputStr !== 'string') return;
    const lines = outputStr.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return;
    
    const preview = lines.slice(0, maxLines);
    preview.forEach(line => {
        emit(chalk.dim(`    │ ${line.slice(0, 100)}`));
    });
    if (lines.length > maxLines) {
        emit(chalk.dim(`    │ ... (+${lines.length - maxLines} lines)`));
    }
}

export function printToolFailure(toolName: string, args: Record<string, any> = {}, error: string = '') {
    const { label, argSummary } = describeToolCall(toolName, args);
    emit(chalk.cyan(`● ${label}(${argSummary})`) + chalk.red(` gagal: ${error}`));
}

export function printApprovalBox(tool: string, risk: 'LOW' | 'MEDIUM' | 'HIGH', reason: string) {
    const riskColor = risk === 'HIGH' ? chalk.red.bold : risk === 'MEDIUM' ? chalk.yellow.bold : chalk.green.bold;

    emit(chalk.cyan('  ANT SECURE GATEWAY'));
    emit(chalk.cyan('  │') + chalk.cyan('  Action      : ') + chalk.white(tool));
    emit(chalk.cyan('  │') + chalk.cyan('  Risk Level  : ') + riskColor(risk));
    emit(chalk.cyan('  │') + chalk.cyan('  Description : ') + chalk.italic(reason));
}

export function printAutoExecuteNotice() {
    emit(chalk.dim.italic(`[Auto-approve] Tool aman — dieksekusi otomatis...`));
}

export function printDenied() {
    emit(chalk.red('[DIBATALKAN] Eksekusi dibatalkan oleh Anda.\n'));
}

export function printBlocked(reason: string) {
    emit(chalk.red.bold('[DIBLOKIR] ') + chalk.red(reason) + '\n');
}

/** Attempt limit reach message */
export function printAttemptLimitReached(max: number) {
    emit('\n' + getDivider());
    emit(chalk.bold.red(`[BATAS TERCAPAI] Limit langkah tercapai (${max})`));
    emit(chalk.dim('Agent dihentikan karena mencapai batas maksimum iterasi.'));
    emit(chalk.dim('Tugas mungkin belum selesai — periksa hasil terakhir atau lanjutkan di sesi baru.'));
    emit(getDivider() + '\n');
}

/** Ctrl+C graceful cancel print */
export function printCancelled() {
    emit('\n' + chalk.yellow('[TERINTERRUPTSI] Dibatalkan oleh Anda (SIGINT). Sesi dihentikan dengan aman.\n'));
}

export function printConnectionError(message: string) {
    emit(chalk.red(`\n[Connection Error] Gagal terhubung ke model Kognitif: ${message}`));
}

export function printToolParseFailure() {
    emit(chalk.dim.italic(`[FORMAT TOOL RUSAK] Meminta model memperbaiki format tool call...`));
}

// ── Unified Tool Call Display (Fase 1) ──────────────────────────────
// Satu sumber kebenaran untuk label & ringkasan argumen tool — dipakai
// oleh printToolSuccess/printToolFailure/printApprovalBox sehingga tidak
// ada lagi tiga salinan if/else yang bisa saling beda.

export interface ToolCallDisplay {
    /** Label pendek ala Claude Code: Read / Bash / MCP[demo] › greet */
    label: string;
    /** Ringkasan argumen satu baris, sudah dipotong bila panjang. */
    argSummary: string;
}

const TOOL_LABELS: Record<string, string> = {
    read_file: 'Read',
    write_file: 'Write',
    create_file: 'Write',
    modify_file: 'Edit',
    edit_file: 'Edit',
    patch_file: 'Patch',
    list_dir: 'ListDir',
    shell_exec: 'Bash',
    exec: 'Bash',
    grep_search: 'Search',
    web_request: 'Fetch',
    fetch_url_content: 'Fetch',
    web_search: 'Search',
    manage_task: 'ManageTask',
    git_checkpoint: 'Git Commit',
    git_status: 'Git Status',
    git_diff: 'Git Diff',
    run_tests: 'Test'
};

function pickArg(args: Record<string, any>, keys: string[]): string {
    for (const k of keys) {
        const v = args?.[k];
        if (typeof v === 'string' && v) return v;
    }
    return '';
}

function truncateMiddle(text: string, max: number): string {
    const t = text || '';
    if (t.length <= max) return t.replace(/\s+/g, ' ');
    return t.slice(0, Math.ceil(max * 0.55)).replace(/\s+/g, ' ') + '…' + t.slice(-Math.floor(max * 0.3)).replace(/\s+/g, ' ');
}

/** Ringkas argumen jadi satu baris pendek sesuai jenis tool. */
export function describeToolCall(toolName: string, args: Record<string, any> = {}): ToolCallDisplay {
    // Tool MCP: mcp__<server>__<tool>
    if (toolName.startsWith('mcp__')) {
        const parts = toolName.split('__');
        const server = parts[1];
        const tool = parts.slice(2).join('__');
        const firstVal = Object.values(args ?? {}).find(v => typeof v === 'string' && v) || '';
        return {
            label: `MCP[${server}] › ${tool}`,
            argSummary: truncateMiddle(String(firstVal), 60)
        };
    }

    const label = TOOL_LABELS[toolName] || (toolName.charAt(0).toUpperCase() + toolName.slice(1));

    let raw = '';
    switch (toolName) {
        case 'read_file':
        case 'write_file':
        case 'create_file':
        case 'modify_file':
        case 'edit_file':
        case 'patch_file':
        case 'delete_file':
            raw = pickArg(args, ['file', 'path', 'fileName']);
            break;
        case 'list_dir':
            raw = pickArg(args, ['path', 'dir']) || '.';
            break;
        case 'shell_exec':
        case 'exec':
            raw = pickArg(args, ['command', 'cmd']);
            break;
        case 'grep_search':
            raw = pickArg(args, ['query', 'pattern']);
            break;
        case 'web_request':
        case 'fetch_url_content':
            raw = pickArg(args, ['url']);
            break;
        case 'manage_task':
            raw = args?.action ? `${args.action} ${args.taskId || ''}`.trim() : '';
            break;
        default:
            try {
                raw = JSON.stringify(args ?? {});
            } catch {
                raw = String(args);
            }
    }

    return { label, argSummary: truncateMiddle(raw, 60) };
}

// ── Guard Notice (Fase 1) ───────────────────────────────────────────
// Pengganti penyalahgunaan printConnectionError untuk pesan non-koneksi.

export type GuardKind = 'guard' | 'hook' | 'freshness' | 'connection';

export function printGuardNotice(kind: GuardKind, message: string): void {
    switch (kind) {
        case 'guard':
            emit(chalk.yellow.bold('[SOVEREIGN GUARD] ') + chalk.yellow(message));
            break;
        case 'hook':
            emit(chalk.magenta.bold('[HOOKS] ') + chalk.magenta(message));
            break;
        case 'freshness':
            emit(chalk.yellow.bold('[FRESHNESS] ') + chalk.yellow(message));
            break;
        case 'connection':
        default:
            emit(chalk.red(`\n[Connection Error] Gagal terhubung ke model Kognitif: ${message}`));
            break;
    }
}

// ── Step Header (Fase 2) ────────────────────────────────────────────
// Header langkah ringan tiap iterasi loop — proses selalu terlihat
// meski model tidak mengirim blok <thought>.

export function printStepHeader(step: number, model?: string, durationSec?: number | string): void {
    const parts = [`▸ Langkah ${step}`];
    if (model) parts.push(chalk.cyan(model));
    if (durationSec !== undefined) parts.push(chalk.dim(`${durationSec}s`));
    emit(chalk.dim(parts.join(' · ')));
}

// ── Workflow Phase Renderer (Fase 3) ────────────────────────────────

export function printPhase(phase: string, step?: number, total?: number, detail?: string): void {
    let line = `\n◆ ${chalk.cyan.bold(phase)}`;
    if (step !== undefined && total !== undefined) {
        line += chalk.dim(` ── langkah ${step}/${total}`);
    }
    if (detail) {
        line += chalk.dim(` · ${detail}`);
    }
    emit(line);
}

export function printSubStep(detail: string): void {
    emit(chalk.dim(`  › ${detail}`));
}

// ── Task Summary Box (Fase 3) ───────────────────────────────────────

export interface TaskStats {
    steps: number;
    durationSec: number | string;
    toolsUsed: Record<string, { ok: number; fail: number }>;
    evidenceIds: string[];
    models: string[];
}

export function printTaskSummary(stats: TaskStats): void {
    // Jangan berisik untuk percakapan biasa tanpa eksekusi tool.
    const toolEntries = Object.entries(stats.toolsUsed || {});
    if (toolEntries.length === 0 && stats.steps <= 1) return;

    const width = Math.min(getTerminalWidth(), 64);
    const borderH = '─'.repeat(Math.max(8, width - 2));
    const line = (content: string) => {
        const clean = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
        const pad = Math.max(0, width - 3 - clean.length);
        emit(chalk.dim('│ ') + content + ' '.repeat(pad));
    };

    emit(chalk.dim(`╭${borderH}╮`));
    line(chalk.bold('Task Summary'));
    line(`Durasi   : ${stats.durationSec}s · ${stats.steps} langkah`);
    if (toolEntries.length > 0) {
        const toolStr = toolEntries
            .map(([name, c]) => {
                const bits: string[] = [];
                if (c.ok > 0) bits.push(chalk.green(`${c.ok}✓`));
                if (c.fail > 0) bits.push(chalk.red(`${c.fail}✗`));
                return `${name} ${bits.join('')}`;
            })
            .join(chalk.dim(', '));
        line(`Tools    : ${toolStr}`);
    }
    if (stats.evidenceIds.length > 0) {
        const shown = stats.evidenceIds.slice(0, 4).map(id => `[EVID:${id}]`).join(' ');
        const more = stats.evidenceIds.length > 4 ? chalk.dim(` (+${stats.evidenceIds.length - 4})`) : '';
        line(`Evidence : ${shown}${more}`);
    }
    if (stats.models.length > 0) {
        line(`Model    : ${[...new Set(stats.models)].join(', ')}`);
    }
    emit(chalk.dim(`╰${borderH}╯`));
}
