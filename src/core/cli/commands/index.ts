import chalk from 'chalk';
import type { CliContext, CommandHandler } from '../types.js';
import { handleSessionCommands } from './session.js';
import { handleMemoryCommands } from './memory.js';
import { handleSwarmCommands } from './swarm.js';
import { handleModelCommands } from './model.js';
import { handleAgentCommands } from './agent.js';
import { handleTaskCommands } from './task.js';
import { handleSystemCommands } from './system.js';
import { handleShellCommands } from './shell.js';

export const HANDLED_PREFIXES = [
    '/new_chat', '/clear', '/plan', '/branch', '/store', '/recall',
    '/memories', '/vault', '/mailbox', '/health', '/swarm', '/sync',
    '/consolidate', '/resume', '/model', '/session', '/checkpoint', '/undo', '/skills',
    '/agent', '/task', '/git', '/help', '/exit', '/quit', '/report',
    '/osint', '/connect'
] as const;

const commandHandlers: CommandHandler[] = [
    handleShellCommands,
    handleSessionCommands,
    handleMemoryCommands,
    handleSwarmCommands,
    handleModelCommands,
    handleAgentCommands,
    handleTaskCommands,
    handleSystemCommands
];

export async function dispatchSlash(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('/') && !text.startsWith('!')) {
        return false;
    }

    for (const handler of commandHandlers) {
        const handled = await handler(text, ctx);
        if (handled) return true;
    }

    // If it starts with / and wasn't handled (e.g. unknown slash command like /foo)
    if (text.startsWith('/')) {
        console.log(chalk.yellow(`Unknown command: ${chalk.bold(text)}. Type /help or / to view all available commands.\n`));
        return true;
    }

    return false;
}
