// ============================================================================
// ANT — CLI Agent Loop — Permission / Approval Gate
// ============================================================================

import type { ApprovalResult, ToolCall } from './types.js';
import * as ui from './ui.js';
import { isBrowserTool } from './browserTool.js';
import chalk from 'chalk';
import { requestDomainApproval } from './browserPermissions.js';

let sessionAutoApprove = false;

export function setSessionAutoApprove(auto: boolean) {
    sessionAutoApprove = auto;
}

export function isSessionAutoApprove(): boolean {
    return sessionAutoApprove;
}

const SAFE_TOOLS = new Set([
    'read_file', 'list_dir', 'env_check', 'web_request', 'image_generate', 'open_browser',
    'mexc_get_balance_futures', 'mexc_get_ticker_futures', 'mexc_get_open_positions',
    'mexc_get_open_orders', 'mexc_get_order_history', 'mexc_get_index_price', 'mexc_get_risk_info',
    'mexc_get_klines'
]);

type ArgValidator = (args: Record<string, any>) => string | null;

const ARG_VALIDATORS: Record<string, ArgValidator> = {
    shell_exec: (args) => {
        const cmd = String(args?.command || '');
        const dangerousPatterns = [
            /rm\s+-rf\s+\//,
            /:\(\)\{.*;\s*:.*\}/,
            /mkfs(\.\w+)?\s+\/dev/,
            /dd\s+if=.*of=\/dev\/(sd|nvme|hd)/
        ];
        if (dangerousPatterns.some(p => p.test(cmd))) {
            return `Perintah shell terdeteksi pola berisiko tinggi: "${cmd.slice(0, 80)}"`;
        }
        return null;
    }
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
    if (sessionAutoApprove) {
        ui.printToolCallHeader(toolCall.tool);
        ui.printToolArgs(toolCall.args);
        console.log(chalk.dim('  ⚡ Auto-approved by session policy (Don\'t ask again).'));
        return { decision: 'approved', isSafe: false };
    }

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

    const risk = getToolRisk(toolCall.tool);
    const reason = getToolReason(toolCall.tool);

    if (toolCall.tool === 'modify_file' || toolCall.tool === 'write_file' || toolCall.tool === 'ant_skill_create') {
        const filePath = toolCall.tool === 'ant_skill_create' 
            ? `skills/ant_skills/${toolCall.args.fileName || toolCall.args.file || toolCall.args.path || toolCall.args.name || 'unknown.js'}` 
            : (toolCall.args.file || toolCall.args.path || toolCall.args.fileName);
        const fileContent = toolCall.tool === 'ant_skill_create'
            ? toolCall.args.code
            : (toolCall.args.content || toolCall.args.code);

        ui.printFileDiff(filePath, fileContent);
        console.log(chalk.bold('\nAccept this file edit?'));
        console.log('  1. Yes, accept this change (Sekali)');
        console.log('  2. Yes, approve all for this session (Jangan tanya lagi)');
        console.log('  3. No, reject this change (Tolak)');
        
        while (true) {
            const answer = await askQuestion(chalk.cyan('> '));
            const normalized = answer.trim().toLowerCase();
            
            if (normalized === '' || normalized === '1' || normalized === 'y' || normalized === 'yes') {
                return { decision: 'approved', isSafe: false };
            }
            if (normalized === '2' || normalized === 'all' || normalized === 'always') {
                setSessionAutoApprove(true);
                console.log(chalk.green('  ✓ Auto-approve diaktifkan untuk sisa sesi ini.'));
                return { decision: 'approved', isSafe: false };
            }
            if (normalized === '3' || normalized === 'n' || normalized === 'no') {
                return { decision: 'denied', isSafe: false };
            }
            console.log(chalk.yellow('Pilih 1, 2, atau 3.'));
        }
    }

    ui.printApprovalBox(toolCall.tool, risk, reason);

    while (true) {
        const answer = await askQuestion('\n⚠️  Approve execution? (1/Y: Approve, 2/Always: Allow All Session, 3/N: Reject, V: Details): ');
        const normalized = answer.trim().toLowerCase();
        
        if (normalized === 'v' || normalized === 'view') {
            console.log('\n╭──────────────────────────────────────────────────────────');
            console.log('│ ' + JSON.stringify(toolCall.args, null, 2).split('\n').join('\n│ '));
            console.log('╰──────────────────────────────────────────────────────────\n');
            continue;
        }
        
        if (normalized === '2' || normalized === 'always' || normalized === 'all' || normalized === 'a') {
            setSessionAutoApprove(true);
            console.log(chalk.green('  ✓ Auto-approve diaktifkan untuk sisa sesi ini.'));
            return { decision: 'approved', isSafe: false };
        }

        const approved = normalized === '' || normalized === '1' || normalized === 'y' || normalized === 'yes';
        return { decision: approved ? 'approved' : 'denied', isSafe: false };
    }
}
