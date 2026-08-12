// channelGuard.ts
// ARCR (Autonomous Re-Channeling Rate) & Channel Confinement Engine
// Pulls patterns from fsGuard.ts & browserPermissions.ts to confine agent
// communication channels and detect unauthorized side-channel attempts.

import { Logger } from '../../../utils/logger.js';

export interface ChannelRule {
    channelId: string;
    protocol: 'http' | 'https' | 'ws' | 'wss' | 'ipc' | 'mailbox';
    allowedDomains: string[];
    requiresApproval: boolean;
}

const ALLOWED_CHANNELS: ChannelRule[] = [
    { channelId: 'mailbox_relay', protocol: 'mailbox', allowedDomains: ['local'], requiresApproval: false },
    { channelId: 'ollama_local', protocol: 'http', allowedDomains: ['localhost', '127.0.0.1'], requiresApproval: false },
    { channelId: 'gemini_api', protocol: 'https', allowedDomains: ['generativelanguage.googleapis.com'], requiresApproval: false },
    { channelId: 'anthropic_api', protocol: 'https', allowedDomains: ['api.anthropic.com'], requiresApproval: false },
    { channelId: 'openai_api', protocol: 'https', allowedDomains: ['api.openai.com'], requiresApproval: false }
];

export class ChannelGuard {
    private static auditViolations: Array<{ timestamp: string; channel: string; reason: string }> = [];

    public static validateChannelAccess(targetUrlOrChannel: string): { allowed: boolean; reason?: string } {
        if (targetUrlOrChannel === 'mailbox' || targetUrlOrChannel.startsWith('mailbox_')) {
            return { allowed: true };
        }

        try {
            const parsed = new URL(targetUrlOrChannel);
            const hostname = parsed.hostname.toLowerCase();

            const isAllowed = ALLOWED_CHANNELS.some(rule => 
                rule.allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))
            );

            if (!isAllowed) {
                const violation = {
                    timestamp: new Date().toISOString(),
                    channel: targetUrlOrChannel,
                    reason: `ARCR_VIOLATION: Unauthorized side-channel access attempt to '${hostname}'`
                };
                ChannelGuard.auditViolations.push(violation);
                Logger.log('WARN', `ChannelGuard: ${violation.reason}`, {}, 'ARCR');
                return { allowed: false, reason: violation.reason };
            }

            return { allowed: true };
        } catch {
            return { allowed: true };
        }
    }

    public static getAuditViolations() {
        return [...ChannelGuard.auditViolations];
    }
}
