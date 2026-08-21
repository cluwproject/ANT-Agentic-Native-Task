import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { CliContext } from '../types.js';
import { getAntAscii } from '../identity.js';

export async function handleSessionCommands(text: string, ctx: CliContext): Promise<boolean> {
    // ── /new_chat & /clear ────────────────────────────────────────────
    if (text === '/new_chat' || text === '/clear') {
        ctx.history = [];
        console.clear();
        console.log(getAntAscii());
        console.log(chalk.green('Conversation circuit refreshed. Clean context initialized.\n'));
        return true;
    }

    // ── /plan ─────────────────────────────────────────────────────────
    if (text.startsWith('/plan')) {
        const goal = text.replace(/^\/plan\s*/, '').trim();
        if (!goal) {
            console.log(chalk.yellow('\n[PLANNER] HTN Execution Planner'));
            console.log(chalk.dim('  Usage: /plan <goal_or_task_description>'));
            console.log(chalk.dim('  Example: /plan Refactor authentication middleware to support OAuth2\n'));
            return true;
        }
        console.log(chalk.cyan(`\n[Planner] Generating HTN Multi-Step Execution Plan for: "${goal}"...\n`));
        // Return false so that the planner prompt falls through to the agent loop with planner instruction!
        return false;
    }

    // ── /branch ───────────────────────────────────────────────────────
    if (text.startsWith('/branch')) {
        const parts = text.split(' ');
        const subCmd = parts[1]?.toLowerCase();
        const branchArg = parts.slice(2).join(' ').trim();

        const { createBranch, listBranches, loadBranch } = await import('../../agentic/branching.js');

        if (subCmd === 'list') {
            const branches = await listBranches();
            console.log(chalk.cyan('\n[BRANCHES] CONVERSATION BRANCHES:'));
            if (branches.length === 0) {
                console.log(chalk.yellow('  No saved branches yet. Use /branch create <name> to fork one.'));
            } else {
                branches.forEach((b, idx) => {
                    console.log(`  ${chalk.bold(idx + 1)}. ${chalk.green(b)}`);
                });
            }
            console.log();
            return true;
        } else if (subCmd === 'create') {
            if (!branchArg) {
                console.log(chalk.yellow('  Usage: /branch create <branch_name>'));
                return true;
            }
            const savedPath = await createBranch(branchArg, ctx.sessionId, ctx.history);
            console.log(chalk.green(`  [OK] Branch '${branchArg}' saved successfully (${ctx.history.length} messages snapshot).`));
            console.log(chalk.dim(`     Path: ${savedPath}\n`));
            return true;
        } else if (subCmd === 'checkout' || subCmd === 'load') {
            if (!branchArg) {
                console.log(chalk.yellow('  Usage: /branch checkout <branch_name>'));
                return true;
            }
            const branch = await loadBranch(branchArg);
            if (!branch) {
                console.log(chalk.red(`  [ERROR] Branch '${branchArg}' not found.`));
            } else {
                ctx.history = [...branch.history];
                console.log(chalk.green(`  [OK] Switched to branch '${branchArg}' (${ctx.history.length} messages loaded).\n`));
            }
            return true;
        } else {
            console.log(chalk.cyan('\n[BRANCHES] CONVERSATION BRANCHING COMMANDS:'));
            console.log(chalk.dim('  /branch list               List all saved branches'));
            console.log(chalk.dim('  /branch create <name>      Save current context to a new branch'));
            console.log(chalk.dim('  /branch checkout <name>    Switch active session to a branch\n'));
            return true;
        }
    }

    // ── /checkpoint ───────────────────────────────────────────────────
    if (text.startsWith('/checkpoint')) {
        const msg = text.replace(/^\/checkpoint\s*/, '').trim() || `ANT Checkpoint: ${new Date().toISOString()}`;
        console.log(chalk.cyan(`\n[Checkpoint] Creating Git Checkpoint: "${msg}"...`));
        try {
            const { handleFileOps } = await import('../../actions/file_ops.js');
            const res: any = await handleFileOps('git_checkpoint', { message: msg }, path.join(process.cwd(), 'workspace'), process.cwd());
            if (res?.status === 'success') {
                console.log(chalk.green(`  [OK] ${res.message}`));
                if (res.output) console.log(chalk.dim(`     ${res.output.split('\n')[0]}`));
            } else {
                console.log(chalk.yellow(`  [Info] ${res?.message || 'No changes to checkpoint.'}`));
            }
        } catch (e: any) {
            console.log(chalk.red(`  [ERROR] Checkpoint failed: ${e.message}`));
        }
        console.log();
        return true;
    }

    // ── /session list & /sessions ─────────────────────────────────────
    if (text === '/session list' || text === '/sessions') {
        console.log(chalk.cyan('\n📂 DAFTAR SESI PERCAKAPAN YANG TERSEDIA:'));
        try {
            const sessionDir = path.join(process.cwd(), 'workspace', 'sessions');
            if (!fs.existsSync(sessionDir)) {
                console.log(chalk.yellow('Belum ada sesi percakapan yang disimpan.'));
                return true;
            }
            const files = await fs.promises.readdir(sessionDir);
            const sessions = [];
            for (const f of files) {
                if (f.endsWith('.json')) {
                    try {
                        const data = JSON.parse(await fs.promises.readFile(path.join(sessionDir, f), 'utf-8'));
                        sessions.push({
                            ID: data.id || f.replace('.json', ''),
                            Nama: data.name || 'Unnamed',
                            Waktu: data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A',
                            Pesan: Array.isArray(data.messages) ? data.messages.length : 0
                        });
                    } catch {}
                }
            }
            if (sessions.length === 0) {
                console.log(chalk.yellow('Belum ada riwayat sesi tersimpan.'));
            } else {
                console.table(sessions);
                console.log(chalk.dim(`Ketik "/session load <ID>" atau "/resume <ID>" untuk memuat percakapan lama.\n`));
            }
        } catch (e: any) {
            console.log(chalk.red(`Gagal membaca direktori sesi: ${e.message}`));
        }
        return true;
    }

    // ── /session load & /resume ───────────────────────────────────────
    if (text.startsWith('/session load') || text.startsWith('/resume')) {
        const parts = text.split(' ');
        const targetId = (text.startsWith('/resume') ? parts[1] : parts[2])?.trim();
        if (!targetId) {
            console.log(chalk.yellow('Gunakan: /session load <ID_SESI> atau /resume <ID_SESI>'));
            return true;
        }

        const sessionPath = path.join(process.cwd(), 'workspace', 'sessions', `${targetId.endsWith('.json') ? targetId : targetId + '.json'}`);
        if (!fs.existsSync(sessionPath)) {
            console.log(chalk.red(`\n[ERROR] File sesi ${targetId} tidak ditemukan di workspace/sessions/.\n`));
            return true;
        }

        try {
            const data = JSON.parse(await fs.promises.readFile(sessionPath, 'utf-8'));
            if (Array.isArray(data.messages)) {
                ctx.history = data.messages;
                ctx.sessionId = data.id || targetId;
                console.log(chalk.green(`\n[OK] Sesi '${data.name || targetId}' berhasil dimuat (${ctx.history.length} pesan riwayat aktif). Selamat melanjutkan percakapan!\n`));
            } else {
                console.log(chalk.red(`Format file sesi rusak atau tidak kompatibel.`));
            }
        } catch (e: any) {
            console.log(chalk.red(`Gagal memuat sesi: ${e.message}`));
        }
        return true;
    }

    return false;
}
