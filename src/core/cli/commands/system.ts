import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { execSync } from 'child_process';
import type { CliContext } from '../types.js';
import { readAntIdentity } from '../identity.js';

export async function handleSystemCommands(text: string, ctx: CliContext): Promise<boolean> {
    const lower = text.toLowerCase().trim();

    // ── /exit & /quit ─────────────────────────────────────────────────
    if (lower === 'exit' || lower === 'quit' || lower === '/exit' || lower === '/quit') {
        const identity = readAntIdentity();
        console.log(chalk.green(`ANT: Session saved. Goodbye, ${identity.activeUser}!`));
        process.exit(0);
    }

    // ── /undo ─────────────────────────────────────────────────────────
    if (text.startsWith('/undo')) {
        const target = text.replace('/undo', '').trim();
        if (!target) {
            try {
                const { exec } = await import('child_process');
                const { promisify } = await import('util');
                const execAsync = promisify(exec);
                const { stdout } = await execAsync(
                    `find "${ctx.baseDir}" -name "*.bak" -not -path "*/node_modules/*" 2>/dev/null | head -20`
                );
                const baks = (stdout || '').trim().split('\n').filter(Boolean);
                if (baks.length === 0) {
                    console.log(chalk.yellow('  Tidak ada file .bak yang ditemukan.'));
                } else {
                    console.log(chalk.cyan(`  File .bak tersedia untuk di-restore:`));
                    baks.slice(0, 10).forEach((b: string) => console.log(chalk.dim(`    ${path.relative(ctx.baseDir, b)}`)));
                    console.log(chalk.dim(`  Ketik: /undo <path/ke/file.ts> untuk restore`));
                }
            } catch {
                console.log(chalk.yellow('  Tidak dapat mencari file .bak.'));
            }
        } else {
            const bakPath = path.join(ctx.baseDir, target.endsWith('.bak') ? target : target + '.bak');
            const origPath = bakPath.replace(/\.bak$/, '');
            if (!fs.existsSync(bakPath)) {
                console.log(chalk.red(`  [ERROR] Backup tidak ditemukan: ${target}.bak`));
            } else {
                await fs.promises.copyFile(bakPath, origPath);
                await fs.promises.unlink(bakPath);
                console.log(chalk.green(`  [OK] Berhasil restore: ${path.relative(ctx.baseDir, origPath)} (backup dihapus)`));
            }
        }
        console.log();
        return true;
    }

    // ── /skills ───────────────────────────────────────────────────────
    if (text === '/skills' || text === '/skill list') {
        console.log(chalk.cyan('\n[SKILLS] AVAILABLE CUSTOM SKILLS:'));
        try {
            const { handleSkillOps } = await import('../../actions/skill_ops.js');
            const skillsRes: any = await handleSkillOps('ant_skill_list', {}, path.join(process.cwd(), 'workspace'), process.cwd());
            if (skillsRes?.skills && skillsRes.skills.length > 0) {
                skillsRes.skills.forEach((s: any, idx: number) => {
                    console.log(`  ${chalk.bold(idx + 1)}. ${chalk.green(s.fileName || s.name)} ${chalk.dim(`(${s.type || 'Custom Skill'})`)}`);
                });
            } else {
                console.log(chalk.yellow('  No custom skills installed yet. Create one with `ant_skill_create`.'));
            }
        } catch (e: any) {
            console.log(chalk.yellow(`  No custom skills available: ${e.message}`));
        }
        console.log();
        return true;
    }

    // ── /git ──────────────────────────────────────────────────────────
    if (text.startsWith('/git')) {
        const gitSub = text.replace(/^\/git\s*/, '').trim().toLowerCase();
        try {
            if (gitSub === 'status' || gitSub === '') {
                const out = execSync('git status --short', { encoding: 'utf-8', cwd: process.cwd() });
                console.log(chalk.cyan('\n[GIT STATUS]'));
                console.log(out ? chalk.white(out) : chalk.green('Working tree clean.'));
            } else if (gitSub === 'diff') {
                const out = execSync('git diff', { encoding: 'utf-8', cwd: process.cwd() });
                console.log(chalk.cyan('\n[GIT DIFF]'));
                console.log(out ? chalk.white(out) : chalk.dim('No uncommitted diff changes.'));
            } else if (gitSub === 'log') {
                const out = execSync('git log -n 5 --oneline', { encoding: 'utf-8', cwd: process.cwd() });
                console.log(chalk.cyan('\n[GIT LOG (Recent 5)]'));
                console.log(chalk.white(out));
            } else {
                const out = execSync(`git ${gitSub}`, { encoding: 'utf-8', cwd: process.cwd() });
                console.log(chalk.white(out));
            }
        } catch (err: any) {
            console.log(chalk.red(`  [GIT ERROR] ${err.message}`));
        }
        console.log();
        return true;
    }

    // ── /help ─────────────────────────────────────────────────────────
    if (text === '/help') {
        const { showSlashMenu } = await import('../../slash_menu.js');
        await showSlashMenu('/');
        return true;
    }

    return false;
}
