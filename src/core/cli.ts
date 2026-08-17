import { runCliAgentLoop, askUser, closeCli } from './agent_loop/index.js';
import { Logger } from '../utils/logger.js';
import { initCockroachDB, storeCockroachMemory, recallCockroachMemory, listCockroachMemories, setVaultMode, getVaultMode, checkCockroachHealth } from './mindby_cockroach.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { getBrainConfig } from '../shared/data.js';
import readline from 'readline';

// Baca konfigurasi dari direktori proyek saat ini, lalu fallback ke ~/.ant/ atau home ant-cli
const BASE_DIR = process.cwd();
const ANT_HOME = path.join(os.homedir(), '.ant');

const envCandidates = [
    path.join(BASE_DIR, '.env'),
    path.join(ANT_HOME, '.env'),
    path.join(os.homedir(), 'ant-cli', '.env'),
    '/data/data/com.termux/files/home/ant-cli/.env'
];

let activeEnvPath = path.join(BASE_DIR, '.env');
for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        activeEnvPath = envPath;
    }
}

async function ensureIdentity(): Promise<void> {
    if (!process.env.USER_NAME) {
        console.log(chalk.cyan('\n[ANT INITIALIZATION]'));
        console.log(chalk.yellow('Identity not set. Who is operating this system?'));
        
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question(chalk.green('Enter your name: '), (name) => {
                rl.close();
                if (name && name.trim()) {
                    process.env.USER_NAME = name.trim();
                    fs.appendFileSync(activeEnvPath, `\nUSER_NAME="${name.trim()}"\n`);
                    console.log(chalk.green(`\n[OK] Identity saved as: ${name.trim()}\n`));
                    resolve();
                } else {
                    console.error(chalk.red('Identity is required to operate ANT.'));
                    process.exit(1);
                }
            });
        });
    }
}

// Read identity and user profile configuration
function readAntIdentity() {
    try {
        const owner = process.env.USER_NAME || 'Unknown Operator';
        return {
            creator: 'Ard',
            origin: 'CLUW Genesis',
            activeUser: owner,
            collaborators: 'Agy, Gemma, Claude, DeepSeek, Ollama'
        };
    } catch {
        return {
            creator: 'Ard',
            origin: 'CLUW Genesis',
            activeUser: 'Unknown Operator',
            collaborators: 'Agy, Gemma, Claude, DeepSeek, Ollama'
        };
    }
}

function getAntAscii() {
    const identity = readAntIdentity();
    return chalk.green(`
  ANT -- Agentic Native Task
  You Ask. ANT Acts.

  >  Version     : v0.3.0
  >  Origin      : ${identity.origin} (Built by ${identity.creator})
  >  Companion   : ${identity.activeUser}
  >  Engine      : ANT Sovereign Runtime
`);
}

async function saveCliSession(sessionId: string, history: any[]) {
    try {
        const sessionFile = path.join(process.cwd(), 'workspace', 'sessions', `${sessionId}.json`);
        await fs.promises.mkdir(path.dirname(sessionFile), { recursive: true });
        await fs.promises.writeFile(sessionFile, JSON.stringify({
            id: sessionId,
            name: `CLI Companion - ${new Date().toLocaleString()}`,
            timestamp: new Date().toISOString(),
            messages: history
        }, null, 2));
    } catch (e: any) {
        // Silently ignore
    }
}

