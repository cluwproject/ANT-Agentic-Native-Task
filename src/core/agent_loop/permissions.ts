// ============================================================================
// ANT — CLI Agent Loop — Permission / Approval Gate
// ============================================================================

import type { ApprovalResult, ToolCall } from './types.js';
import * as ui from './ui.js';
import { isBrowserTool } from './browserTool.js';
import chalk from 'chalk';
import { requestDomainApproval } from './browserPermissions.js';

export interface ExecutionPolicy {
    scope: 'once' | 'session' | 'rejected';
    tool: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    expiresAt: number | null;
}

const activePolicies: ExecutionPolicy[] = [];

export class RateLimiter {
    private callLog = new Map<string, number[]>();
    
    checkLimit(tool: string, limit = 10, windowMs = 60000): boolean {
        const now = Date.now();
        let timestamps = this.callLog.get(tool) || [];
        timestamps = timestamps.filter(t => now - t < windowMs);
        if (timestamps.length >= limit) return false;
        timestamps.push(now);
        this.callLog.set(tool, timestamps);
        return true;
    }

    clear(): void {
        this.callLog.clear();
    }
}

export const globalRateLimiter = new RateLimiter();

export function addSessionPolicy(tool: string, riskLevel: 'LOW' | 'MEDIUM' | 'HIGH') {
    activePolicies.push({
        scope: 'session',
        tool,
        riskLevel,
        expiresAt: Date.now() + 1000 * 60 * 60 * 2 // 2 hours expiry
    });
}

export function isToolAutoApproved(tool: string, riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'): boolean {
    const now = Date.now();
    return activePolicies.some(policy => 
        policy.scope === 'session' && 
        policy.tool === tool &&
        policy.riskLevel === riskLevel &&
        (policy.expiresAt === null || policy.expiresAt > now)
    );
}

const SAFE_TOOLS = new Set([
    'read_file', 'list_dir', 'env_check', 'web_request', 'image_generate', 'open_browser',
    'git_status', 'git_diff', 'git_log', 'git_checkpoint', 'git_commit',
    'grep_search', 'web_search', 'fetch_url_content'
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
    const risk = getToolRisk(toolCall.tool);
    
    // Rate Limiting Check
    if (!globalRateLimiter.checkLimit(toolCall.tool, 15, 60000)) {
        return { 
            decision: 'denied', 
            isSafe: false,
            reason: `[RATE LIMIT EXCEEDED] Tool '${toolCall.tool}' dipanggil terlalu cepat (>15x per menit). Misi dibatalkan sementara untuk mencegah deadlock loop.` 
        };
    }

    if (isToolAutoApproved(toolCall.tool, risk)) {
        ui.printToolCallHeader(toolCall.tool);
        ui.printToolArgs(toolCall.args);
        console.log(chalk.dim(`  Auto-approved by execution policy [tool: ${toolCall.tool}, risk: ${risk}].`));
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

    const reason = getToolReason(toolCall.tool);

    if (toolCall.tool === 'modify_file' || toolCall.tool === 'write_file' || toolCall.tool === 'ant_skill_create') {
        const filePath = toolCall.tool === 'ant_skill_create' 
            ? `skills/ant_skills/${toolCall.args.fileName || toolCall.args.file || toolCall.args.path || toolCall.args.name || 'unknown.js'}` 
            : (toolCall.args.file || toolCall.args.path || toolCall.args.fileName);
        const fileContent = toolCall.tool === 'ant_skill_create'
            ? toolCall.args.code
            : (toolCall.args.content || toolCall.args.code);

        ui.printFileDiff(filePath, fileContent);
        console.log(chalk.bold('\nApprove this file change?'));
        console.log(chalk.dim('  [y] once   [a] always this session   [n] deny   [v] view full'));
        
        while (true) {
            const answer = await askQuestion(chalk.cyan('> '));
            const normalized = answer.trim().toLowerCase();
            
            if (normalized === '' || normalized === '1' || normalized === 'y' || normalized === 'yes') {
                return { decision: 'approved', isSafe: false };
            }
            if (normalized === '2' || normalized === 'a' || normalized === 'all' || normalized === 'always') {
                addSessionPolicy(toolCall.tool, risk);
                console.log(chalk.green(`  ✓ Auto-approve diaktifkan untuk '${toolCall.tool}' (Risk: ${risk}) selama sesi ini.`));
                return { decision: 'approved', isSafe: false };
            }
            if (normalized === '3' || normalized === 'n' || normalized === 'no') {
                return { decision: 'denied', isSafe: false };
            }
            if (normalized === 'v' || normalized === 'view') {
                console.log('\n' + chalk.dim('─'.repeat(60)));
                console.log(fileContent);
                console.log(chalk.dim('─'.repeat(60)) + '\n');
                continue;
            }
            console.log(chalk.yellow('Pilih: [y] approve, [a] always session, [n] deny, [v] view'));
        }
    }

    ui.printApprovalBox(toolCall.tool, risk, reason);
    const argSummary = JSON.stringify(toolCall.args);
    if (argSummary && argSummary.length > 2) {
        console.log(chalk.dim(`  Args        : ${argSummary.slice(0, 80)}${argSummary.length > 80 ? '...' : ''}`));
    }

    while (true) {
        const answer = await askQuestion(chalk.yellow('\n⚠️  Approve execution? ') + chalk.dim('[y] once  [a] always  [n] deny  [v] details: '));
        const normalized = answer.trim().toLowerCase();
        
        if (normalized === 'v' || normalized === 'view') {
            console.log('\n╭──────────────────────────────────────────────────────────');
            console.log('│ ' + JSON.stringify(toolCall.args, null, 2).split('\n').join('\n│ '));
            console.log('╰──────────────────────────────────────────────────────────\n');
            continue;
        }
        
        if (normalized === '2' || normalized === 'a' || normalized === 'always' || normalized === 'all') {
            addSessionPolicy(toolCall.tool, risk);
            console.log(chalk.green(`  ✓ Auto-approve diaktifkan untuk '${toolCall.tool}' (Risk: ${risk}) selama sesi ini.`));
            return { decision: 'approved', isSafe: false };
        }

        if (normalized === '3' || normalized === 'n' || normalized === 'no') {
            return { decision: 'denied', isSafe: false };
        }

        const approved = normalized === '' || normalized === '1' || normalized === 'y' || normalized === 'yes';
        return { decision: approved ? 'approved' : 'denied', isSafe: false };
    }
}

