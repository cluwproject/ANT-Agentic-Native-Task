import chalk from 'chalk';
import type { CliContext } from '../types.js';

export async function handleTaskCommands(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('/task')) return false;

    const parts = text.split(' ');
    const sub = parts[1]?.toLowerCase();
    const { customSchedules, addCustomSchedule, loadCustomSchedules } = await import('../../scheduler.js');
    await loadCustomSchedules();

    if (sub === 'list' || !sub) {
        console.log(chalk.cyan('\n[TASKS] SCHEDULED BACKGROUND TASKS:'));
        if (customSchedules.length === 0) {
            console.log(chalk.yellow('  No custom scheduled tasks. Use /task schedule <cron> <command>'));
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
            console.log(chalk.dim('  Example: /task schedule "*/30 * * * *" "npm test"'));
        }
        console.log();
        return true;
    }

    return false;
}
