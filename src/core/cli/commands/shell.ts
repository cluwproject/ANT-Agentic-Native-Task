import chalk from 'chalk';
import type { CliContext } from '../types.js';

export async function handleShellCommands(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('!')) return false;

    const shellCommand = text.slice(1).trim();
    if (!shellCommand) {
        console.log(chalk.yellow('Format: ! <command_shell> (contoh: !npm install)'));
        return true;
    }
    
    console.log(chalk.dim(`\n[Bash] Menjalankan perintah shell: ${shellCommand}`));
    try {
        const { executeAction } = await import('../../actions.js');
        const context = { manual_approval: true };
        const result: any = await executeAction('shell_exec', { command: shellCommand }, 1, context);
        
        if (result.status === 'success') {
            if (result.stdout) console.log(chalk.green(result.stdout));
            if (result.stderr) console.error(chalk.red(result.stderr));
        } else {
            console.error(chalk.red(`\n[SHELL ERROR] ${result.error}`));
            if (result.stdout) console.log(result.stdout);
            if (result.stderr) console.error(result.stderr);
        }
    } catch (e: any) {
        console.error(chalk.red(`\n[SHELL EXCEPTION] ${e.message}\n`));
    }
    return true;
}
