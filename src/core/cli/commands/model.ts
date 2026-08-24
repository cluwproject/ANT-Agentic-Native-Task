import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { CliContext } from '../types.js';
import { getBrainConfig } from '../../../shared/data.js';
import { askUser } from '../../agent_loop/index.js';

export async function handleModelCommands(text: string, ctx: CliContext): Promise<boolean> {
    // ── /mailbox ──────────────────────────────────────────────────────
    if (text === '/mailbox') {
        const ledgerPath = path.join(process.cwd(), 'workspace', 'registry', 'mailbox', 'ledger.jsonl');
        console.log(chalk.cyan('\n[ANT MODEL MAILBOX]:'));
        if (!fs.existsSync(ledgerPath)) {
            console.log(chalk.yellow('Mailbox kosong.'));
        } else {
            const lines = fs.readFileSync(ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
            console.log(`Session: ${ctx.sessionId}\n`);
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
            console.log(chalk.dim(`Gunakan: ant mailbox verify untuk audit cryptographic ledger.\n`));
        }
        return true;
    }

    // ── /model ────────────────────────────────────────────────────────
    if (text === '/model' || text.startsWith('/model ')) {
        const envPath = ctx.activeEnvPath;
        let envContent = '';
        try {
            envContent = await fs.promises.readFile(envPath, 'utf-8');
        } catch {
            envContent = '';
        }

        let newModel = text.replace('/model', '').trim();

        if (!newModel) {
            const { getDiscoverableModels, renderModelSelectorHeader, formatModelEntryLine } = await import('../../model_manager.js');
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
                return true;
            }
        }

        let newProvider = 'Ollama';
        const mLower = newModel.toLowerCase();
        if (mLower.includes('gemini')) newProvider = 'Google Gemini';
        else if (mLower === 'gpt-4o' || mLower === 'gpt-4' || mLower.startsWith('gpt-3.5') || mLower.startsWith('o1') || mLower.startsWith('o3')) newProvider = 'OpenAI';
        else if (mLower.includes('claude')) newProvider = 'Anthropic Claude';
        else if (mLower.includes('deepseek')) newProvider = 'DeepSeek';
        else if (mLower.includes('z-ai/') || mLower.includes('-cloud') || mLower.includes('openrouter')) newProvider = 'OpenAI';

        try {
            if (envContent.includes('CLI_CUSTOM_MODEL=')) {
                envContent = envContent.replace(/#?\s*CLI_CUSTOM_MODEL=.*/g, `CLI_CUSTOM_MODEL=${newModel}`);
            } else {
                envContent += `\nCLI_CUSTOM_MODEL=${newModel}`;
            }

            if (envContent.includes('CLI_AI_PROVIDER=')) {
                envContent = envContent.replace(/#?\s*CLI_AI_PROVIDER=.*/g, `CLI_AI_PROVIDER=${newProvider}`);
            } else {
                envContent += `\nCLI_AI_PROVIDER=${newProvider}`;
            }

            await fs.promises.writeFile(envPath, envContent, 'utf-8');

            process.env.CLI_CUSTOM_MODEL = newModel;
            process.env.CLI_AI_PROVIDER = newProvider;

            try {
                const { setActiveModel } = await import('../../agentic/mailbox/index.js');
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
        return true;
    }

    return false;
}
