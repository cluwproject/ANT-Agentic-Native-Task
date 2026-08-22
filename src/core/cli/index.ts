import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { runCliAgentLoop, askUser, closeCli } from '../agent_loop/index.js';
import { Logger } from '../../utils/logger.js';
import { getBrainConfig } from '../../shared/data.js';
import type { CliContext } from './types.js';
import { getAntAscii, getPackageVersion } from './identity.js';
import { bootSystem } from './boot.js';
import { routeArgv } from './argv/router.js';
import { dispatchSlash } from './commands/index.js';
import { saveCliSession } from './session.js';

export async function main() {
    const BASE_DIR = process.cwd();
    const ANT_HOME = path.join(os.homedir(), '.ant');

    const envCandidates = [
        process.env.ANT_CLI_HOME ? path.join(process.env.ANT_CLI_HOME, '.env') : '',
        path.join(BASE_DIR, '.env'),
        path.join(ANT_HOME, '.env'),
        path.join(os.homedir(), 'ant-cli', '.env'),
        '/data/data/com.termux/files/home/ant-cli/.env'
    ].filter(Boolean);

    let activeEnvPath = path.join(BASE_DIR, '.env');
    for (const envPath of envCandidates) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            activeEnvPath = envPath;
        }
    }

    const args = process.argv.slice(2);
    const sessionId = `cli-session-${Date.now()}`;

    // 1. Boot system if running a subcommand that requires database/events/auth
    const needsBoot = args[0] && ['swarm', 'agent', 'mailbox', 'task', 'scaffold'].includes(args[0]);
    if (needsBoot) {
        await bootSystem(sessionId, activeEnvPath);
    }

    // 2. Check & Route Top-Level CLI Subcommands / Flags
    const wasHandledByArgv = await routeArgv(args, sessionId);
    if (wasHandledByArgv) {
        process.exit(0);
    }

    // 3. Boot System Services for interactive session if not already booted
    if (!needsBoot) {
        await bootSystem(sessionId, activeEnvPath);
    }

    // Mute console logger for double prints
    const originalLog = Logger.log;
    Logger.log = async (level: any, message: string, meta: any, channel: string) => {
        if (level === 'ERROR' || level === 'FATAL') {
            const safeLevel: 'INFO' | 'WARN' | 'ERROR' | 'AI' | 'DEBUG' = level === 'FATAL' ? 'ERROR' : level;
            const origConsoleLog = console.log;
            console.log = () => {};
            try {
                await originalLog(safeLevel, message, meta, channel);
            } finally {
                console.log = origConsoleLog;
            }
            console.log(chalk.red(`[ERROR] ${level === 'FATAL' ? 'CRITICAL: ' : ''}${message}`));
        }
    };

    // 4. Render Banner & Dashboard
    console.log(getAntAscii());
    console.log(chalk.dim('Loading system configuration & cognitive neural memories...'));

    try {
        const { printAdaptNotice } = await import('../ant_adapt.js');
        const adaptNotice = await printAdaptNotice();
        console.log(chalk.dim(adaptNotice));
    } catch {}

    try {
        const brain = await getBrainConfig();
        const activeModel = brain.custom_model || 'gemini-2.0-flash';
        const provider = brain.provider || 'Google Gemini';

        const termWidth = Math.max(36, Math.min((process.stdout.columns || 80) - 2, 72));
        const borderH = '─'.repeat(termWidth - 2);

        const printLine = (content: string) => {
            const innerWidth = termWidth - 2;
            const clean = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const rawLength = clean.length;
            const padding = Math.max(0, innerWidth - rawLength);
            console.log(chalk.cyan('│') + content + ' '.repeat(padding) + chalk.cyan('│'));
        };

        console.log(chalk.cyan(`╭${borderH}╮`));
        printLine(`  ${chalk.bold.white(`ANT — Agentic Native Task ${getPackageVersion()}`)}`);
        printLine('');
        printLine(`  ${chalk.cyan('Model:')} ${chalk.white(activeModel)} (${chalk.dim(provider)})`);
        printLine(`  ${chalk.cyan('Cognitive Core:')} ${chalk.white('ANT Core (MindBy Powered)')}`);
        printLine(`  ${chalk.cyan('Session ID:')} ${chalk.white(sessionId)}`);
        printLine('');
        printLine(`  ${chalk.bold.green('Tips for getting started:')}`);
        printLine(`  ${chalk.dim('• Type / to open interactive slash commands')}`);
        printLine(`  ${chalk.dim('• Type ! <command> to run a shell command inline')}`);
        printLine(`  ${chalk.dim('• Type /store <text> to persist cognitive memory')}`);
        printLine('');
        console.log(chalk.cyan(`╰${borderH}╯\n`));
    } catch (e: any) {
        console.log(chalk.yellow(`[DASHBOARD LOAD WARN] Failed to load detail: ${e.message}\n`));
    }

    console.log(chalk.green('System Ready. ANT is operating in Sovereign Agentic CLI mode.'));
    console.log(chalk.dim('(Type "exit" or "quit" to disconnect)'));
    console.log(chalk.dim('(Type "/" or "/help" to view interactive commands)\n'));

    // 5. Project Context Injection
    let projectContext = '';
    try {
        const pkgPath = path.join(BASE_DIR, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const stack = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).slice(0, 12).join(', ');
            projectContext = `[PROJECT: ${pkg.name || 'unnamed'} v${pkg.version || '?'} — Stack: ${stack}]`;
        }
        const readmePath = [path.join(BASE_DIR, 'README.md'), path.join(BASE_DIR, 'ARCHITECTURE.md')].find(p => fs.existsSync(p));
        if (readmePath) {
            const readmeSnippet = fs.readFileSync(readmePath, 'utf-8').slice(0, 500);
            projectContext += `\n[README SNIPPET]: ${readmeSnippet}`;
        }
    } catch {}

    const ctx: CliContext = {
        sessionId,
        history: [],
        baseDir: BASE_DIR,
        activeEnvPath
    };

    if (projectContext) {
        ctx.history.push({ role: 'user', content: `[SYSTEM CONTEXT]: ${projectContext}` });
        ctx.history.push({ role: 'assistant', content: 'Konteks proyek diterima. Siap membantu.' });
    }

    // 6. Interactive REPL Loop
    while (true) {
        const input = await askUser(chalk.cyan('You ❯ '));
        let text = input.trim();

        if (!text) continue;

        // Handle slash menu trigger
        if (text === '/' || text === '/help') {
            process.stdout.write('\x1B[1A\x1B[2K\r');
            const { showSlashMenu } = await import('../slash_menu.js');
            const selected = await showSlashMenu('/');
            if (selected && selected.trim()) {
                text = selected.trim();
                const needsArgs = ['/store', '/recall', '/branch create', '/branch checkout', '/session load', '/agent run', '/task schedule', '/plan'];
                if (needsArgs.includes(text)) {
                    process.stdout.write('\x1B[1A\x1B[2K\r');
                    const argsInput = await askUser(chalk.cyan(`You ❯ `) + chalk.bold.white(`${text} `));
                    text = `${text} ${argsInput}`.trim();
                } else {
                    process.stdout.write('\x1B[1A\x1B[2K\r');
                    console.log(chalk.cyan('You ❯ ') + chalk.bold.white(text));
                }
            } else {
                continue;
            }
        }

        // Collapse long pasted inputs visually
        const lines = input.split('\n');
        if (lines.length > 2 || input.length > 250) {
            for (let k = 0; k < lines.length; k++) {
                process.stdout.write('\u001b[1A\u001b[2K');
            }
            const summary = chalk.yellow(`[pasted text: ${lines.length} lines, ${input.length} chars]`);
            process.stdout.write(chalk.cyan('You ❯ ') + summary + '\n');
        }

        // Dispatch slash or shell commands
        const wasCommandHandled = await dispatchSlash(text, ctx);
        if (wasCommandHandled) continue;

        // Run agent loop
        try {
            // If plan command without slash handler, formulate HTN planning instruction
            if (text.startsWith('/plan')) {
                const goal = text.replace(/^\/plan\s*/, '').trim();
                text = `Tolong buatkan rencana eksekusi terstruktur (HTN Execution Plan) bertahap untuk tujuan berikut: "${goal}". Pecah menjadi langkah-langkah konkret dan tentukan alat yang perlu dipanggil.`;
            }

            const result = await runCliAgentLoop(text, ctx.history);
            if (Array.isArray(result)) {
                ctx.history = result;
            }
            await saveCliSession(ctx.sessionId, ctx.history);
        } catch (e: any) {
            console.log(`\n\x1b[31m[FATAL ERROR]\x1b[0m ${e.message}\n`);
            break;
        }
    }

    closeCli();
    process.exit(0);
}
