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

marked.setOptions({
    mangle: false,
    headerIds: false,
    renderer: new TerminalRenderer({
        width: process.stdout.columns ? Math.max(80, process.stdout.columns - 4) : 120,
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

const DIVIDER = chalk.dim('──────────────────────────────────────────────────────────');

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
 */
export function printRoutingStatus(metadata: RoutingMetadata, lastModel: string): string {
    const currentModel = metadata.model || 'Unknown';
    const currentProvider = metadata.provider || 'Unknown';
    const currentTier = metadata.tier || 'SLM';
    const currentReason = metadata.reason || '-';

    if (lastModel && lastModel !== currentModel) {
        console.log(chalk.yellow(`\n🔄 [Brain Swapped] `) + chalk.dim(`${lastModel} ──► `) + chalk.green.bold(currentModel) + chalk.dim(` (${currentReason})` + '\n'));
    } else {
        console.log(chalk.dim(`Cognitive Route: ${chalk.cyan(currentTier)} (${chalk.white(currentModel)} via ${chalk.white(currentProvider)}) [Reason: ${chalk.italic(currentReason)}]` + '\n'));
    }
    return currentModel;
}

/** Format thoughts process within clean vertical lines (AGY Styled) */
export function printThought(thought: string, durationSec: number = 0, estimatedTokens: number = 0) {
    const tokenStr = estimatedTokens >= 1000 
        ? `${(estimatedTokens / 1000).toFixed(1)}k` 
        : `${estimatedTokens || Math.round(thought.length / 3.7)}`;
    const durSec = durationSec || Math.round(thought.length / 500) || 1;
    // Hanya tampilkan ringkasan 1 baris untuk menghemat ruang obrolan (Hide detail)
    console.log(chalk.cyan(`\n▸ Thought for ${durSec}s, ${tokenStr} tokens ${chalk.dim('(Hidden)')}`));
}

/** Render a beautiful unified-like git diff for file writes and edits */
export function printFileDiff(filePath: string, newContent: string) {
    const absolutePath = path.resolve(process.cwd(), 'workspace', filePath);
    console.log(chalk.cyan(`\n📄 FILE TARGET: ${chalk.bold(filePath)}`));
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

/** Prints assistant response indented for clarity */
export async function printAssistantText(text: string) {
    if (!text.trim()) return;
    const rendered = await marked(text);
    console.log(`\n${chalk.magenta.bold('ANT ❯')}`);
    console.log(rendered.trim());
    console.log();
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
    } else if (toolName === 'write_file') {
        actionLabel = 'Write';
        argValue = args.file || args.path || '';
    } else if (toolName === 'modify_file') {
        actionLabel = 'Edit';
        argValue = args.file || args.path || '';
    } else if (toolName === 'list_dir') {
        actionLabel = 'ListDir';
        argValue = args.path || args.dir || '';
    } else if (toolName === 'shell_exec') {
        actionLabel = 'Bash';
        argValue = args.command || '';
    } else if (toolName === 'grep_search') {
        actionLabel = 'Search';
        argValue = args.query || '';
    } else if (toolName === 'web_request') {
        actionLabel = 'Fetch';
        argValue = args.url || '';
    } else {
        actionLabel = toolName.charAt(0).toUpperCase() + toolName.slice(1);
        argValue = typeof args === 'object' ? JSON.stringify(args) : String(args);
    }

    let displayArg = argValue;
    let suffix = '';

    if (displayArg.length > 55) {
        const prefixLen = 22;
        const suffixLen = 25;
        displayArg = displayArg.slice(0, prefixLen) + '...' + displayArg.slice(-suffixLen);
        suffix = ' (ctrl+o to expand)';
    }

    const evidStr = evidenceId ? ` [EVID:${evidenceId}]` : '';
    console.log(chalk.cyan(`● ${actionLabel}(${displayArg})${suffix}${chalk.dim(evidStr)}`));
}

export function printToolFailure(toolName: string, args: Record<string, any> = {}, error: string = '') {
    let actionLabel = '';
    let argValue = '';

    if (toolName === 'read_file') {
        actionLabel = 'Read';
        argValue = args.file || args.path || '';
    } else if (toolName === 'write_file') {
        actionLabel = 'Write';
        argValue = args.file || args.path || '';
    } else if (toolName === 'modify_file') {
        actionLabel = 'Edit';
        argValue = args.file || args.path || '';
    } else if (toolName === 'list_dir') {
        actionLabel = 'ListDir';
        argValue = args.path || args.dir || '';
    } else if (toolName === 'shell_exec') {
        actionLabel = 'Bash';
        argValue = args.command || '';
    } else if (toolName === 'grep_search') {
        actionLabel = 'Search';
        argValue = args.query || '';
    } else if (toolName === 'web_request') {
        actionLabel = 'Fetch';
        argValue = args.url || '';
    } else {
        actionLabel = toolName.charAt(0).toUpperCase() + toolName.slice(1);
        argValue = typeof args === 'object' ? JSON.stringify(args) : String(args);
    }

    let displayArg = argValue;
    if (displayArg.length > 55) {
        displayArg = displayArg.slice(0, 22) + '...' + displayArg.slice(-25) + ' (ctrl+o to expand)';
    }

    console.log(chalk.red(`● ${actionLabel}(${displayArg}) failed: ${error}`));
}

export function printApprovalBox(tool: string, risk: 'LOW' | 'MEDIUM' | 'HIGH', reason: string) {
    const riskColor = risk === 'HIGH' ? chalk.red.bold : risk === 'MEDIUM' ? chalk.yellow.bold : chalk.green.bold;

    console.log(chalk.cyan('  🛡️  ANT SECURE GATEWAY'));
    console.log(chalk.cyan('  │') + chalk.cyan('  Action      : ') + chalk.white(tool));
    console.log(chalk.cyan('  │') + chalk.cyan('  Risk Level  : ') + riskColor(risk));
    console.log(chalk.cyan('  │') + chalk.cyan('  Description : ') + chalk.italic(reason));
}

export function printAutoExecuteNotice() {
    console.log(chalk.dim.italic(`[Auto-Executing Safe Tool...]`));
}

export function printDenied() {
    console.log(chalk.red('✖ Eksekusi dibatalkan oleh pengguna.\n'));
}

export function printBlocked(reason: string) {
    console.log(chalk.bgRed.white.bold(' ⛔ DIBLOKIR OTOMATIS ') + ' ' + chalk.red(reason) + '\n');
}

/** Attempt limit reach message */
export function printAttemptLimitReached(max: number) {
    console.log('\n' + DIVIDER);
    console.log(chalk.bold.red(`⛔ BATAS PERCOBAAN TERCAPAI (${max})`));
    console.log(chalk.dim('Agent dihentikan paksa karena mencapai jumlah langkah maksimum.'));
    console.log(chalk.dim('Tugas mungkin belum selesai — periksa hasil terakhir atau lanjutkan di sesi baru.'));
    console.log(DIVIDER + '\n');
}

/** Ctrl+C graceful cancel print */
export function printCancelled() {
    console.log('\n' + chalk.bold.yellow('⏸  Dibatalkan oleh pengguna (SIGINT). Sesi dihentikan dengan aman.\n'));
}

export function printConnectionError(message: string) {
    console.log(chalk.red(`\n✖ Gagal terhubung ke model Kognitif: ${message}`));
}

export function printToolParseFailure() {
    console.log(chalk.dim.italic(`[Tool call terdeteksi tapi gagal di-parse. Diteruskan sebagai teks biasa — cek log untuk detail.]`));
}
