import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export async function handleMailboxArgv(args: string[], sessionId: string): Promise<boolean> {
    if (args[0] !== 'mailbox') return false;

    const subCommand = args[1] || 'list';
    const indexVal = args[2];
    const ledgerPath = path.join(process.cwd(), 'workspace', 'registry', 'mailbox', 'ledger.jsonl');

    try {
        if (subCommand === 'verify') {
            console.log(chalk.cyan('\n[Verifying] Memverifikasi Integritas Rantai Ledger Mailbox...'));
            const { MailboxWriter } = await import('../../agentic/mailbox/mailboxWriter.js');
            const writer = new MailboxWriter();
            const result = writer.verifyChainIntegrity();
            if (result.valid) {
                console.log(chalk.green(`[OK] Rantai hash valid. (${result.totalEntries} entri diverifikasi)`));
            } else {
                console.log(chalk.red(`[ERROR] Korupsi terdeteksi pada entri #${result.failedAt}`));
                console.log(chalk.red(`   Alasan: ${result.reason}`));
            }
        } else if (subCommand === 'inspect' && indexVal) {
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
        } else if (subCommand === 'list') {
            console.log(chalk.cyan('\n[ANT MODEL MAILBOX]:'));
            if (!fs.existsSync(ledgerPath)) {
                console.log(chalk.yellow('Mailbox kosong.'));
            } else {
                const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
                console.log(`Session: ${sessionId}\n`);
                const { MailboxWriter } = await import('../../agentic/mailbox/mailboxWriter.js');
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
                    } catch {
                         console.log(chalk.red(`[Error parsing entry ${i + 1}]`));
                    }
                });
                
                console.log(chalk.dim(`\nGunakan: ant mailbox inspect <id> untuk melihat detail lengkap.`));
                console.log(chalk.dim(`Gunakan: ant mailbox verify untuk audit cryptographic ledger.`));
            }
        } else {
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
