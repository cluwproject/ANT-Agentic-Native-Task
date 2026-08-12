// ============================================================================
// ANT — CLI Agent Loop — Permission / Approval Gate
// ============================================================================
// Pola ini meniru semangat sistem permission Claude Code: ada satu titik
// tunggal (requestApproval) yang bisa diperluas jadi validator per-tool
// (mirip PreToolUse hook) tanpa mengubah agentLoop.ts. "Safe" di sini berarti
// "tidak perlu konfirmasi interaktif" — BUKAN "bebas risiko", makanya
// argumennya tetap ditampilkan dan tetap melewati validator sebelum jalan.

import type { ApprovalResult, ToolCall } from '../core/agent_loop/types.js';
import * as ui from '../core/agent_loop/ui.js';
import { isBrowserTool } from '../core/agent_loop/browserTool.js';
import chalk from 'chalk';
import { requestDomainApproval } from '../core/agent_loop/browserPermissions.js';

// Tool yang dianggap read-only / tidak mengubah state eksternal secara
// destruktif. Daftar ini sama seperti versi lama — dipindah ke sini saja
// supaya tidak tercampur dengan logika loop.
const SAFE_TOOLS = new Set([
    'read_file', 'list_dir', 'env_check', 'web_request', 'image_generate', 'open_browser',
    'mexc_get_balance_futures', 'mexc_get_ticker_futures', 'mexc_get_open_positions',
    'mexc_get_open_orders', 'mexc_get_order_history', 'mexc_get_index_price', 'mexc_get_risk_info',
    'mexc_get_klines',
    // GOD MODE: Allow autonomous file modification and skill creation
    'modify_file', 'write_file', 'ant_skill_create'
]);

// Titik ekstensi mirip PreToolUse hook: tambahkan validator per-tool kalau
// perlu pengecekan ARGUMEN, bukan cuma nama tool. Return string alasan
// untuk block otomatis, atau null jika lolos. Ini berlaku untuk semua tool,
// termasuk yang ada di SAFE_TOOLS — supaya "safe" tidak berarti "tidak
// pernah dicek sama sekali".
type ArgValidator = (args: Record<string, any>) => string | null;

const ARG_VALIDATORS: Record<string, ArgValidator> = {
    shell_exec: (args) => {
        const cmd = String(args?.command || '');
        const dangerousPatterns = [
            /rm\s+-rf\s+\//,        // hapus paksa dari root
            /:\(\)\{.*;\s*:.*\}/,   // fork bomb klasik
            /mkfs(\.\w+)?\s+\/dev/, // format device
            /dd\s+if=.*of=\/dev\/(sd|nvme|hd)/ // overwrite disk mentah
        ];
        if (dangerousPatterns.some(p => p.test(cmd))) {
            return `Perintah shell terdeteksi pola berisiko tinggi: "${cmd.slice(0, 80)}"`;
        }
        return null;
    }
    // Tambahkan validator lain di sini, mis. web_request → batasi domain,
    // atau mexc_* → pastikan tidak menyentuh endpoint order/eksekusi trading
    // (saat ini semua mexc_* di daftar hanya endpoint GET/read-only).
};

export function isSafeTool(toolName: string): boolean {
    return SAFE_TOOLS.has(toolName);
}

export function runArgValidator(toolCall: ToolCall): string | null {
    const validator = ARG_VALIDATORS[toolCall.tool];
    if (!validator) return null;
    return validator(toolCall.args);
}

function getToolRisk(toolName: string): 'LOW' | 'MEDIUM' | 'HIGH' {
    const highRisk = ['shell_exec', 'modify_file', 'write_file', 'delete_file', 'ant_skill_create'];
    const mediumRisk = ['web_request', 'open_browser', 'browser_click', 'browser_type', 'browser_navigate'];
    if (highRisk.includes(toolName)) return 'HIGH';
    if (mediumRisk.includes(toolName)) return 'MEDIUM';
    return 'LOW';
}

function getToolReason(toolName: string): string {
    const reasons: Record<string, string> = {
        shell_exec: 'Menjalankan perintah langsung di terminal/sistem.',
        write_file: 'Membuat file baru di dalam workspace.',
        modify_file: 'Mengubah isi file yang sudah ada di workspace.',
        delete_file: 'Menghapus file di dalam workspace.',
        ant_skill_create: 'Membuat atau memperbarui skrip skill otonom.',
        web_request: 'Mengirimkan request HTTP ke URL eksternal.',
        open_browser: 'Membuka instansi browser Playwright.',
        browser_click: 'Melakukan klik elemen pada halaman web.',
        browser_type: 'Mengetik teks pada elemen halaman web.',
        browser_navigate: 'Melakukan navigasi browser ke halaman web.',
    };
    return reasons[toolName] || 'Melakukan operasi internal sistem.';
}

