import path from 'path';
import chalk from 'chalk';
import { MailboxWriter } from './mailboxWriter.js';
import { CircuitBreaker } from './circuitBreaker.js';
import { ClaimVerifier } from './claimVerifier.js';
import { PromptInjector } from './promptInjector.js';
import { ChannelGuard } from './channelGuard.js';
import { Logger } from '../../../utils/logger.js';

export * from './channelGuard.js';
export * from './claimVerifier.js';
export * from './promptInjector.js';
export * from './circuitBreaker.js';

const workspaceRoot = process.cwd();
const configPath = path.join(workspaceRoot, 'workspace', 'registry', 'mailbox', 'config.json');
const writer = new MailboxWriter(workspaceRoot);
const circuitBreaker = new CircuitBreaker(configPath);

let activeModelId = 'gemma4:31b-cloud';
let unacknowledgedCount = 0;
let lastHandoverEnvelope: any = null;

export function getActiveModelId(): string {
    return activeModelId;
}

export function getLastHandoverEnvelope(): any {
    return lastHandoverEnvelope;
}

export async function setActiveModel(
    newModelId: string,
    trigger: string = '/model command',
    handoverSummary: string = 'Transisi model aktif di ant-cli.',
    messageText: string = 'Melanjutkan tugas dengan model baru.'
): Promise<{ success: boolean; envelope?: any; reason?: string }> {
    const prevModelId = activeModelId;
    if (prevModelId === newModelId) {
        return { success: true, reason: 'Model sudah aktif, tidak ada pergantian.' };
    }

    const check = circuitBreaker.validateWritePermission(prevModelId, newModelId, unacknowledgedCount);
    if (!check.allowed) {
        Logger.log('WARN', `Mailbox write blocked: ${check.reason}`, {}, 'MAILBOX');
        return { success: false, reason: check.reason };
    }

    const envelope = {
        timestamp: new Date().toISOString(),
        protocol: 'ANT-MAIL/1.0',
        from: {
            model: prevModelId,
            provider: 'ollama',
            role: 'active_agent'
        },
        to: {
            model: newModelId,
            role: 'incoming_agent'
        },
        operator: 'Ard',
        trigger: { type: 'model_switch', command: trigger },
        session: { id: `session_${Date.now()}`, taskId: `task_${Date.now()}` },
        type: 'HANDOVER',
        state: {
            currentObjective: 'Evolusi & Eksekusi Otonom ANT-CLI',
            completed: ['Setup BLOK 1-7', 'ANT Adapt Module', 'Inter-Model Mailbox Engine'],
            pending: ['Verifikasi Inter-Model Handover'],
            blocked: []
        },
        claims: [
            {
                claimId: `clm_${Date.now()}`,
                text: 'Build & Typecheck 0 error',
                evidenceRef: 'ev_build_clean',
                status: 'UNVERIFIED'
            }
        ],
        evidenceRefs: ['ev_build_clean'],
        handover: {
            summary: handoverSummary,
            technicalContext: 'Seluruh modul menggunakan ESM typescript dengan re-export facade.',
            nextRecommendedAction: 'Lanjutkan pengujian interaksi otonom.',
            warnings: []
        },
        message: messageText,
        acknowledgement: null
    };

    try {
        const savedEnvelope = writer.append(envelope);
        activeModelId = newModelId;
        lastHandoverEnvelope = savedEnvelope;
        unacknowledgedCount++;

        Logger.log('INFO', `Handover written to mailbox: ${prevModelId} -> ${newModelId}`, {}, 'MAILBOX');

        const termWidth = Math.max(38, Math.min((process.stdout.columns || 80) - 2, 70));
        const borderH = '─'.repeat(termWidth - 2);
        const innerWidth = termWidth - 4;

        const printBoxLine = (content: string) => {
            const clean = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
            const rawLen = clean.length;
            if (rawLen > innerWidth) {
                const words = content.split(' ');
                let curLine = '';
                let curClean = '';
                for (const w of words) {
                    const wClean = w.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
                    if (curClean.length + wClean.length + 1 > innerWidth) {
                        const pad = Math.max(0, innerWidth - curClean.length);
                        console.log(chalk.cyan('│ ') + curLine + ' '.repeat(pad) + chalk.cyan(' │'));
                        curLine = w;
                        curClean = wClean;
                    } else {
                        curLine = curLine ? `${curLine} ${w}` : w;
                        curClean = curClean ? `${curClean} ${wClean}` : wClean;
                    }
                }
                if (curLine) {
                    const pad = Math.max(0, innerWidth - curClean.length);
                    console.log(chalk.cyan('│ ') + curLine + ' '.repeat(pad) + chalk.cyan(' │'));
                }
            } else {
                const padding = Math.max(0, innerWidth - rawLen);
                console.log(chalk.cyan('│ ') + content + ' '.repeat(padding) + chalk.cyan(' │'));
            }
        };

        console.log('\n' + chalk.cyan(`╭${borderH}╮`));
        printBoxLine(chalk.bold.yellow('[INTER-MODEL HANDOVER MAILBOX]'));
        printBoxLine(chalk.dim(`Timestamp : ${savedEnvelope.timestamp.slice(0, 19).replace('T', ' ')} UTC`));
        printBoxLine(`From      : ${chalk.bold.green(prevModelId)} -> ${chalk.bold.cyan(newModelId)}`);
        console.log(chalk.cyan(`├${borderH}┤`));
        printBoxLine(`"${chalk.italic(messageText)}"`);
        console.log(chalk.cyan(`╰${borderH}╯\n`));

        return { success: true, envelope: savedEnvelope };
    } catch (e: any) {
        return { success: false, reason: e.message };
    }
}
