// ============================================================================
// ANT — CLI Agent Loop — Lifecycle Hooks (.ant/hooks.json)
// ============================================================================
// Hooks ala Claude Code: developer mendaftarkan shell command yang dijalankan
// otomatis pada event lifecycle agent — tanpa mengubah kode ANT.
//
// Format `.ant/hooks.json`:
// {
//   "pre_tool_call":  [{ "command": "node scripts/guard.js", "timeoutMs": 10000 }],
//   "post_tool_call": ["node scripts/notify.js"]
// }
//
// Semantik (mengikuti Claude Code):
//   - pre_tool_call  : exit code 0  → lanjut; exit code >= 2 → VETO eksekusi
//     tool; exit code 1 → peringatan saja, tool tetap jalan.
//   - post_tool_call : gagal tidak mempengaruhi hasil (fire-and-forget audit).
//
// Environment variable yang tersedia untuk hook:
//   ANTHOOK_EVENT, ANTHOOK_TOOL, ANTHOOK_ARGS (JSON string)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { Logger } from '../../utils/logger.js';

export type HookEvent = 'pre_tool_call' | 'post_tool_call';

export interface HookEntry {
    command: string;
    timeoutMs?: number;
}

interface HookConfig {
    pre_tool_call?: HookEntry[];
    post_tool_call?: HookEntry[];
}

let cachedConfig: HookConfig | null = null;
let cachedMtimeMs = 0;

function normalizeEntries(entries: Array<HookEntry | string> | undefined): HookEntry[] {
    if (!Array.isArray(entries)) return [];
    return entries
        .map(e => (typeof e === 'string' ? { command: e } : e))
        .filter(e => e && typeof e.command === 'string' && e.command.trim().length > 0);
}

/** Muat .ant/hooks.json dengan cache berbasis mtime (hot-reload saat file berubah). */
export function loadHookConfig(baseDir: string = process.cwd(), forceReload = false): HookConfig {
    const hookPath = path.join(baseDir, '.ant', 'hooks.json');
    try {
        if (!fs.existsSync(hookPath)) return {};
        const stat = fs.statSync(hookPath);
        if (!forceReload && cachedConfig && stat.mtimeMs === cachedMtimeMs) return cachedConfig;
        const raw = JSON.parse(fs.readFileSync(hookPath, 'utf-8'));
        cachedConfig = {
            pre_tool_call: normalizeEntries(raw?.pre_tool_call),
            post_tool_call: normalizeEntries(raw?.post_tool_call)
        };
        cachedMtimeMs = stat.mtimeMs;
        return cachedConfig!;
    } catch {
        return {};
    }
}

function runOneHook(entry: HookEntry, event: HookEvent, payload: Record<string, string>): Promise<number> {
    return new Promise(resolve => {
        const timeoutMs = Math.min(Math.max(entry.timeoutMs ?? 15000, 1000), 120000);
        const child = execFile(
            entry.command,
            {
                shell: true,
                timeout: timeoutMs,
                cwd: process.cwd(),
                env: { ...process.env, ...payload },
                windowsHide: true
            },
            () => {
                // exit code dibaca lewat close event di bawah
            }
        );
        child.on('close', code => resolve(code === null ? 1 : code));
        child.on('error', () => resolve(1));
    });
}

export interface PreHookVerdict {
    allowed: boolean;
    blockedBy?: string;
    exitCode?: number;
}

/**
 * Jalankan semua pre_tool_call hooks. Return {allowed:false} jika ada hook
 * yang men-veto (exit code >= 2).
 */
export async function runPreToolCallHooks(tool: string, args: Record<string, any>, baseDir: string = process.cwd()): Promise<PreHookVerdict> {
    const cfg = loadHookConfig(baseDir);
    const hooks = cfg.pre_tool_call || [];
    const payload = {
        ANTHOOK_EVENT: 'pre_tool_call',
        ANTHOOK_TOOL: tool,
        ANTHOOK_ARGS: safeJson(args)
    };
    for (const hook of hooks) {
        const code = await runOneHook(hook, 'pre_tool_call', payload);
        if (code >= 2) {
            await Logger.log('WARN', `Hook pre_tool_call VETO tool '${tool}' (exit ${code}): ${hook.command}`, {}, 'HOOKS');
            return { allowed: false, blockedBy: hook.command, exitCode: code };
        }
        if (code === 1) {
            await Logger.log('WARN', `Hook pre_tool_call gagal (exit 1), tool tetap dieksekusi: ${hook.command}`, {}, 'HOOKS');
        }
    }
    return { allowed: true };
}

/** Jalankan semua post_tool_call hooks — fire-and-forget, tidak pernah throw. */
export async function runPostToolCallHooks(tool: string, args: Record<string, any>, result: unknown, baseDir: string = process.cwd()): Promise<void> {
    const cfg = loadHookConfig(baseDir);
    const hooks = cfg.post_tool_call || [];
    if (hooks.length === 0) return;
    const payload = {
        ANTHOOK_EVENT: 'post_tool_call',
        ANTHOOK_TOOL: tool,
        ANTHOOK_ARGS: safeJson(args),
        ANTHOOK_RESULT: safeJson(result).slice(0, 20000)
    };
    for (const hook of hooks) {
        try {
            await runOneHook(hook, 'post_tool_call', payload);
        } catch {
            // never break the loop
        }
    }
}

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value ?? {});
    } catch {
        return '{}';
    }
}
