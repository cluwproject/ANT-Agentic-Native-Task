import chalk from 'chalk';
import { getAntAscii } from '../identity.js';
import { handleTaskArgv } from './task.js';
import { handleMailboxArgv } from './mailbox.js';
import { handleSwarmArgv } from './swarm.js';
import { handleAgentArgv } from './agent.js';
import { runCliAgentLoop, closeCli } from '../../agent_loop/index.js';

export function printCliHelp(): void {
    console.log(getAntAscii());
    console.log(chalk.bold('Penggunaan:'));
    console.log('  ant [opsi | subcommand]\n');
    console.log(chalk.bold('Opsi Utama:'));
    console.log('  -p, --prompt "<prompt>"   Menjalankan perintah secara satu kali (one-shot mode) lalu keluar.');
    console.log('  -h, --help                Menampilkan panduan bantuan ini.');
    console.log('  --sandbox                 Menjalankan CLI dalam lingkungan terisolasi (sandbox).\n');
    console.log(chalk.bold('Subcommands Mandiri:'));
    console.log('  ant agent list                         Daftar 9 sub-agen spesialis terdaftar');
    console.log('  ant agent run <role> "<task>"          Eksekusi sub-agen spesifik secara langsung');
    console.log('  ant swarm "<goal>" "<target>"          Jalankan 5-Unit Swarm Security Audit');
    console.log('  ant swarm report [mission_id]          Kompilasi ringkasan laporan audit (White Unit)');
    console.log('  ant swarm osint                        Pusat investigasi multi-dimensi (Purple Unit)');
    console.log('  ant mailbox list                       Lihat rekaman inter-model relay ledger');
    console.log('  ant mailbox inspect <id>               Inspeksi detail entri mailbox');
    console.log('  ant mailbox verify                     Audit integritas kriptografi rantai ledger');
    console.log('  ant task list                          Daftar tugas latar belakang terjadwal');
    console.log('  ant task schedule "<cron>" "<command>" Daftarkan tugas otomatisasi cron\n');
}

export async function routeArgv(args: string[], sessionId: string): Promise<boolean> {
    if (args.length === 0) return false;

    if (args.includes('-h') || args.includes('--help')) {
        printCliHelp();
        process.exit(0);
    }

    if (await handleTaskArgv(args)) return true;
    if (await handleMailboxArgv(args, sessionId)) return true;
    if (await handleSwarmArgv(args)) return true;
    if (await handleAgentArgv(args)) return true;

    // Check one-shot prompt (-p / --prompt)
    let oneShotPrompt: string | null = null;
    let forceSandbox = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-p' || arg === '--prompt') {
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

    if (oneShotPrompt) {
        try {
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

    return false;
}
