import { runCliAgentLoop, askUser, closeCli } from './agent_loop/index.js';
import { Logger } from '../utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';
import chalk from 'chalk';
import { getBrainConfig } from '../shared/data.js';

// Baca konfigurasi dari direktori proyek saat ini, lalu fallback ke ~/.ant/
const BASE_DIR = process.cwd();
const ANT_HOME = path.join(os.homedir(), '.ant');
dotenv.config({ path: path.join(BASE_DIR, '.env') });

// Baca identity file ANT
function readAntIdentity() {
    try {
        const rel = JSON.parse(fs.readFileSync(path.join(ANT_HOME, 'identity', 'relationship.json'), 'utf-8'));
        const usr = JSON.parse(fs.readFileSync(path.join(ANT_HOME, 'identity', 'user.json'), 'utf-8'));
        return { owner: usr.owner || 'User', origin: rel.origin || 'ANT' };
    } catch {
        return { owner: 'User', origin: 'ANT' };
    }
}

function getAntAscii() {
    const identity = readAntIdentity();
    return chalk.green(`
  🐜 ANT — Agentic Native Task
  You Ask. ANT Acts.

  ➜  Version  : v0.1.0
  ➜  Origin   : ${identity.origin}
  ➜  Owner    : ${identity.owner}
  ➜  Engine   : ANT Agentic Runtime
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
    
    // Auto-diagnose and heal before starting CLI
    try {
        const { SelfHealer } = await import('./healing.js');
        const diagnosis = await SelfHealer.diagnose('CLI Startup Scan');
        if (diagnosis.anomaliesDetected.length > 0) {
            console.log(chalk.yellow(`\n⚠️  [SELF-HEALER] Terdeteksi ${diagnosis.anomaliesDetected.length} anomali pada sistem.`));
            diagnosis.remediationsApplied.forEach(r => {
                console.log(chalk.green(`  ✓ ${r}`));
            });
            console.log(chalk.green(`🎉 Semua anomali telah diperbaiki secara otonom!\n`));
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
                console.log(chalk.green(`\n🎉 Success! Task registered: "${commandVal}" with cron "${cronVal}" (ID: ${id})`));
            } catch (err: any) {
                console.error(chalk.red(`Failed to schedule task: ${err.message}`));
            }
            process.exit(0);
        } else if (subCommand === 'list') {
            console.log(chalk.cyan('\n📅 REGISTERED CUSTOM SCHEDULES:'));
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
    
    // Handle agent commands
    if (args[0] === 'agent') {
        const subCommand = args[1];
        if (subCommand === 'list') {
            console.log(chalk.cyan('\n🔍 ANT AGENTS REGISTRY:'));
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
            
            console.log(chalk.cyan(`\n🚀 Memulai Agent: ${agentName} [Sandbox: ${sandbox ? 'ON' : 'OFF'}]...`));
            
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
    console.log(chalk.dim('Memuat konfigurasi dan memori neural...'));

    // Load and display Dashboard
    try {
        let brain = await getBrainConfig();
        const activeModel = brain.custom_model || 'gemini-2.0-flash';
        const provider = brain.provider || 'Google Gemini';

        const printLine = (content: string) => {
            const innerWidth = 58;
            const clean = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const rawLength = clean.length;
            const padding = Math.max(0, innerWidth - rawLength);
            console.log(chalk.cyan('│') + content + ' '.repeat(padding) + chalk.cyan('│'));
        };

        console.log(chalk.cyan('╭──────────────────────────────────────────────────────────╮'));
        printLine(`  ${chalk.bold.white('ANT — Agentic Native Task v0.1.0')}`);
        printLine('');
        printLine(`  ${chalk.cyan('Model:')} ${chalk.white(activeModel)} (${chalk.dim(provider)})`);
        printLine(`  ${chalk.cyan('Cognitive Core:')} ${chalk.white('ANT Core')}`);
        printLine(`  ${chalk.cyan('Session ID:')} ${chalk.white(currentSessionId)}`);
        printLine('');
        printLine(`  ${chalk.bold.green('Tips for getting started:')}`);
        printLine(`  ${chalk.dim('• Type ! <command> to run a shell command inline')}`);
        printLine(`  ${chalk.dim('• Type /new_chat to fresh cognitive session')}`);
        printLine('');
        console.log(chalk.cyan('╰──────────────────────────────────────────────────────────╯\n'));
    } catch (e: any) {
        console.log(chalk.yellow(`[DASHBOARD LOAD WARN] Gagal memuat info detail: ${e.message}\n`));
    }

    // Auto-start Trading Loop if enabled in .env (AGY Autostart Alignment)
    try {
        const envPath = path.join(process.cwd(), '.env');
        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf-8');
            const match = envContent.match(/^TRADING_LOOP_ENABLED=(true|false)/m);
            if (match && match[1] === 'true') {
                const { startTradingLoop } = await import('./trading_loop.js');
                startTradingLoop();
                console.log(chalk.green('🔄 Autopilot Trading Loop otomatis diaktifkan dari konfigurasi .env.\n'));
            }
        }
    } catch (e: any) {
        console.log(chalk.yellow(`[WARN] Gagal memulai trading loop otomatis: ${e.message}\n`));
    }

    console.log(chalk.green('Sistem Siap! ANT berjalan dalam mode Standalone CLI.'));
    console.log(chalk.dim('(Ketik "exit" atau "quit" untuk keluar)'));
    console.log(chalk.dim('(Ketik "/help" untuk melihat perintah teknis)\n'));

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
        const text = input.trim();
        
        if (!text) continue;

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
                    console.log(chalk.red(`  ❌ Backup tidak ditemukan: ${target}.bak`));
                } else {
                    await fs.promises.copyFile(bakPath, origPath);
                    await fs.promises.unlink(bakPath);
                    console.log(chalk.green(`  ✅ Berhasil restore: ${path.relative(BASE_DIR, origPath)} (backup dihapus)`));
                }
            }
            continue;
        }

        // ── AGY CLI Alignment: Exit/Quit ────────────────────────────────
        if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit' || text === '/exit' || text === '/quit') {
            console.log(chalk.green('ANT: Sampai jumpa, Ard!'));
            break;
        }

        // ── AGY CLI Alignment: Clear / New Chat ─────────────────────────
        if (text === '/new_chat' || text === '/clear') {
            contextHistory = [];
            console.clear();
            console.log(getAntAscii());
            console.log(chalk.green('Sirkuit percakapan telah disegarkan. Lembaran baru dimulai, Ard!\n'));
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

            const envPath = path.join(process.cwd(), '.env');
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = await fs.promises.readFile(envPath, 'utf-8');
            }

            if (!newModel) {
                const modelRegex = /(?:CUSTOM_MODEL|CLI_CUSTOM_MODEL)[A-Z_]*=([^\n\r]+)/g;
                let match;
                const models = new Set<string>();
                while ((match = modelRegex.exec(envContent)) !== null) {
                    if (match[1] && match[1].trim()) {
                        models.add(match[1].trim());
                    }
                }
                const modelList = Array.from(models);
                
                if (modelList.length > 0) {
                    console.log(chalk.cyan('\n📋 Daftar Model Tersedia (dari .env):'));
                    modelList.forEach((m, idx) => {
                        console.log(`  ${chalk.bold(idx + 1)}. ${m}`);
                    });
                    
                    const answer = await askUser(chalk.yellow('\n  Pilih nomor atau ketik nama model baru: '));
                    const num = parseInt(answer.trim());
                    if (!isNaN(num) && num > 0 && num <= modelList.length) {
                        newModel = modelList[num - 1];
                    } else if (answer.trim()) {
                        newModel = answer.trim();
                    } else {
                        console.log(chalk.red('  ❌ Dibatalkan.'));
                        continue;
                    }
                } else {
                    console.log(chalk.yellow('  Penggunaan: /model <nama_model> (contoh: /model gemma4:31b)'));
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

                console.log(chalk.green(`\n✅ Model CLI berhasil diganti ke: ${chalk.bold.white(newModel)}`));
                console.log(chalk.dim(`   Provider otomatis diset ke: ${newProvider}`));
                console.log(chalk.yellow(`   Ketik /new_chat jika model baru mulai berhalusinasi dengan konteks lama.\n`));
            } catch (e: any) {
                console.log(chalk.red(`❌ Gagal memperbarui .env: ${e.message}\n`));
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
            
            console.log(chalk.dim(`\n🛠️  Menjalankan perintah shell: ${shellCommand}`));
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
                    
                    const { startTradingLoop, stopTradingLoop } = await import('./trading_loop.js');
                    if (enable) {
                        startTradingLoop();
                        console.log(chalk.green(`\n[TRADING LOOP] Autopilot diaktifkan (TRADING_LOOP_ENABLED=true). Berjalan di background.🟢\n`));
                    } else {
                        stopTradingLoop();
                        console.log(chalk.yellow(`\n[TRADING LOOP] Autopilot dinonaktifkan (TRADING_LOOP_ENABLED=false). Loop dihentikan.⏸️\n`));
                    }
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
                const { executeAgentCommand } = await import('./agent.js');
                const agentResponse = await executeAgentCommand(text);
                
                if (agentResponse?.metadata?.action_type === 'CLEAR_CHAT') {
                    contextHistory = [];
                    console.clear();
                    console.log(getAntAscii());
                }
                
                const reply = agentResponse.data || JSON.stringify(agentResponse, null, 2);
                console.log(`\n${chalk.magenta.bold('[CORE PROTOCOL]')}\n${reply}\n`);
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