async function main() {
    const args = process.argv.slice(2);
    const currentSessionId = `cli-session-${Date.now()}`;
    
    // Auth Check & Identity
    try {
        const { enforceAuthGate } = await import('../security/auth.js');
        await enforceAuthGate();
        await ensureIdentity();
    } catch (e: any) {
        console.error(chalk.red(`[FATAL] Auth System Error: ${e.message}`));
        process.exit(1);
    }

    // Auto-diagnose and heal before starting CLI
    try {
        const { SelfHealer } = await import('./healing.js');
        const diagnosis = await SelfHealer.diagnose('CLI Startup Scan');
        if (diagnosis.anomaliesDetected.length > 0) {
            console.log(chalk.yellow(`\n[SELF-HEALER] Terdeteksi ${diagnosis.anomaliesDetected.length} anomali pada sistem.`));
            diagnosis.remediationsApplied.forEach(r => {
                console.log(chalk.green(`  ✓ ${r}`));
            });
            console.log(chalk.green(`[OK] Semua anomali telah diperbaiki secara otonom.\n`));
        }
    } catch (e: any) {
        // Silently continue
    }
    
    if (args[0] === 'task') {
        const subCommand = args[1];
        if (subCommand === 'schedule') {
            const cronVal = args[2];
            const commandVal = args[3];
            if (!cronVal || !commandVal) {
                console.error(chalk.red('Error: format salah. Contoh: ant task schedule "*/5 * * * *" "echo hello"'));
                process.exit(1);
            }
            try {
                const { addCustomSchedule, loadCustomSchedules } = await import('./scheduler.js');
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
                const { customSchedules, loadCustomSchedules } = await import('./scheduler.js');
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
            console.log(chalk.red(`Unknown task subcommand: ${subCommand}`));
            console.log('Gunakan:');
            console.log('  ant task schedule "<cron>" "<command>"');
            console.log('  ant task list');
            process.exit(1);
        }
    }
    
    // Handle mailbox commands
    if (args[0] === 'mailbox') {
        const subCommand = args[1] || 'list';
        const indexVal = args[2];
        const ledgerPath = path.join(process.cwd(), 'workspace', 'registry', 'mailbox', 'ledger.jsonl');

        try {
            if (subCommand === 'verify') {
                console.log(chalk.cyan('\n[Verifying] Memverifikasi Integritas Rantai Ledger Mailbox...'));
                const { MailboxWriter } = await import('./agentic/mailbox/mailboxWriter.js');
                const writer = new MailboxWriter();
                const result = writer.verifyChainIntegrity();
                if (result.valid) {
                    console.log(chalk.green(`[OK] Rantai hash valid. (${result.totalEntries} entri diverifikasi)`));
                } else {
                    console.log(chalk.red(`[ERROR] Korupsi terdeteksi pada entri #${result.failedAt}`));
                    console.log(chalk.red(`   Alasan: ${result.reason}`));
                }
            } 
            else if (subCommand === 'inspect' && indexVal) {
                const idx = parseInt(indexVal, 10);
                if (isNaN(idx) || idx < 1) {
                    console.log(chalk.red('Error: Index harus berupa angka positif.'));
                } else if (!fs.existsSync(ledgerPath)) {
                    console.log(chalk.yellow('Mailbox kosong.'));
                } else {
                    const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
                    if (idx > lines.length) {
                        console.log(chalk.red(`Error: Entri #${idx} tidak ditemukan. (Total: ${lines.length})`));
                    } else {
                        const entry = JSON.parse(lines[idx - 1]);
                        console.log(chalk.cyan(`\n[MAILBOX ENTRY #${idx}]:`));
                        console.log(JSON.stringify(entry, null, 2));
                    }
                }
            } 
            else if (subCommand === 'list') {
                console.log(chalk.cyan('\n[ANT MODEL MAILBOX]:'));
                if (!fs.existsSync(ledgerPath)) {
                    console.log(chalk.yellow('Mailbox kosong.'));
                } else {
                    const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
                    console.log(`Session: ${currentSessionId}\n`);
                    const { MailboxWriter } = await import('./agentic/mailbox/mailboxWriter.js');
                    const writer = new MailboxWriter();
                    const chainStatus = writer.verifyChainIntegrity();
                    
                    if (!chainStatus.valid) {
                         console.log(chalk.red(`[WARN] Integritas rantai hash rusak pada entri #${chainStatus.failedAt}\n`));
                    }

                    lines.forEach((line, i) => {
                        try {
                            const entry = JSON.parse(line);
                            const id = String(i + 1).padStart(2, '0');
                            const type = entry.type || 'UNKNOWN';
                            const source = entry.sourceModel || 'Unknown';
                            const target = entry.targetModel || 'Unknown';
                            
                            console.log(chalk.white(`┌───────────────────────────────────────────┐`));
                            console.log(chalk.white(`│ ${id}  ${source.toUpperCase()} → ${target.toUpperCase()}`));
                            console.log(chalk.white(`│     ${type}`));
                            if (entry.claimVerificationStatus) {
                                const statusColor = entry.claimVerificationStatus === 'VERIFIED' ? chalk.green : chalk.yellow;
                                console.log(chalk.white(`│     Status Klaim: `) + statusColor(entry.claimVerificationStatus));
                            }
                            console.log(chalk.white(`│     Hash: ${entry.entryHash?.substring(0, 15)}...`));
                            console.log(chalk.white(`└───────────────────────────────────────────┘`));
                        } catch (e) {
                             console.log(chalk.red(`[Error parsing entry ${i + 1}]`));
                        }
                    });
                    
                    console.log(chalk.dim(`\nGunakan: ant mailbox inspect <id> untuk melihat detail lengkap.`));
                    console.log(chalk.dim(`Gunakan: ant mailbox verify untuk audit cryptographic ledger.`));
                }
            } 
            else {
                console.log(chalk.red(`Unknown mailbox subcommand: ${subCommand}`));
                console.log('Gunakan:');
                console.log('  ant mailbox list');
                console.log('  ant mailbox inspect <id>');
                console.log('  ant mailbox verify');
            }
        } catch (err: any) {
             console.error(chalk.red(`\n[MAILBOX ERROR] ${err.message}`));
        }
        process.exit(0);
    }
    if (args[0] === 'swarm') {
        const goal = args[1];
        const target = args[2];
        if (!goal || !target) {
            console.error(chalk.red('Error: Format salah. Contoh: ant swarm "Investigasi kebocoran" "target.js"'));
            process.exit(1);
        }
        try {
            const { launchSwarmAudit, renderSwarmReport } = await import('./agentic/swarm_orchestrator.js');
            console.log(chalk.cyan(`\nMemulai Operasi Swarm 3-Zona untuk target: ${target}`));
            const result = await launchSwarmAudit(goal, [target]);
            renderSwarmReport(result);
        } catch (err: any) {
            console.error(chalk.red(`\n[SWARM ERROR] ${err.message}`));
        }
        process.exit(0);
    }
    
    if (args[0] === 'agent') {
        const subCommand = args[1];
        if (subCommand === 'list') {
            console.log(chalk.cyan('\n[REGISTRY] ANT AGENTS REGISTRY:'));
            try {
                const agentsDir = path.join(process.cwd(), 'src', 'server', 'agents');
                const files = await fs.promises.readdir(agentsDir);
                const tableData = [];
                for (const file of files) {
                    if (file.endsWith('_agent.ts') || file.endsWith('_agent.js')) {
                        const name = file.replace(/\.(ts|js)$/, '');
                        try {
                            const modPath = `../agents/${file.replace(/\.ts$/, '.js')}`;
                            const module = await import(modPath);
                            if (module.agent) {
                                tableData.push({
                                    Name: name,
                                    Label: module.agent.label || name,
                                    File: file
                                });
                            }
                        } catch {}
                    }
                }
                if (tableData.length === 0) {
                    console.log(chalk.yellow('No agents registered.'));
                } else {
                    console.table(tableData);
                }
            } catch (err: any) {
                console.error(chalk.red(`Failed to list agents: ${err.message}`));
            }
            process.exit(0);
        } else if (subCommand === 'run') {
            const agentName = args[2];
            if (!agentName) {
                console.error(chalk.red('Error: Agent name required. Contoh: ant agent run security_agent google.com'));
                process.exit(1);
            }
            
            let sandbox = true;
            const runArgs: string[] = [];
            for (let i = 3; i < args.length; i++) {
                if (args[i] === '--no-sandbox') {
                    sandbox = false;
                } else {
                    runArgs.push(args[i]);
                }
            }
            
            // Safe verification to prevent path-traversal
            const agentsDir = path.join(process.cwd(), 'src', 'server', 'agents');
            const files = await fs.promises.readdir(agentsDir);
            const validAgentNames = files
                .filter(file => file.endsWith('_agent.ts') || file.endsWith('_agent.js'))
                .map(file => file.replace(/\.(ts|js)$/, ''));
                
            if (!validAgentNames.includes(agentName)) {
                console.error(chalk.red(`Error: Agent '${agentName}' not found in registry.`));
                process.exit(1);
            }
            
            console.log(chalk.cyan(`\n[Starting] Agent: ${agentName} [Sandbox: ${sandbox ? 'ON' : 'OFF'}]...`));
            
            try {
                const fileExt = files.find(f => f.startsWith(agentName + '.'))?.endsWith('.ts') ? '.js' : '.js';
                const modPath = `../agents/${agentName}${fileExt}`;
                const module = await import(modPath);
                
                if (!module.agent || typeof module.agent.run !== 'function') {
                    throw new Error(`Agent '${agentName}' does not implement standard agent descriptor.`);
                }
                
                const context = { triggeredBy: 'cli' };
                if (sandbox) {
                    console.log(chalk.yellow('[SANDBOX IS ACTIVE] Process restricted to sandbox boundary.'));
                }
                
                const result = await module.agent.run(runArgs, context);
                console.log(chalk.green('\n[SUCCESS] Agent Execution Result:'));
                console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
            } catch (err: any) {
                console.error(chalk.red(`\n[FAILED] Agent Execution Failed: ${err.message}`));
                process.exit(1);
            }
            process.exit(0);
        } else {
            console.log(chalk.red(`Unknown agent subcommand: ${subCommand}`));
            console.log('Gunakan:');
            console.log('  ant agent list');
            console.log('  ant agent run <name> [args] [--no-sandbox]');
            process.exit(1);
        }
    }
    
    // Parse arguments (AGY CLI Alignment)
    let oneShotPrompt: string | null = null;
    let showHelp = false;
    let forceSandbox = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-h' || arg === '--help') {
            showHelp = true;
        } else if (arg === '-p' || arg === '--prompt') {
            if (i + 1 < args.length) {
                oneShotPrompt = args[i + 1];
                i++;
            } else {
                console.log(chalk.red('Error: Opsi -p/--prompt membutuhkan argumen prompt.'));
                process.exit(1);
            }
        } else if (arg === '--sandbox') {
            forceSandbox = true;
        }
    }

    if (showHelp) {
        console.log(getAntAscii());
        console.log(chalk.bold('Penggunaan:'));
        console.log('  ant [opsi]\n');
        console.log(chalk.bold('Opsi:'));
        console.log('  -p, --prompt "<prompt>"   Menjalankan perintah secara satu kali (one-shot mode) lalu keluar.');
        console.log('  -h, --help                Menampilkan panduan bantuan ini.');
        console.log('  --sandbox                 Menjalankan CLI dalam lingkungan terisolasi (sandbox).');
        process.exit(0);
    }

    // Silence logger unless it's critical, preventing double console logging
    const originalLog = Logger.log;
    Logger.log = async (level: any, message: string, meta: any, channel: string) => {
        if (level === 'ERROR' || level === 'FATAL') {
            const safeLevel: 'INFO' | 'WARN' | 'ERROR' | 'AI' | 'DEBUG' = level === 'FATAL' ? 'ERROR' : level;
            
            // Temporarily mute console.log to prevent double printing
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

    if (oneShotPrompt) {
        try {
            const brain = await getBrainConfig();
            if (forceSandbox) {
                console.log(chalk.yellow('[SANDBOX MODE ACTIVE]'));
            }
            await runCliAgentLoop(oneShotPrompt, []);
        } catch (err: any) {
            console.error(chalk.red(`[FATAL ERROR] ${err.message}`));
        }
        closeCli();
        process.exit(0);
    }

    console.log(getAntAscii());
    console.log(chalk.dim('Loading system configuration & cognitive neural memories...'));

    try {
        const { printAdaptNotice } = await import('./ant_adapt.js');
        const adaptNotice = await printAdaptNotice();
        console.log(chalk.dim(adaptNotice));
    } catch {}

    // Load and display Dashboard
    try {
        let brain = await getBrainConfig();
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
        printLine(`  ${chalk.bold.white('ANT — Agentic Native Task v0.3.0')}`);
        printLine('');
        printLine(`  ${chalk.cyan('Model:')} ${chalk.white(activeModel)} (${chalk.dim(provider)})`);
        printLine(`  ${chalk.cyan('Cognitive Core:')} ${chalk.white('ANT Core (MindBy Powered)')}`);
        printLine(`  ${chalk.cyan('Session ID:')} ${chalk.white(currentSessionId)}`);
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

    // ── Project Auto-Detection ───────────────────────────────────────────────
    // Baca package.json / README untuk inject konteks proyek ke sesi baru
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

    let contextHistory: any[] = [];
    // Inject project context sebagai system message pertama
    if (projectContext) {
        contextHistory.push({ role: 'user', content: `[SYSTEM CONTEXT]: ${projectContext}` });
        contextHistory.push({ role: 'assistant', content: 'Konteks proyek diterima. Siap membantu.' });
    }

    while (true) {
        const input = await askUser(chalk.cyan('You ❯ '));
        let text = input.trim();
        
        if (!text) continue;

        // ── Interactive Slash Menu Trigger (/ or /help) ─────────────────
        if (text === '/' || text === '/help') {
            process.stdout.write('\x1B[1A\x1B[2K\r');
            const { showSlashMenu } = await import('./slash_menu.js');
            const selected = await showSlashMenu('/');
            if (selected && selected.trim()) {
                text = selected.trim();
                console.log(chalk.cyan('You ❯ ') + chalk.bold.white(text));
            } else {
                continue;
            }
        }

        // Clear and collapse large pasted text inputs visually
        const lines = input.split('\n');
        if (lines.length > 2 || input.length > 250) {
            const lineCount = lines.length;
            // Clear the lines from the terminal screen
            for (let k = 0; k < lineCount; k++) {
                process.stdout.write('\u001b[1A\u001b[2K');
            }
            // Print a neat collapsed summary label
            const summary = chalk.yellow(`[pasted text: ${lineCount} lines, ${input.length} chars]`);
            process.stdout.write(chalk.cyan('You ❯ ') + summary + '\n');
        }

        // ── Undo: restore file dari backup .bak ─────────────────────────
        if (text.startsWith('/undo')) {
            const target = text.replace('/undo', '').trim();
            if (!target) {
                try {
                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);
                    const { stdout } = await execAsync(
                        `find "${BASE_DIR}" -name "*.bak" -not -path "*/node_modules/*" 2>/dev/null | head -20`
                    );
                    const baks = (stdout || '').trim().split('\n').filter(Boolean);
                    if (baks.length === 0) {
                        console.log(chalk.yellow('  Tidak ada file .bak yang ditemukan.'));
                    } else {
                        console.log(chalk.cyan(`  File .bak tersedia untuk di-restore:`));
                        baks.slice(0, 10).forEach((b: string) => console.log(chalk.dim(`    ${path.relative(BASE_DIR, b)}`)));
                        console.log(chalk.dim(`  Ketik: /undo <path/ke/file.ts> untuk restore`));
                    }
                } catch {
                    console.log(chalk.yellow('  Tidak dapat mencari file .bak.'));
                }
            } else {
                const bakPath = path.join(BASE_DIR, target.endsWith('.bak') ? target : target + '.bak');
                const origPath = bakPath.replace(/\.bak$/, '');
                if (!fs.existsSync(bakPath)) {
                    console.log(chalk.red(`  [ERROR] Backup tidak ditemukan: ${target}.bak`));
                } else {
                    await fs.promises.copyFile(bakPath, origPath);
                    await fs.promises.unlink(bakPath);
                    console.log(chalk.green(`  [OK] Berhasil restore: ${path.relative(BASE_DIR, origPath)} (backup dihapus)`));
                }
            }
            continue;
        }

        // ── AGY CLI Alignment: Exit/Quit ────────────────────────────────
        if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit' || text === '/exit' || text === '/quit') {
            const identity = readAntIdentity();
            console.log(chalk.green(`ANT: Session saved. Goodbye, ${identity.activeUser}!`));
            break;
        }

        // ── AGY CLI Alignment: Clear / New Chat ─────────────────────────
        if (text === '/new_chat' || text === '/clear') {
            contextHistory = [];
            console.clear();
            console.log(getAntAscii());
            console.log(chalk.green('Conversation circuit refreshed. Clean context initialized.\n'));
            continue;
        }

        // ── AGY PLANNER: /plan ─────────────────────────────────────────
        if (text.startsWith('/plan')) {
            const goal = text.replace(/^\/plan\s*/, '').trim();
            if (!goal) {
                console.log(chalk.yellow('\n[PLANNER] HTN Execution Planner'));
                console.log(chalk.dim('  Usage: /plan <goal_or_task_description>'));
                console.log(chalk.dim('  Example: /plan Refactor authentication middleware to support OAuth2\n'));
                continue;
            }
            console.log(chalk.cyan(`\n[Planner] Generating HTN Multi-Step Execution Plan for: "${goal}"...\n`));
            text = `Tolong buatkan rencana eksekusi terstruktur (HTN Execution Plan) bertahap untuk tujuan berikut: "${goal}". Pecah menjadi langkah-langkah konkret dan tentukan alat yang perlu dipanggil.`;
            // Lanjut ke loop agen dengan konteks perencanaan eksplisit
        }

        // ── AGY CONVERSATION BRANCHING: /branch ─────────────────────────
        if (text.startsWith('/branch')) {
            const parts = text.split(' ');
            const subCmd = parts[1]?.toLowerCase();
            const branchArg = parts.slice(2).join(' ').trim();

            const { createBranch, listBranches, loadBranch } = await import('./agentic/branching.js');

            if (subCmd === 'list') {
                const branches = await listBranches();
                console.log(chalk.cyan('\n[BRANCHES] CONVERSATION BRANCHES:'));
                if (branches.length === 0) {
                    console.log(chalk.yellow('  No saved branches yet. Use /branch create <name> to fork one.'));
                } else {
                    branches.forEach((b, idx) => {
                        console.log(`  ${chalk.bold(idx + 1)}. ${chalk.green(b)}`);
                    });
                }
                console.log();
                continue;
            } else if (subCmd === 'create') {
                if (!branchArg) {
                    console.log(chalk.yellow('  Usage: /branch create <branch_name>'));
                    continue;
                }
                const savedPath = await createBranch(branchArg, currentSessionId, contextHistory);
                console.log(chalk.green(`  [OK] Branch '${branchArg}' saved successfully (${contextHistory.length} messages snapshot).`));
                console.log(chalk.dim(`     Path: ${savedPath}\n`));
                continue;
            } else if (subCmd === 'checkout' || subCmd === 'load') {
                if (!branchArg) {
                    console.log(chalk.yellow('  Usage: /branch checkout <branch_name>'));
                    continue;
                }
                const branch = await loadBranch(branchArg);
                if (!branch) {
                    console.log(chalk.red(`  [ERROR] Branch '${branchArg}' not found.`));
                } else {
                    contextHistory = [...branch.history];
                    console.log(chalk.green(`  [OK] Switched to branch '${branchArg}' (${contextHistory.length} messages loaded).\n`));
                }
                continue;
            } else {
                console.log(chalk.cyan('\n[BRANCHES] CONVERSATION BRANCHING COMMANDS:'));
                console.log(chalk.dim('  /branch list               List all saved branches'));
                console.log(chalk.dim('  /branch create <name>      Save current context to a new branch'));
                console.log(chalk.dim('  /branch checkout <name>    Switch active session to a branch\n'));
                continue;
            }
        }

        // ── GIT CHECKPOINT: /checkpoint ────────────────────────────────
        if (text.startsWith('/checkpoint')) {
            const msg = text.replace(/^\/checkpoint\s*/, '').trim() || `ANT Checkpoint: ${new Date().toISOString()}`;
            console.log(chalk.cyan(`\n[Checkpoint] Creating Git Checkpoint: "${msg}"...`));
            try {
                const { handleFileOps } = await import('./actions/file_ops.js');
                const res: any = await handleFileOps('git_checkpoint', { message: msg }, path.join(process.cwd(), 'workspace'), process.cwd());
                if (res?.status === 'success') {
                    console.log(chalk.green(`  [OK] ${res.message}`));
                    if (res.output) console.log(chalk.dim(`     ${res.output.split('\n')[0]}`));
                } else {
                    console.log(chalk.yellow(`  [Info] ${res?.message || 'No changes to checkpoint.'}`));
                }
            } catch (e: any) {
                console.log(chalk.red(`  [ERROR] Checkpoint failed: ${e.message}`));
            }
            console.log();
            continue;
        }

        // ── CUSTOM SKILLS: /skills ─────────────────────────────────────
        if (text === '/skills' || text === '/skill list') {
            console.log(chalk.cyan('\n[SKILLS] AVAILABLE CUSTOM SKILLS:'));
            try {
                const { handleSkillOps } = await import('./actions/skill_ops.js');
                const skillsRes: any = await handleSkillOps('ant_skill_list', {}, path.join(process.cwd(), 'workspace'), process.cwd());
                if (skillsRes?.skills && skillsRes.skills.length > 0) {
                    skillsRes.skills.forEach((s: any, idx: number) => {
                        console.log(`  ${chalk.bold(idx + 1)}. ${chalk.green(s.fileName || s.name)} ${chalk.dim(`(${s.type || 'Custom Skill'})`)}`);
                    });
                } else {
                    console.log(chalk.yellow('  No custom skills installed yet. Create one with `ant_skill_create`.'));
                }
            } catch (e: any) {
                console.log(chalk.yellow(`  No custom skills available: ${e.message}`));
            }
            console.log();
            continue;
        }

        // ── MINDBY MEMORY: /store ──────────────────────────────────────
        if (text.startsWith('/store')) {
            const memoryContent = text.replace(/^\/store\s*/, '').trim();
            if (!memoryContent) {
                console.log(chalk.yellow('  Usage: /store <important_memory_content>'));
                console.log(chalk.dim('  Example: /store Target final submission for CockroachDB Hackathon is August 18, 2026.'));
                continue;
            }
            console.log(chalk.dim('  Translating & Persisting memory to Dual-Vault...'));

            let finalMemoryContent = memoryContent;
            try {
                const { chat } = await import('./ai/index.js');
                const brain = await getBrainConfig();
                const translated = await chat(
                    brain, 
                    [{ role: 'user', content: `Translate the following text to English. ONLY output the translation, no quotes, no explanation: ${memoryContent}` }], 
                    [], 
                    {}, 
                    "You are a strict translation system."
                );
                
                if (translated && translated.content && translated.content.trim()) {
                    finalMemoryContent = translated.content.trim();
                    console.log(chalk.cyan(`  [TRANSLATED] ${finalMemoryContent}`));
                }
            } catch (e) {
                // Silent fallback
            }

            // 1. Embed teks terlebih dahulu (agar tersimpan bersama vektor)
            const { storeMemory, getEmbedding } = await import('./memory.js');
            const memKey = `mem_${Date.now()}`;
            const embedding = await getEmbedding(finalMemoryContent).catch(() => []);
            await storeMemory('semantic', memKey, finalMemoryContent, ['cli_user', 'operator']);

            // 2. Coba simpan ke Cloud CockroachDB dengan embedding nyata
            const cloudSuccess = await storeCockroachMemory(finalMemoryContent, embedding.length > 0 ? embedding : undefined, ['cli_user']);
            if (cloudSuccess) {
                console.log(chalk.green(`  [OK] Memory synced to Cloud CockroachDB & Local Vault (vector: ${embedding.length > 0 ? '768-dim' : 'text only'})`));
            } else {
                // 3. Offline: antrikan ke pending_sync.json untuk sinkronisasi nanti
                const syncQueuePath = path.join(process.cwd(), 'workspace', 'memories', 'pending_sync.json');
                try {
                    await fs.promises.mkdir(path.dirname(syncQueuePath), { recursive: true });
                    let queue: any[] = [];
                    try { queue = JSON.parse(await fs.promises.readFile(syncQueuePath, 'utf-8')); } catch {}
                    queue.push({ content: memoryContent, embedding, tags: ['cli_user'], timestamp: new Date().toISOString() });
                    await fs.promises.writeFile(syncQueuePath, JSON.stringify(queue, null, 2));
                    console.log(chalk.green(`  [OK] Memory saved to Local Vault + queued for cloud sync (${queue.length} pending).`));
                } catch {
                    console.log(chalk.green(`  [OK] Memory saved to Local Vault (Offline Native).`));
                }
            }
            continue;
        }

        // ── MINDBY MEMORY: /recall ─────────────────────────────────────
        if (text.startsWith('/recall')) {
            const query = text.replace(/^\/recall\s*/, '').trim();
            if (!query) {
                console.log(chalk.yellow('  Usage: /recall <keyword_or_topic>'));
                continue;
            }
            console.log(chalk.cyan(`\n[Recall] Searching semantic memories for: "${query}"...`));

            // 1. Cari di Local Semantic Memory (Vector Cosine + Lexical Fallback)
            const { semanticSearch } = await import('./memory.js');
            const localHits = await semanticSearch(query, 'semantic', 5);

            // 2. Cari di CockroachDB Cloud jika aktif (dengan embedding nyata)
            let cloudHits: any[] = [];
            try {
                const { getEmbedding } = await import('./memory.js');
                const queryEmbedding = await getEmbedding(query).catch(() => []);
                cloudHits = await recallCockroachMemory(queryEmbedding, 5);
            } catch {}

            const allHits: Array<{ content: string; score: number; source: string; date?: string }> = [];

            localHits.forEach(h => {
                const textVal = typeof h.data === 'string' ? h.data : JSON.stringify(h.data);
                allHits.push({
                    content: textVal,
                    score: Math.round((h.score || 0) * 100),
                    source: 'Local Vault',
                    date: h.updatedAt ? new Date(h.updatedAt).toLocaleDateString() : undefined
                });
            });

            cloudHits.forEach(c => {
                if (!allHits.some(h => h.content === c.content)) {
                    allHits.push({
                        content: c.content,
                        score: Math.round((c.score || 0.8) * 100),
                        source: 'CockroachDB Cloud',
                        date: c.createdAt ? new Date(c.createdAt).toLocaleDateString() : undefined
                    });
                }
            });

            if (allHits.length === 0) {
                console.log(chalk.yellow('  No relevant semantic memories found.'));
            } else {
                console.log(chalk.green(`  Found ${allHits.length} relevant memories:`));
                allHits.forEach((m, idx) => {
                    const matchLabel = chalk.cyan(`[${m.score}% match]`);
                    const sourceLabel = chalk.dim(`[${m.source}]`);
                    console.log(`  ${chalk.bold(idx + 1)}. ${m.content} ${matchLabel} ${sourceLabel}`);
                });
            }
            console.log();
            continue;
        }

        // ── MINDBY MEMORY: /memories ───────────────────────────────────
        if (text === '/memories') {
            console.log(chalk.cyan('\n[MEMORIES] STORED SEMANTIC MEMORIES IN DATABASE:'));
            const memories = await listCockroachMemories(15);
            if (memories.length === 0) {
                console.log(chalk.yellow('  No semantic memories stored yet. Use /store to persist one.'));
            } else {
                memories.forEach((m, idx) => {
                    console.log(`  ${chalk.cyan(`[#${idx + 1}]`)} ${m.content} ${chalk.dim(`* ${m.createdAt}`)}`);
                });
            }
            console.log();
            continue;
        }

        // ── ANT-CYBER-CORPS: /swarm ────────────────────────────────────
        if (text.startsWith('/swarm')) {
            const args = text.replace(/^\/swarm\s*/, '').trim();
            const targetPath = args || process.cwd();
            console.log(chalk.cyan.bold('\n[ANT-CYBER-CORPS] Initiating Swarm Audit...'));
            try {
                const { launchSwarmAudit, renderSwarmReport } = await import('./agentic/swarm_orchestrator.js');
                const result = await launchSwarmAudit(
                    `Security audit of ${targetPath}`,
                    [targetPath]
                );
                renderSwarmReport(result);
            } catch (e: any) {
                console.log(chalk.red(`  Swarm Error: ${e.message}`));
            }
            continue;
        }

        // ── OFFLINE SYNC: /sync ────────────────────────────────────────
        if (text === '/sync') {
            const syncQueuePath = path.join(process.cwd(), 'workspace', 'memories', 'pending_sync.json');
            try {
                let queue: any[] = [];
                try { queue = JSON.parse(await fs.promises.readFile(syncQueuePath, 'utf-8')); } catch {}
                if (queue.length === 0) {
                    console.log(chalk.cyan('  [OK] No pending memories to sync. Cloud vault is up to date.'));
                    continue;
                }
                console.log(chalk.cyan(`\n[Sync] Syncing ${queue.length} offline memories to CockroachDB...`));
                let synced = 0;
                const failed: any[] = [];
                for (const item of queue) {
                    const ok = await storeCockroachMemory(item.content, item.embedding?.length > 0 ? item.embedding : undefined, item.tags || []);
                    if (ok) synced++;
                    else failed.push(item);
                }
                await fs.promises.writeFile(syncQueuePath, JSON.stringify(failed, null, 2));
                console.log(chalk.green(`  [OK] Synced: ${synced}/${queue.length} memories. Remaining in queue: ${failed.length}.`));
                if (failed.length > 0) {
                    console.log(chalk.yellow('  [WARN] Some memories failed to sync -- will retry on next /sync.'));
                }
            } catch (e: any) {
                console.log(chalk.red(`  Sync Error: ${e.message}`));
            }
            continue;
        }


        if (text.startsWith('/vault')) {
            const parts = text.split(' ');
            const targetVault = parts[1]?.toLowerCase();
            if (targetVault === 'cloud' || targetVault === 'local') {
                setVaultMode(targetVault);
                console.log(chalk.green(`  [OK] Active Memory Vault switched to: [${targetVault.toUpperCase()}]`));
            } else {
                console.log(chalk.cyan(`\n  Current Active Memory Vault: [${getVaultMode().toUpperCase()}]`));
                console.log(chalk.dim('  Usage: /vault cloud  (Persist to CockroachDB Serverless)'));
                console.log(chalk.dim('  Usage: /vault local  (Persist to local file-based offline vault)\n'));
            }
            continue;
        }

        // ── MINDBY MEMORY: /health ─────────────────────────────────────
        if (text === '/health') {
            console.log(chalk.cyan('\n[HEALTH] SYSTEM & COGNITIVE MEMORY HEALTH AUDIT:'));
            const health = await checkCockroachHealth();
            console.log(`  • CockroachDB Status : ${health.status === 'CONNECTED' ? chalk.green('CONNECTED [OK]') : chalk.yellow(health.status)}`);
            console.log(`  • Engine Type        : ${chalk.white(health.details)}`);
            console.log(`  • Total Memories     : ${chalk.cyan(health.totalMemories)} entries`);
            console.log(`  • Evidence Ledgers   : ${chalk.cyan(health.totalEvidences)} verified proofs`);
            console.log(`  • Active Vault       : ${chalk.bold.white(getVaultMode().toUpperCase())}`);
            console.log();
            continue;
        }

        // ── AGY CLI Alignment: Resume Session ───────────────────────────
        if (text.startsWith('/resume')) {
            const parts = text.split(' ');
            let targetSessionId = parts[1];
            
            if (!targetSessionId) {
                // Gunakan menu interaktif jika tidak ada argumen ID
                try {
                    const sessionDir = path.join(process.cwd(), 'workspace', 'sessions');
                    if (!fs.existsSync(sessionDir)) {
                        console.log(chalk.yellow('  Belum ada sesi tersimpan.'));
                        continue;
                    }
                    const files = await fs.promises.readdir(sessionDir);
                    const sessions = [];
                    for (const f of files.filter(x => x.endsWith('.json'))) {
                        try {
                            const d = JSON.parse(await fs.promises.readFile(path.join(sessionDir, f), 'utf-8'));
                            sessions.push({ 
                                id: d.id, 
                                name: d.name ?? '—', 
                                messages: d.messages?.length ?? 0, 
                                time: new Date(d.timestamp).toLocaleString() 
                            });
                        } catch {}
                    }
                    
                    if (sessions.length === 0) {
                        console.log(chalk.yellow('  Belum ada sesi tersimpan.'));
                        continue;
                    }
                    
                    sessions.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
                    const { showSessionSelector } = await import('./slash_menu.js');
                    const selectedId = await showSessionSelector(sessions);
                    
                    if (!selectedId) {
                        console.log(chalk.yellow('Dibatalkan.'));
                        continue;
                    }
                    targetSessionId = selectedId;
                } catch (e: any) {
                    console.log(chalk.red(`  Gagal membaca sesi: ${e.message}`));
                    continue;
                }
            }
            
            try {
                const sessionFile = path.join(process.cwd(), 'workspace', 'sessions', `${targetSessionId}.json`);
                const content = await fs.promises.readFile(sessionFile, 'utf-8');
                const data = JSON.parse(content);
                if (data.messages && Array.isArray(data.messages)) {
                    contextHistory = data.messages;
                    console.log(chalk.green(`✅ Berhasil memuat ulang sesi: ${targetSessionId} (${contextHistory.length} pesan memori)`));
                    const lastMsgs = contextHistory.slice(-2);
                    if (lastMsgs.length > 0) {
                        console.log(chalk.cyan('\nKonteks Terakhir:'));
                        lastMsgs.forEach((m: any) => {
                            const sender = m.role === 'user' ? 'You' : 'ANT';
                            console.log(chalk.dim(`  ${sender}: ${m.content?.substring(0, 120)}${m.content?.length > 120 ? '...' : ''}`));
                        });
                    }
                    console.log();
                }
            } catch (err: any) {
                console.log(chalk.red(`❌ Gagal memuat sesi '${targetSessionId}': File tidak ditemukan di workspace/sessions.`));
            }
            continue;
        }

        // ── AGY CLI Alignment: Change Model ───────────────────────────
        if (text.startsWith('/model')) {
            const parts = text.split(' ');
            let newModel = parts[1];

            let envPath = path.join(process.cwd(), '.env');
            const envSearch = [
                path.join(process.cwd(), '.env'),
                path.join(ANT_HOME, '.env'),
                path.join(os.homedir(), 'ant-cli', '.env'),
                '/data/data/com.termux/files/home/ant-cli/.env'
            ];
            let envContent = '';
            for (const p of envSearch) {
                if (fs.existsSync(p)) {
                    envPath = p;
                    try {
                        envContent = await fs.promises.readFile(p, 'utf-8');
                        break;
                    } catch {}
                }
            }

            if (!newModel) {
                const { getDiscoverableModels, renderModelSelectorHeader, formatModelEntryLine } = await import('./model_manager.js');
                const brain = await getBrainConfig();
                const currentModel = brain.custom_model || process.env.CUSTOM_MODEL || process.env.AI_MODEL || 'gemini-2.0-flash';
                const defaultModel = process.env.AI_MODEL || process.env.CUSTOM_MODEL || 'deepseek-v4-flash:cloud';
                const modelEntries = await getDiscoverableModels(currentModel, defaultModel, envContent);

                renderModelSelectorHeader();

                const maxRawLen = Math.max(
                    ...modelEntries.map(e => e.name.length + (e.isCurrent ? 10 : e.isDefault ? 10 : e.badge ? e.badge.length + 3 : 0)),
                    30
                );

                modelEntries.forEach((entry, idx) => {
                    console.log(formatModelEntryLine(entry, idx, maxRawLen + 3));
                });

                const answer = await askUser(chalk.yellow('\n  Pilih nomor atau ketik nama model baru: '));
                const num = parseInt(answer.trim());
                if (!isNaN(num) && num > 0 && num <= modelEntries.length) {
                    newModel = modelEntries[num - 1].name;
                } else if (answer.trim()) {
                    newModel = answer.trim();
                } else {
                    console.log(chalk.red('  ❌ Dibatalkan.'));
                    continue;
                }
            }

            // Heuristik Deteksi Provider Cerdas
            let newProvider = 'Ollama';
            const mLower = newModel.toLowerCase();
            if (mLower.includes('gemini')) newProvider = 'Google Gemini';
            else if (mLower === 'gpt-4o' || mLower === 'gpt-4' || mLower.startsWith('gpt-3.5') || mLower.startsWith('o1') || mLower.startsWith('o3')) newProvider = 'OpenAI';
            else if (mLower.includes('claude')) newProvider = 'Anthropic Claude';
            else if (mLower.includes('deepseek')) newProvider = 'DeepSeek';

            try {
                // Update or Append CLI_CUSTOM_MODEL
                if (envContent.includes('CLI_CUSTOM_MODEL=')) {
                    envContent = envContent.replace(/#?\s*CLI_CUSTOM_MODEL=.*/g, `CLI_CUSTOM_MODEL=${newModel}`);
                } else {
                    envContent += `\nCLI_CUSTOM_MODEL=${newModel}`;
                }

                // Update or Append CLI_AI_PROVIDER
                if (envContent.includes('CLI_AI_PROVIDER=')) {
                    envContent = envContent.replace(/#?\s*CLI_AI_PROVIDER=.*/g, `CLI_AI_PROVIDER=${newProvider}`);
                } else {
                    envContent += `\nCLI_AI_PROVIDER=${newProvider}`;
                }

                await fs.promises.writeFile(envPath, envContent, 'utf-8');

                // FORCE RELOAD to runtime memory so getBrainConfig catches it immediately without restart
                process.env.CLI_CUSTOM_MODEL = newModel;
                process.env.CLI_AI_PROVIDER = newProvider;

                try {
                    const { setActiveModel } = await import('./agentic/mailbox/index.js');
                    await setActiveModel(newModel, `/model ${newModel}`, `User mengganti model aktif ke ${newModel}`, `Model diganti ke ${newModel}. Mohon lanjutkan tugas bersama Ard dengan teliti.`);
                } catch (mbErr: any) {
                    console.log(chalk.dim(`   [Mailbox Notice]: ${mbErr.message}`));
                }

                console.log(chalk.green(`[OK] Model CLI berhasil diganti ke: ${chalk.bold.white(newModel)}`));
                console.log(chalk.dim(`   Provider otomatis diset ke: ${newProvider}`));
                console.log(chalk.yellow(`   Ketik /new_chat jika model baru mulai berhalusinasi dengan konteks lama.\n`));
            } catch (e: any) {
                console.log(chalk.red(`[ERROR] Gagal memperbarui .env: ${e.message}\n`));
            }
            continue;
        }

        // ── AGY CLI Alignment: Direct Shell execution (using !) ───────────
        if (text.startsWith('!')) {
            const shellCommand = text.slice(1).trim();
            if (!shellCommand) {
                console.log(chalk.yellow('Format: ! <command_shell> (contoh: !npm install)'));
                continue;
            }
            
            console.log(chalk.dim(`\n[Bash] Menjalankan perintah shell: ${shellCommand}`));
            try {
                const { executeAction } = await import('./actions.js');
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
            continue;
        }

        // Tangani /loop commands
        if (text === '/loop') {
            console.log(chalk.magenta(`\n[AUTOPILOT TRADING LOOP]`));
            console.log(`Gunakan perintah ini untuk mengatur autopilot:`);
            console.log(`• ${chalk.bold('/loop start')} - Menyalakan trading autopilot di background`);
            console.log(`• ${chalk.bold('/loop stop')}  - Mematikan trading autopilot (kembali ke manual)\n`);
            continue;
        }

        if (text.startsWith('/loop ')) {
            const loopAction = text.slice(6).trim().toLowerCase();
            if (loopAction === 'start' || loopAction === 'stop') {
                const enable = loopAction === 'start';
                try {
                    const envPath = path.join(process.cwd(), '.env');
                    const envContent = await fs.promises.readFile(envPath, 'utf-8');
                    const envLines = envContent.split('\n');
                    const idx = envLines.findIndex(line => line.startsWith('TRADING_LOOP_ENABLED='));
                    if (idx !== -1) {
                        envLines[idx] = `TRADING_LOOP_ENABLED=${enable}`;
                    } else {
                        envLines.push(`TRADING_LOOP_ENABLED=${enable}`);
                    }
                    await fs.promises.writeFile(envPath, envLines.join('\n'));
                    
                    // Reload env in process
                    process.env.TRADING_LOOP_ENABLED = String(enable);
                    
                    console.log(chalk.yellow(`\n[TRADING LOOP] Modul trading loop dinonaktifkan di ANT CLI (TRADING_LOOP_ENABLED=${enable}).\n`));
                } catch (e: any) {
                    console.log(chalk.red(`\n[ERROR] Gagal mengubah status loop: ${e.message}\n`));
                }
                continue;
            }
        }

        // Tangani /exness commands (MT5 Autopilot Satellite)
        if (text === '/exness' || text.startsWith('/exness ')) {
            const exnessAction = text.replace('/exness', '').trim().toLowerCase();
            if (exnessAction === 'start' || exnessAction === 'stop') {
                const enable = exnessAction === 'start';
                try {
                    const envPath = path.join(process.cwd(), '.env');
                    const envContent = await fs.promises.readFile(envPath, 'utf-8').catch(() => '');
                    const envLines = envContent.split('\n');
                    const idx = envLines.findIndex(line => line.startsWith('EXNESS_AUTOTRADE_ENABLED='));
                    if (idx !== -1) {
                        envLines[idx] = `EXNESS_AUTOTRADE_ENABLED=${enable}`;
                    } else {
                        envLines.push(`EXNESS_AUTOTRADE_ENABLED=${enable}`);
                    }
                    await fs.promises.writeFile(envPath, envLines.join('\n'));
                    process.env.EXNESS_AUTOTRADE_ENABLED = String(enable);

                    if (enable) {
                        console.log(chalk.green(`\n[EXNESS MT5 SATELLITE] Autopilot Exness diaktifkan (EXNESS_AUTOTRADE_ENABLED=true). Berjalan otonom.🟢\n`));
                    } else {
                        console.log(chalk.yellow(`\n[EXNESS MT5 SATELLITE] Autopilot Exness dinonaktifkan (EXNESS_AUTOTRADE_ENABLED=false). Loop dihentikan.⏸️\n`));
                    }
                } catch (e: any) {
                    console.log(chalk.red(`\n[ERROR] Gagal mengubah status Exness Autopilot: ${e.message}\n`));
                }
                continue;
            } else {
                console.log(chalk.cyan(`\n[EXNESS MT5 AUTONOMOUS SATELLITE]`));
                console.log(`Gunakan perintah ini untuk mengelola Autopilot Exness $10-mu:`);
                console.log(`• ${chalk.bold('/exness start')} - Menyalakan Exness MT5 Autopilot di background`);
                console.log(`• ${chalk.bold('/exness stop')}  - Mematikan Exness MT5 Autopilot (kembali ke manual)`);
                console.log(`• ${chalk.bold('/exness journal')} - Melihat log jurnal keputusan trading otonom ANT\n`);
                continue;
            }
        }

        // Tangani /session commands (List & Load)
        if (text === '/session list' || text === '/sessions') {
            console.log(chalk.cyan('\n📂 DAFTAR SESI PERCAKAPAN YANG TERSEDIA:'));
            try {
                const sessionDir = path.join(process.cwd(), 'workspace', 'sessions');
                if (!fs.existsSync(sessionDir)) {
                    console.log(chalk.yellow('Belum ada sesi percakapan yang disimpan.'));
                    continue;
                }
                const files = await fs.promises.readdir(sessionDir);
                const sessions = [];
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        try {
                            const data = JSON.parse(await fs.promises.readFile(path.join(sessionDir, f), 'utf-8'));
                            sessions.push({
                                ID: data.id,
                                Nama: data.name,
                                Tanggal: new Date(data.timestamp).toLocaleString(),
                                Pesan: data.messages ? data.messages.length : 0
                            });
                        } catch {}
                    }
                }
                if (sessions.length === 0) {
                    console.log(chalk.yellow('Belum ada sesi percakapan yang disimpan.'));
                } else {
                    // Sort by timestamp descending
                    sessions.sort((a, b) => new Date(b.Tanggal).getTime() - new Date(a.Tanggal).getTime());
                    console.table(sessions.slice(0, 10)); // Show top 10 sessions
                    console.log(chalk.dim(`Gunakan: /session load <ID> untuk memulihkan sesi.`));
                }
            } catch (e: any) {
                console.log(chalk.red(`\n[ERROR] Gagal membaca daftar sesi: ${e.message}\n`));
            }
            continue;
        }

        if (text.startsWith('/session load ') || text.startsWith('/load_session ')) {
            const loadId = text.replace(/^\/(session load|load_session)\s+/, '').trim();
            if (!loadId) {
                console.log(chalk.red('Error: Harap berikan ID sesi. Contoh: /session load session-123456'));
                continue;
            }
            
            try {
                const sessionFile = path.join(process.cwd(), 'workspace', 'sessions', `${loadId}.json`);
                if (!fs.existsSync(sessionFile)) {
                    console.log(chalk.red(`Error: Sesi dengan ID "${loadId}" tidak ditemukan.`));
                    continue;
                }
                const data = JSON.parse(await fs.promises.readFile(sessionFile, 'utf-8'));
                contextHistory = data.messages || [];
                console.log(chalk.green(`\n🎉 Sesi "${data.name}" (${data.id}) berhasil dimuat!`));
                console.log(chalk.dim(`Memulihkan ${contextHistory.length} pesan percakapan...`));
                
                // Print the last 2 messages for context
                const lastMsgs = contextHistory.slice(-2);
                if (lastMsgs.length > 0) {
                    console.log(chalk.cyan('\nKonteks Terakhir:'));
                    lastMsgs.forEach(m => {
                        const sender = m.role === 'user' ? 'You' : 'ANT';
                        console.log(chalk.dim(`  ${sender}: ${m.content?.substring(0, 120)}${m.content?.length > 120 ? '...' : ''}`));
                    });
                }
                console.log();
            } catch (e: any) {
                console.log(chalk.red(`\n[ERROR] Gagal memuat sesi: ${e.message}\n`));
            }
            continue;
        }

        // Tangani Slash Commands (Core Tools)
        if (text.startsWith('/')) {
            try {
                if (text === '/clear') {
                    contextHistory = [];
                    console.clear();
                    console.log(getAntAscii());
                } else {
                    console.log(`\n${chalk.magenta.bold('[CORE PROTOCOL]')} Perintah '${text}' diterima.\n`);
                }
            } catch (e: any) {
                console.log(`\n${chalk.red.bold('[COMMAND ERROR]')} ${e.message}\n`);
            }
            continue;
        }

        try {
            // Jalankan agent loop
            contextHistory = await runCliAgentLoop(text, contextHistory);
            await saveCliSession(currentSessionId, contextHistory);
        } catch (e: any) {
            console.log(`\n\x1b[31m[FATAL ERROR]\x1b[0m ${e.message}\n`);
            break;
        }
    }

    closeCli();
    process.exit(0);
}

main().catch(err => {
    console.error('Crash:', err);
    process.exit(1);
});

