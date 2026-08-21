import type { ChatMessage } from '../agent_loop/types.js';

export interface CliContext {
    sessionId: string;
    history: ChatMessage[];
    baseDir: string;
    activeEnvPath: string;
}

export type CommandHandler = (text: string, ctx: CliContext) => Promise<boolean>;
