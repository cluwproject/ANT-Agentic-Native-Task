import chalk from 'chalk';
import type { CliContext, CommandHandler } from '../types.js';
import { handleSessionCommands } from './session.js';
import { handleMemoryCommands } from './memory.js';
import { handleSwarmCommands } from './swarm.js';
import { handleModelCommands } from './model.js';
import { handleAgentCommands } from './agent.js';
import { handleTaskCommands } from './task.js';
import { handleSystemCommands } from './system.js';
import { handleWorkspaceCommands } from './workspace.js';
import { handleShellCommands } from './shell.js';
import { handleScaffoldCommands } from './scaffold.js';
import { handleMcpCommands } from './mcp.js';
import { handleCustomCommands } from './custom_commands.js';

export const HANDLED_PREFIXES = [
    '/new_chat', '/clear', '/plan', '/branch', '/store', '/recall',
    '/memories', '/vault', '/mailbox', '/health', '/doctor', '/swarm', '/sync',
    '/consolidate', '/scaffold', '/resume', '/model', '/session', '/checkpoint', '/undo', '/skills',
    '/agent', '/task', '/git', '/help', '/exit', '/quit', '/report',
    '/osint', '/connect', '/workspace', '/mcp'
] as const;

const commandHandlers: CommandHandler[] = [
    handleShellCommands,
    handleScaffoldCommands,
    handleSessionCommands,
    handleMemoryCommands,
    handleSwarmCommands,
    handleModelCommands,
    handleAgentCommands,
    handleTaskCommands,
    handleSystemCommands,
    handleWorkspaceCommands,
    // MCP & custom commands PALING AKHIR: mereka match nama dinamis dari
    // file/konfigurasi user, jadi tidak boleh menutupi handler statis.
    handleMcpCommands,
    handleCustomCommands
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
