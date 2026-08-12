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

        console.log('\n' + chalk.cyan('╭──────────────────────────────────────────────────────────╮'));
        console.log(chalk.cyan('│') + chalk.bold.yellow(' 📬 INTER-MODEL HANDOVER MAILBOX                          ') + chalk.cyan('│'));
        console.log(chalk.cyan('│') + chalk.dim(` Timestamp : ${savedEnvelope.timestamp.slice(0, 19).replace('T', ' ')} UTC`) + ' '.repeat(17) + chalk.cyan('│'));
        console.log(chalk.cyan('│') + ` From      : ${chalk.bold.green(prevModelId)} ──► To: ${chalk.bold.cyan(newModelId)}` + ' '.repeat(Math.max(0, 20 - prevModelId.length - newModelId.length)) + chalk.cyan('│'));
        console.log(chalk.cyan('├──────────────────────────────────────────────────────────┤'));
        console.log(chalk.cyan('│') + ` "${chalk.italic(messageText)}"` + chalk.cyan(''));
        console.log(chalk.cyan('╰──────────────────────────────────────────────────────────╯\n'));

        return { success: true, envelope: savedEnvelope };
    } catch (e: any) {
        return { success: false, reason: e.message };
    }
}
