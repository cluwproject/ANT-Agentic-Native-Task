import chalk from 'chalk';
import type { CliContext } from '../types.js';
import { getBrainConfig } from '../../../shared/data.js';

export async function handleAgentCommands(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('/agent')) return false;

    const parts = text.split(' ');
    const sub = parts[1]?.toLowerCase();
    const { SUB_AGENT_REGISTRY, spawnSubAgent } = await import('../../agentic/sub_agents.js');
    
    if (sub === 'list' || !sub) {
        console.log(chalk.cyan('\n[REGISTRY] ANT REGISTERED SUB-AGENTS:'));
        const tableData = Object.entries(SUB_AGENT_REGISTRY).map(([key, def]) => ({
            Role: key,
            Description: def.description,
            Tools: def.allowedTools.join(', ')
        }));
        console.table(tableData);
        console.log();
        return true;
    } else if (sub === 'run') {
        const roleName = parts[2]?.toLowerCase();
        const task = parts.slice(3).join(' ').trim();
        if (!roleName || !task) {
            console.log(chalk.yellow('  Usage: /agent run <role> <task description>'));
            console.log(chalk.dim('  Example: /agent run researcher "Analisis update LLM terbaru"'));
            return true;
        }
        try {
            const brain = await getBrainConfig();
            console.log(chalk.cyan(`\n[SPAWNING AGENT] ${roleName.toUpperCase()}...`));
            const res = await spawnSubAgent(roleName, task, brain, ctx.history);
            console.log(chalk.green(`\n[AGENT RESULT (${res.role.toUpperCase()})]:`));
            console.log(chalk.white(res.output) + '\n');
        } catch (err: any) {
            console.log(chalk.red(`  [AGENT ERROR] ${err.message}`));
        }
        return true;
    }

    return false;
}
