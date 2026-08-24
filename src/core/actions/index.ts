import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../../utils/logger.js';
import { handleFileOps } from './file_ops.js';
import { handleShellOps } from './shell_ops.js';
import { handleWebOps } from './web_ops.js';
import { handleSkillOps } from './skill_ops.js';
import { handleBrowserOps } from './browser_ops.js';

const BASE_DIR = process.cwd();
const WORKSPACE_DIR = BASE_DIR;

const TRUST_FILE = path.join(BASE_DIR, 'workspace', 'registry', 'trust.json');
const TRUST_SHADOW_FILE = path.join(BASE_DIR, 'workspace', 'core', 'trust.shadow.json');

export async function getTrustScore(action: string) {
    try {
        await fs.mkdir(path.dirname(TRUST_FILE), { recursive: true });
        await fs.mkdir(path.dirname(TRUST_SHADOW_FILE), { recursive: true });

        const [primaryRaw, shadowRaw] = await Promise.all([
            fs.readFile(TRUST_FILE, 'utf-8').catch(() => '{}'),
            fs.readFile(TRUST_SHADOW_FILE, 'utf-8').catch(() => '{}')
        ]);

        let primaryTrust: any = {};
        let shadowTrust: any = {};

        try { primaryTrust = JSON.parse(primaryRaw); } catch { primaryTrust = {}; }
        try { shadowTrust = JSON.parse(shadowRaw); } catch { shadowTrust = {}; }

        const primaryItem = primaryTrust[action] || { score: 50, consecutive_success: 0 };
        const shadowItem = shadowTrust[action] || { score: 50, consecutive_success: 0 };

        if (primaryItem.score !== shadowItem.score || primaryItem.consecutive_success !== shadowItem.consecutive_success) {
            const pessimisticScore = Math.min(primaryItem.score, shadowItem.score);
            const pessimisticConsecutive = Math.min(primaryItem.consecutive_success, shadowItem.consecutive_success);

            Logger.log('WARN', `Trust Data Drift Detected on Action: [${action}]. Restoring with Pessimistic Resolution.`, {}, 'SECURITY');

            const secureItem = { score: pessimisticScore, consecutive_success: pessimisticConsecutive };
            primaryTrust[action] = secureItem;
            shadowTrust[action] = secureItem;

            await Promise.all([
                fs.writeFile(TRUST_FILE, JSON.stringify(primaryTrust, null, 2)),
                fs.writeFile(TRUST_SHADOW_FILE, JSON.stringify(shadowTrust, null, 2))
            ]).catch(() => {});

            return secureItem;
        }

        return primaryItem;
    } catch (e) {
        return { score: 50, consecutive_success: 0 };
    }
}

export async function updateTrustScore(action: string, success: boolean) {
    try {
        await fs.mkdir(path.dirname(TRUST_FILE), { recursive: true });
        await fs.mkdir(path.dirname(TRUST_SHADOW_FILE), { recursive: true });

        const [primaryRaw, shadowRaw] = await Promise.all([
            fs.readFile(TRUST_FILE, 'utf-8').catch(() => '{}'),
            fs.readFile(TRUST_SHADOW_FILE, 'utf-8').catch(() => '{}')
        ]);

        let primaryTrust: any = {};
        let shadowTrust: any = {};

        try { primaryTrust = JSON.parse(primaryRaw); } catch { primaryTrust = {}; }
        try { shadowTrust = JSON.parse(shadowRaw); } catch { shadowTrust = {}; }

        const primaryCurrent = primaryTrust[action] || { score: 50, consecutive_success: 0 };
        const shadowCurrent = shadowTrust[action] || { score: 50, consecutive_success: 0 };

        const current = {
            score: Math.min(primaryCurrent.score, shadowCurrent.score),
            consecutive_success: Math.min(primaryCurrent.consecutive_success, shadowCurrent.consecutive_success)
        };
        
        if (success) {
            current.consecutive_success += 1;
            if (current.consecutive_success % 3 === 0) {
                current.score = Math.min(100, current.score + 5);
            }
        } else {
            current.consecutive_success = 0;
            current.score = Math.max(0, current.score - 15);
        }
        
        primaryTrust[action] = current;
        shadowTrust[action] = current;

        await Promise.all([
            fs.writeFile(TRUST_FILE, JSON.stringify(primaryTrust, null, 2)),
            fs.writeFile(TRUST_SHADOW_FILE, JSON.stringify(shadowTrust, null, 2))
        ]);
    } catch (e) {}
}

