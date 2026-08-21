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

export function getTerminalWidth(): number {
    const cols = process.stdout.columns || 80;
    return Math.max(40, cols);
}

export function getDivider(): string {
    return chalk.dim('─'.repeat(getTerminalWidth()));
}

export function startSpinner(text: string): any {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    let currentText = text;
    
    // Fallback: cetak statis tanpa enter jika bukan TTY
    if (!process.stdout.isTTY) {
        process.stdout.write(chalk.blueBright(`- ${currentText}... `));
        return {
            stop: () => process.stdout.write('\n'),
            clear: () => {},
            set text(val: string) { currentText = val; }
        };
    }

    const timer = setInterval(() => {
        process.stdout.write(`\r\x1b[K${chalk.cyan(frames[i])} ${chalk.blueBright(currentText)}`);
        i = (i + 1) % frames.length;
    }, 80);

    return {
        stop: () => {
            clearInterval(timer);
            process.stdout.write('\r\x1b[K');
        },
        clear: () => {
            process.stdout.write('\r\x1b[K');
        },
        set text(val: string) {
            currentText = val;
        }
    };
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
        console.log(chalk.yellow(`\n[Model Switched] `) + chalk.dim(`${lastModel} ➔ `) + chalk.cyan.bold(`${currentModel} (${currentProvider})`) + '\n');
    } else if (!lastModel) {
        const isDebug = process.env.ANT_DEBUG === '1' || process.env.ANT_DEBUG === 'true';
        const reasonStr = isDebug ? ` [Reason: ${chalk.italic(currentReason)}]` : '';
        console.log(chalk.dim(`Cognitive Route: ${chalk.cyan(currentTier)} (${chalk.white(currentModel)} via ${chalk.white(currentProvider)})${reasonStr}`) + '\n');
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

    console.log(chalk.cyan(`\n▸ Thought for ${durSec}s, ${tokenStr} tokens`));
    if (title) {
        console.log(chalk.dim(`  ${title}`));
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
    console.log(chalk.cyan(`\nFILE TARGET: ${chalk.bold(filePath)}`));
    console.log(chalk.dim('──────────────────────────────────────────────────────────────────'));

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
        console.log(firstPart.join('\n'));
        console.log(chalk.yellow(`     @@ ... [${diff.length - 20} lines hidden] ... @@`));
        console.log(lastPart.join('\n'));
    } else {
        console.log(diff.join('\n'));
    }
    console.log(chalk.dim('──────────────────────────────────────────────────────────────────'));
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
    console.log(`\n${chalk.magenta.bold('ANT ❯')}`);
    console.log(rendered.trim());

    if (metrics && metrics.durationSec) {
        const tokInfo = metrics.tokens ? ` (${metrics.tokens} tokens${metrics.speed ? `, ${metrics.speed} tok/s` : ''})` : '';
        console.log(chalk.dim(`\nResponse generated in ${metrics.durationSec}s${tokInfo}`));
    }

    console.log('\n' + getDivider() + '\n');
}

/** Enclose tool call inside a continuous box boundary */
export function printToolCallHeader(toolName: string) {
    // Keep it empty for compact agy-style layout
}

export function printToolArgs(args: Record<string, any>) {
    // Keep it empty for compact agy-style layout
}

export function printToolSuccess(toolName: string, args: Record<string, any> = {}, evidenceId?: string) {
    let actionLabel = '';
    let argValue = '';

    if (toolName === 'read_file') {
        actionLabel = 'Read';
        argValue = args.file || args.path || '';
    } else if (toolName === 'write_file' || toolName === 'create_file') {
        actionLabel = 'Write';
        argValue = args.file || args.path || '';
    } else if (toolName === 'modify_file' || toolName === 'edit_file') {
        actionLabel = 'Edit';
        argValue = args.file || args.path || '';
    } else if (toolName === 'list_dir') {
        actionLabel = 'ListDir';
        argValue = args.path || args.dir || '';
    } else if (toolName === 'shell_exec' || toolName === 'exec') {
        actionLabel = 'Bash';
        argValue = args.command || '';
    } else if (toolName === 'grep_search') {
        actionLabel = 'Search';
        argValue = args.query || args.pattern || '';
    } else if (toolName === 'web_request' || toolName === 'fetch_url_content') {
        actionLabel = 'Fetch';
        argValue = args.url || '';
    } else if (toolName === 'manage_task') {
        actionLabel = 'ManageTask';
        argValue = args.action ? `${args.action} ${args.taskId || ''}` : JSON.stringify(args);
    } else {
        actionLabel = toolName.charAt(0).toUpperCase() + toolName.slice(1);
        argValue = typeof args === 'object' ? JSON.stringify(args) : String(args);
    }

    let displayArg = argValue;
    if (displayArg.length > 60) {
        const prefixLen = 30;
        const suffixLen = 25;
        displayArg = displayArg.slice(0, prefixLen) + '...' + displayArg.slice(-suffixLen);
    }

    const evidStr = evidenceId ? ` [EVID:${evidenceId}]` : '';
    console.log(chalk.cyan(`● ${actionLabel}(${displayArg})`) + chalk.dim(evidStr));
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
        console.log(chalk.dim(`    │ ${line.slice(0, 100)}`));
    });
    if (lines.length > maxLines) {
        console.log(chalk.dim(`    │ ... (+${lines.length - maxLines} lines)`));
    }
}

