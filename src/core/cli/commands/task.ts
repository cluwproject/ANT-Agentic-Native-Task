import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { CliContext } from '../types.js';
import { runCliAgentLoopDetailed } from '../../agent_loop/index.js';

function clearLines(count: number) {
    for (let i = 0; i < count; i++) {
        process.stdout.write('\x1B[1A\x1B[2K\r');
    }
}

export async function handleTaskCommands(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('/task')) return false;

    const parts = text.split(' ');
    const sub = parts[1]?.toLowerCase();
    
    // Fallback logic for old cron-based background scheduler
    if (sub === 'schedule' || sub === 'list') {
        const { customSchedules, addCustomSchedule, loadCustomSchedules } = await import('../../scheduler.js');
        await loadCustomSchedules();
        if (sub === 'list') {
            console.log(chalk.cyan('\n[TASKS] SCHEDULED BACKGROUND TASKS:'));
            if (customSchedules.length === 0) {
                console.log(chalk.yellow('  No custom scheduled tasks.'));
            } else {
                console.table(customSchedules);
            }
            console.log();
            return true;
        } else if (sub === 'schedule') {
            const cronAndCmd = text.replace(/^\/task\s+schedule\s*/, '').trim();
            const match = cronAndCmd.match(/^["']([^"']+)["']\s+["']?([^"']+)["']?$/) || cronAndCmd.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
            if (match) {
                const cron = match[1];
                const command = match[2];
                const id = await addCustomSchedule(cron, command);
                console.log(chalk.green(`  [OK] Task registered with ID: ${id} (Cron: ${cron})`));
            } else {
                console.log(chalk.yellow('  Usage: /task schedule "<cron_expr>" "<command>"'));
            }
            console.log();
            return true;
        }
    }

    // New Interactive Mission / Task Proposal Gate
    await runInteractiveTaskMenu(ctx);
    return true;
}

async function runInteractiveTaskMenu(ctx: CliContext) {
    const isTTY = !!(process.stdout.isTTY || process.stdin.isTTY);
    if (!isTTY) {
        console.log(chalk.red('\n[ERROR] TTY tidak tersedia untuk menu interaktif.\n'));
        return;
    }

    const missionsDir = path.join(ctx.baseDir, 'workspace', 'missions');
    if (!fs.existsSync(missionsDir)) fs.mkdirSync(missionsDir, { recursive: true });

    let missions: string[] = [];
    try {
        missions = fs.readdirSync(missionsDir).filter(f => f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.txt'));
    } catch {
        missions = [];
    }

    return new Promise<void>((resolve) => {
        let selectedIdx = 0;
        let menuLines = 0;
        let state: 'list' | 'confirm' = 'list';
        let activeMission = '';
        let missionContent = '';

        const render = () => {
            if (menuLines > 0) clearLines(menuLines);
            let linesRendered = 0;
            const printLine = (str: string) => { process.stdout.write(str + '\n'); linesRendered++; };

            printLine('');
            printLine(chalk.bgMagenta.white(' ANT TASK & MISSION APPROVAL GATE '));
            printLine('');

            if (state === 'list') {
                if (missions.length === 0) {
                    printLine(chalk.yellow('  (Tidak ada file misi/task pending di workspace/missions/)'));
                    printLine(chalk.dim('  Buat file .md di folder tersebut untuk mengajukan task.'));
                } else {
                    missions.forEach((m, i) => {
                        const isSelected = i === selectedIdx;
                        const prefix = isSelected ? chalk.magenta('❯ ') : '  ';
                        const nameStr = isSelected ? chalk.bgMagenta.white(` ${m} `) : chalk.white(m);
                        printLine(`${prefix}${nameStr}`);
                    });
                }
                printLine('');
                printLine(chalk.dim('  [↑/↓] Pilih Task  [Enter/→] Review & Approve  [Q] Batal Keluar'));
            } else if (state === 'confirm') {
                printLine(chalk.cyan(`Review Task: ${activeMission}`));
                printLine(chalk.dim('─'.repeat(60)));
                const preview = missionContent.split(/\r?\n/).slice(0, 15);
                preview.forEach(l => printLine(chalk.dim('  ' + l.slice(0, 100))));
                if (missionContent.split(/\r?\n/).length > 15) {
                    printLine(chalk.yellow('  ... (konten terpotong untuk preview)'));
                }
                printLine(chalk.dim('─'.repeat(60)));
                printLine('');
                printLine(chalk.green('  [Y / Enter] Approve & Eksekusi Sekarang'));
                printLine(chalk.red('  [N / Esc / ←] Tolak & Kembali'));
            }

            menuLines = linesRendered;
        };

        const cleanupAndExecute = async () => {
            if (menuLines > 0) clearLines(menuLines);
            process.stdout.write('\x1B[2K\x1B[0G');
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', onData);
            
            console.log(chalk.green(`\n[TASK APPROVED] Memulai eksekusi: ${activeMission}...\n`));
            const prompt = `Eksekusi task/misi berikut sesuai rencana yang telah disetujui dalam file ${activeMission}:\n\n${missionContent}`;
            
            try {
                // Execute agent loop internally
                const result = await runCliAgentLoopDetailed(prompt, ctx.history);
                if (result && result.messages) {
                    // Inject the new messages into CLI context history
                    ctx.history.push(...result.messages);
                }
            } catch (e: any) {
                console.log(chalk.red(`\n[TASK FAILED] ${e.message}\n`));
            }
            resolve();
        };

        const cleanupAndCancel = () => {
            if (menuLines > 0) clearLines(menuLines);
            process.stdout.write('\x1B[2K\x1B[0G');
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', onData);
            console.log(chalk.green('✔ Batal memilih task.\n'));
            resolve();
        };

        const onData = (key: string) => {
            if (key === '\u0003') { cleanupAndCancel(); return; }

            if (state === 'list') {
                if (key.toLowerCase() === 'q' || key === '\u001b') { cleanupAndCancel(); return; }
                if (key === '\u001b[A' && selectedIdx > 0) { selectedIdx--; render(); return; }
                if (key === '\u001b[B' && selectedIdx < missions.length - 1) { selectedIdx++; render(); return; }
                if (key === '\r' || key === '\n' || key === '\u001b[C') {
                    if (missions.length > 0) {
                        activeMission = missions[selectedIdx];
                        try {
                            missionContent = fs.readFileSync(path.join(missionsDir, activeMission), 'utf8');
                        } catch {
                            missionContent = '[Gagal membaca isi misi]';
                        }
                        state = 'confirm';
                        render();
                    }
                    return;
                }
            } else if (state === 'confirm') {
                if (key.toLowerCase() === 'n' || key === '\u001b' || key === '\u001b[D') {
                    state = 'list';
                    render();
                    return;
                }
                if (key.toLowerCase() === 'y' || key === '\r' || key === '\n') {
                    cleanupAndExecute();
                    return;
                }
            }
        };

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        render();
        process.stdin.on('data', onData);
    });
}
