import chalk from 'chalk';
import { getAntAscii } from '../identity.js';
import { handleTaskArgv } from './task.js';
import { handleMailboxArgv } from './mailbox.js';
import { handleSwarmArgv } from './swarm.js';
import { handleAgentArgv } from './agent.js';
import { handleScaffoldArgv } from './scaffold.js';
import { handleMcpArgv } from './mcp.js';
import { parseOneShotArgs, type OneShotInvocation } from './one_shot.js';
import { runCliAgentLoopDetailed, closeCli } from '../../agent_loop/index.js';

export function printCliHelp(): void {
    console.log(getAntAscii());
    console.log(chalk.bold('Penggunaan:'));
    console.log('  ant [opsi | subcommand]\n');
    console.log(chalk.bold('Opsi Utama:'));
    console.log('  -p, --prompt "<prompt>"   Menjalankan perintah secara satu kali (one-shot mode) lalu keluar.');
    console.log('  --output-format <text|json>  Format output one-shot (json = terstruktur untuk CI/script).');
    console.log('  -h, --help                Menampilkan panduan bantuan ini.');
    console.log('  --sandbox                 Menjalankan CLI dalam lingkungan terisolasi (sandbox).\n');
    console.log(chalk.bold('Subcommands Mandiri:'));
    console.log('  ant scaffold <profile> <dir>           Buat project baru berbasis profil (L1/L2)');
    console.log('  ant agent list                         Daftar sub-agen spesialis terdaftar');
    console.log('  ant agent run <role> "<task>"          Eksekusi sub-agen spesifik secara langsung');
    console.log('  ant swarm "<goal>" "<target>"          Jalankan 5-Unit Swarm Security Audit');
    console.log('  ant swarm report [mission_id]          Kompilasi ringkasan laporan audit (White Unit)');
    console.log('  ant swarm osint                        Pusat investigasi multi-dimensi (Purple Unit)');
    console.log('  ant mcp list                           Daftar MCP server terdaftar (.ant/mcp.json)');
    console.log('  ant mcp add <nama> <command> [args..]  Daftarkan MCP server baru');
    console.log('  ant mcp connect [nama]                 Konek server & muat tools untuk semua model');
    console.log('  ant mcp tools                          Daftar tool MCP aktif (JSON)');
    console.log('  ant mailbox list                       Lihat rekaman inter-model relay ledger');
    console.log('  ant mailbox inspect <id>               Inspeksi detail entri mailbox');
    console.log('  ant mailbox verify                     Audit integritas kriptografi rantai ledger');
    console.log('  ant task list                          Daftar tugas latar belakang terjadwal');
    console.log('  ant task schedule "<cron>" "<command>" Daftarkan tugas otomatisasi cron');
    console.log('  ant doctor                             Diagnosis kesehatan ANT core (SQLite, API, Env)\n');
}

export async function routeArgv(args: string[], sessionId: string): Promise<boolean> {
    if (args.length === 0) return false;

    if (args.includes('-h') || args.includes('--help')) {
        printCliHelp();
        process.exit(0);
    }

    if (args[0] === 'doctor') {
        const { runDoctor } = await import('../commands/doctor.js');
        const success = await runDoctor(args.slice(1));
        process.exit(success ? 0 : 1);
    }

    // Headless MCP management (ant mcp list|add|remove|connect|tools)
    if (await handleMcpArgv(args)) return true;

    if (await handleScaffoldArgv(args)) return true;
    if (await handleTaskArgv(args)) return true;
    if (await handleMailboxArgv(args, sessionId)) return true;
    if (await handleSwarmArgv(args)) return true;
    if (await handleAgentArgv(args)) return true;

    // Check one-shot prompt (-p / --prompt [--output-format text|json])
    let oneShot: OneShotInvocation | null = null;
    try {
        oneShot = parseOneShotArgs(args);
    } catch (err: any) {
        console.log(chalk.red(`Error: ${err.message}`));
        process.exit(1);
    }

    if (oneShot) {
        try {
            if (oneShot.sandbox && oneShot.outputFormat !== 'json') {
                console.log(chalk.yellow('[SANDBOX MODE ACTIVE]'));
            }
            if (oneShot.outputFormat === 'json') {
                // Headless JSON: semua noise UI dialihkan ke stderr agar
                // stdout murni JSON — aman dipipe ke jq / dikonsumsi CI.
                const { setUiSilent } = await import('../../agent_loop/ui.js');
                setUiSilent(true);
            }
            const result = await runCliAgentLoopDetailed(oneShot.prompt, []);

            if (oneShot.outputFormat === 'json') {
                // Output terstruktur ala `claude -p --output-format json`:
                // teks asisten terakhir + status loop, tanpa noise UI lain.
                const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');
                process.stdout.write(JSON.stringify({
                    ok: result.completed && !result.cancelled,
                    completed: result.completed,
                    cancelled: result.cancelled,
                    attemptsUsed: result.attemptsUsed,
                    result: lastAssistant?.content ?? ''
                }, null, 2) + '\n');
            }
        } catch (err: any) {
            if (oneShot.outputFormat === 'json') {
                process.stdout.write(JSON.stringify({ ok: false, error: err.message, result: '' }, null, 2) + '\n');
                process.exitCode = 1;
            } else {
                console.error(chalk.red(`[FATAL ERROR] ${err.message}`));
            }
        }
        closeCli();
        process.exit(process.exitCode ?? 0);
    }

    return false;
}