export async function executeAction(actionName: string, details: any, attempts = 3, context?: any) {
    let action = actionName.trim();
    
    // Graceful alias mapping for hallucinated model tool calls
    if (action === 'container.exec' || action === 'bash' || action === 'cmd' || action === 'execute' || action === 'run_command') {
        action = 'shell_exec';
        if (details && Array.isArray(details.cmd)) {
            details.command = details.cmd.join(' ');
        } else if (details && details.cmd && typeof details.cmd === 'string') {
            details.command = details.cmd;
        } else if (details && details.code && typeof details.code === 'string') {
            details.command = details.code;
        }
    }
    
    const trust = await getTrustScore(action);
    const isHighTrust = trust.score >= 85;
    const hardcaps = ['shell_exec', 'exec', 'npm_install', 'task_delete', 'delete_file'];
    
    let needsApproval = hardcaps.includes(action);
    if (needsApproval && (action === 'shell_exec' || action === 'exec')) {
        const command = details?.command || '';
        const isReadOnly = /^(ls|pwd|echo|cat\s+(?!.*\.env)|node\s+-v|npm\s+-v|git\s+log|git\s+status|git\s+diff|which|type|find\s+.*-name|grep\s+.*-r)/.test(command.trim());
        if (isReadOnly) {
            needsApproval = false;
        }
    }
    
    if (needsApproval && !context?.manual_approval) {
        Logger.log('WARN', `Trust Gate: Aksi '${action}' ditunda karena memerlukan persetujuan manual dari Ard.`, {}, 'SECURITY');
        throw new Error(`APPROVAL_REQUIRED: Aksi '${action}' memerlukan persetujuan manual dari Ard.`);
    }

    Logger.log('INFO', `Executing Action: ${action} (Attempt: ${4 - attempts}/3)...`, details, 'SYSTEM');

    let lastError: any;
    for (let i = 0; i < attempts; i++) {
        try {
            // 0. MCP Tools (Model Context Protocol) — routing sebelum native ops.
            //    Nama tool format: mcp__<server>__<tool>. Tetap melewati trust
            //    gate di atas sehingga kebijakan approval tetap berlaku.
            if (action.startsWith('mcp__')) {
                const { callMcpTool } = await import('../mcp/registry.js');
                const mcpRes = await callMcpTool(action, details || {});
                await updateTrustScore(action, true);
                Logger.log('INFO', `MCP tool executed: ${action}`, {}, 'MCP');
                return {
                    status: 'success',
                    source: 'mcp',
                    action,
                    text: mcpRes.text,
                    raw: typeof mcpRes.raw === 'string' ? mcpRes.raw : JSON.stringify(mcpRes.raw ?? {})
                };
            }

            // 1. File Ops
            const fileRes = await handleFileOps(action, details, WORKSPACE_DIR, BASE_DIR, context);
            if (fileRes !== null) {
                await updateTrustScore(action, true);
                return fileRes;
            }

            // 2. Shell Ops
            const shellRes = await handleShellOps(action, details, WORKSPACE_DIR, BASE_DIR, context, isHighTrust);
            if (shellRes !== null) {
                await updateTrustScore(action, true);
                return shellRes;
            }

            // 3. Web Ops
            const webRes = await handleWebOps(action, details, WORKSPACE_DIR, BASE_DIR);
            if (webRes !== null) {
                await updateTrustScore(action, true);
                return webRes;
            }

            // 4. Skill Ops
            const skillRes = await handleSkillOps(action, details, WORKSPACE_DIR, BASE_DIR);
            if (skillRes !== null) {
                await updateTrustScore(action, true);
                return skillRes;
            }

            // 5. Browser Ops
            const browserRes = await handleBrowserOps(action, details, context);
            if (browserRes !== null) {
                await updateTrustScore(action, true);
                return browserRes;
            }

            throw new Error(`Unknown action type: ${action}`);
        } catch (error: any) {
            lastError = error;
            await updateTrustScore(action, false);
            Logger.log('WARN', `Attempt ${i + 1} failed for ${action}: ${error.message}`, {}, 'SYSTEM');
            
            const errMsg = (error.message || '').toLowerCase();
            const isFatalOrAuth = error.message.startsWith('FATAL:') || 
                error.message.includes('ACCESS_DENIED') || 
                error.message.includes('SECURITY_VIOLATION') ||
                errMsg.includes('auth') || 
                errMsg.includes('credential') || 
                errMsg.includes('unauthorized') || 
                errMsg.includes('quota') || 
                errMsg.includes('limit') || 
                errMsg.includes('token') ||
                errMsg.includes('grant') ||
                errMsg.includes('401') ||
                errMsg.includes('403') ||
                errMsg.includes('429');

            if (isFatalOrAuth) {
                break;
            }

            if (i < attempts - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    throw lastError;
}
