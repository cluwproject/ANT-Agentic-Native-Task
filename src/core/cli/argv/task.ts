import chalk from 'chalk';

export async function handleTaskArgv(args: string[]): Promise<boolean> {
    if (args[0] !== 'task') return false;

    const subCommand = args[1];
    if (subCommand === 'schedule') {
        const cronVal = args[2];
        const commandVal = args[3];
        if (!cronVal || !commandVal) {
            console.error(chalk.red('Error: format salah. Contoh: ant task schedule "*/5 * * * *" "echo hello"'));
            process.exit(1);
        }
        try {
            const { addCustomSchedule, loadCustomSchedules } = await import('../../scheduler.js');
            await loadCustomSchedules();
            const id = await addCustomSchedule(cronVal, commandVal);
            console.log(chalk.green(`\n[OK] Task registered: "${commandVal}" with cron "${cronVal}" (ID: ${id})`));
        } catch (err: any) {
            console.error(chalk.red(`Failed to schedule task: ${err.message}`));
        }
        process.exit(0);
    } else if (subCommand === 'list') {
        console.log(chalk.cyan('\n[SCHEDULES] REGISTERED CUSTOM SCHEDULES:'));
        try {
            const { customSchedules, loadCustomSchedules } = await import('../../scheduler.js');
            await loadCustomSchedules();
            if (customSchedules.length === 0) {
                console.log(chalk.yellow('No custom tasks scheduled.'));
            } else {
                const tableData = customSchedules.map(t => ({
                    ID: t.id,
                    Cron: t.cron,
                    Command: t.command,
                    'Last Run': t.lastRun ? new Date(t.lastRun).toLocaleString() : 'never'
                }));
                console.table(tableData);
            }
        } catch (err: any) {
            console.error(chalk.red(`Failed to list tasks: ${err.message}`));
        }
        process.exit(0);
    } else {
        console.log(chalk.red(`Unknown task subcommand: ${subCommand || ''}`));
        console.log('Gunakan:');
        console.log('  ant task schedule "<cron>" "<command>"');
        console.log('  ant task list');
        process.exit(1);
    }
}