export async function requestApproval(
    toolCall: ToolCall,
    askQuestion: (q: string) => Promise<string>
): Promise<ApprovalResult> {
    // Browser tool punya model approval sendiri: per-DOMAIN, bukan per-nama-
    // tool. "browser_navigate" selalu sama nama tool-nya terlepas tujuannya
    // example.com atau situs internal sensitif — jadi approval Y/n generik
    // di sini tidak cukup granular. Delegasikan ke browserPermissions.
    if (isBrowserTool(toolCall.tool) && typeof toolCall.args?.url === 'string') {
        ui.printToolCallHeader(toolCall.tool);
        ui.printToolArgs(toolCall.args);

        const domainResult = await requestDomainApproval(toolCall.args.url, askQuestion);

        if (domainResult.reason === 'local-dev') {
            ui.printAutoExecuteNotice();
        }

        return {
            decision: domainResult.approved ? (domainResult.reason === 'local-dev' ? 'auto' : 'approved') : 'denied',
            isSafe: domainResult.reason === 'local-dev'
        };
    }

    const safe = isSafeTool(toolCall.tool);

    // Validator argumen berjalan untuk SEMUA tool, termasuk yang "safe".
    const blockReason = runArgValidator(toolCall);
    if (blockReason) {
        ui.printToolCallHeader(toolCall.tool);
        ui.printToolArgs(toolCall.args);
        ui.printBlocked(blockReason);
        return { decision: 'denied', isSafe: safe };
    }

    if (safe) {
        ui.printToolCallHeader(toolCall.tool);
        ui.printToolArgs(toolCall.args);
        ui.printAutoExecuteNotice();
        return { decision: 'auto', isSafe: true };
    }

    // Hitung risk & reason
    const risk = getToolRisk(toolCall.tool);
    const reason = getToolReason(toolCall.tool);

    // Diff & custom prompt for file edits
    if (toolCall.tool === 'modify_file' || toolCall.tool === 'write_file' || toolCall.tool === 'ant_skill_create') {
        const filePath = toolCall.tool === 'ant_skill_create' 
            ? `skills/ant_skills/${toolCall.args.fileName || toolCall.args.file || toolCall.args.path || toolCall.args.name || 'unknown.js'}` 
            : (toolCall.args.file || toolCall.args.path || toolCall.args.fileName);
        const fileContent = toolCall.tool === 'ant_skill_create'
            ? toolCall.args.code
            : (toolCall.args.content || toolCall.args.code);

        ui.printFileDiff(filePath, fileContent);
        console.log(chalk.cyan('\n  shift+tab to auto-approve file edits'));
        console.log(chalk.bold('Accept this file edit?'));
        console.log('  1. Yes, accept this change');
        console.log('  2. No, reject this change');
        
        while (true) {
            const answer = await askQuestion(chalk.cyan('> '));
            const normalized = answer.trim().toLowerCase();
            const approved = normalized === '' || normalized === '1' || normalized === 'y' || normalized === 'yes';
            const denied = normalized === '2' || normalized === 'n' || normalized === 'no';
            
            if (approved) {
                return { decision: 'approved', isSafe: false };
            }
            if (denied) {
                return { decision: 'denied', isSafe: false };
            }
            console.log(chalk.yellow('Pilih 1 atau 2.'));
        }
    }

    // Cetak approval box terstruktur
    ui.printApprovalBox(toolCall.tool, risk, reason);

    // Interactive Loop
    while (true) {
        const answer = await askQuestion('\n⚠️  Approve execution? (Y: Approve, N: Cancel, V: View Details): ');
        const normalized = answer.trim().toLowerCase();
        
        if (normalized === 'v' || normalized === 'view') {
            console.log('\n╭──────────────────────────────────────────────────────────');
            console.log('│ ' + JSON.stringify(toolCall.args, null, 2).split('\n').join('\n│ '));
            console.log('╰──────────────────────────────────────────────────────────\n');
            continue;
        }
        
        const approved = normalized === '' || normalized === 'y' || normalized === 'yes';
        return { decision: approved ? 'approved' : 'denied', isSafe: false };
    }
}
