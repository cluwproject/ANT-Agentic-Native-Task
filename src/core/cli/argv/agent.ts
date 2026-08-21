import chalk from 'chalk';
import { getBrainConfig } from '../../../shared/data.js';

export async function handleAgentArgv(args: string[]): Promise<boolean> {
    if (args[0] !== 'agent') return false;

    const subCommand = args[1];
    if (subCommand === 'list') {
        console.log(chalk.cyan('\n[REGISTRY] ANT AGENTS REGISTRY:'));
        try {
            const { SUB_AGENT_REGISTRY } = await import('../../agentic/sub_agents.js');
            const tableData = Object.entries(SUB_AGENT_REGISTRY).map(([key, def]) => ({
                Role: key,
                Description: def.description,
                Tools: def.allowedTools.join(', ')
            }));
            console.table(tableData);
        } catch (err: any) {
            console.error(chalk.red(`Failed to list agents: ${err.message}`));
        }
        process.exit(0);
    } else if (subCommand === 'run') {
        const agentName = args[2];
        if (!agentName) {
            console.error(chalk.red('Error: Agent role required. Contoh: ant agent run researcher "Riset tren frontier models 2026"'));
            process.exit(1);
        }
        const task = args.slice(3).join(' ');
        if (!task) {
            console.error(chalk.red('Error: Task description required. Contoh: ant agent run researcher "Riset tren frontier models 2026"'));
            process.exit(1);
        }
        
        try {
            const { spawnSubAgent, SUB_AGENT_REGISTRY } = await import('../../agentic/sub_agents.js');
            const brain = await getBrainConfig();
            const roleKey = agentName.toLowerCase();
            if (!SUB_AGENT_REGISTRY[roleKey]) {
                console.log(chalk.yellow(`[WARN] Role '${agentName}' tidak dikenal. Tersedia: ${Object.keys(SUB_AGENT_REGISTRY).join(', ')}. Menggunakan sub-agen generic.`));
            }
            console.log(chalk.cyan(`\n[SPAWNING AGENT] ${agentName.toUpperCase()}...`));
            const res = await spawnSubAgent(roleKey, task, brain);
            console.log(chalk.green(`\n[AGENT RESULT (${res.role.toUpperCase()})]:`));
            console.log(chalk.white(res.output) + '\n');
        } catch (err: any) {
            console.error(chalk.red(`\n[FAILED] Agent Execution Failed: ${err.message}`));
        }
        process.exit(0);
    }
    return false;
}
