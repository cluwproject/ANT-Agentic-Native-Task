export interface CliContext {
    sessionId: string;
    history: any[];
    baseDir: string;
    activeEnvPath: string;
}

export type CommandHandler = (text: string, ctx: CliContext) => Promise<boolean>;