export function printToolFailure(toolName: string, args: Record<string, any> = {}, error: string = '') {
    let actionLabel = '';
    let argValue = '';

    if (toolName === 'read_file') {
        actionLabel = 'Read';
        argValue = args.file || args.path || '';
    } else if (toolName === 'write_file' || toolName === 'create_file') {
        actionLabel = 'Write';
        argValue = args.file || args.path || '';
    } else if (toolName === 'modify_file' || toolName === 'edit_file') {
        actionLabel = 'Edit';
        argValue = args.file || args.path || '';
    } else if (toolName === 'list_dir') {
        actionLabel = 'ListDir';
        argValue = args.path || args.dir || '';
    } else if (toolName === 'shell_exec' || toolName === 'exec') {
        actionLabel = 'Bash';
        argValue = args.command || '';
    } else if (toolName === 'grep_search') {
        actionLabel = 'Search';
        argValue = args.query || args.pattern || '';
    } else if (toolName === 'web_request' || toolName === 'fetch_url_content') {
        actionLabel = 'Fetch';
        argValue = args.url || '';
    } else if (toolName === 'manage_task') {
        actionLabel = 'ManageTask';
        argValue = args.action ? `${args.action} ${args.taskId || ''}` : JSON.stringify(args);
    } else {
        actionLabel = toolName.charAt(0).toUpperCase() + toolName.slice(1);
        argValue = typeof args === 'object' ? JSON.stringify(args) : String(args);
    }

    let displayArg = argValue;
    if (displayArg.length > 60) {
        displayArg = displayArg.slice(0, 30) + '...' + displayArg.slice(-25);
    }

    console.log(chalk.cyan(`● ${actionLabel}(${displayArg})`) + chalk.red(` failed: ${error}`));
}

export function printApprovalBox(tool: string, risk: 'LOW' | 'MEDIUM' | 'HIGH', reason: string) {
    const riskColor = risk === 'HIGH' ? chalk.red.bold : risk === 'MEDIUM' ? chalk.yellow.bold : chalk.green.bold;

    console.log(chalk.cyan('  ANT SECURE GATEWAY'));
    console.log(chalk.cyan('  │') + chalk.cyan('  Action      : ') + chalk.white(tool));
    console.log(chalk.cyan('  │') + chalk.cyan('  Risk Level  : ') + riskColor(risk));
    console.log(chalk.cyan('  │') + chalk.cyan('  Description : ') + chalk.italic(reason));
}

export function printAutoExecuteNotice() {
    console.log(chalk.dim.italic(`[Auto-Executing Safe Tool...]`));
}

export function printDenied() {
    console.log(chalk.red('[Cancelled] Eksekusi dibatalkan oleh pengguna.\n'));
}

export function printBlocked(reason: string) {
    console.log(chalk.red.bold('[BLOCKED] ') + chalk.red(reason) + '\n');
}

/** Attempt limit reach message */
export function printAttemptLimitReached(max: number) {
    console.log('\n' + getDivider());
    console.log(chalk.bold.red(`[LIMIT REACHED] Attempt limit reached (${max})`));
    console.log(chalk.dim('Agent was stopped because it reached the maximum step limit.'));
    console.log(chalk.dim('Task may be incomplete — inspect the latest results or continue in a new session.'));
    console.log(getDivider() + '\n');
}

/** Ctrl+C graceful cancel print */
export function printCancelled() {
    console.log('\n' + chalk.yellow('[Interrupted] Dibatalkan oleh pengguna (SIGINT). Sesi dihentikan dengan aman.\n'));
}

export function printConnectionError(message: string) {
    console.log(chalk.red(`\n[Connection Error] Gagal terhubung ke model Kognitif: ${message}`));
}

export function printToolParseFailure() {
    console.log(chalk.dim.italic(`[Tool call terdeteksi tapi gagal di-parse. Diteruskan sebagai teks biasa — cek log untuk detail.]`));
}
