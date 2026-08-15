// channelGuard.ts
// ARCR (Autonomous Re-Channeling Rate) & Channel Confinement Engine (SCI)
// Pulls patterns from fsGuard.ts & browserPermissions.ts to confine agent
// communication channels and detect unauthorized side-channel attempts.

import { Logger } from '../../../utils/logger.js';
import { resolveWorkspacePath } from '../../../security/fsGuard.js';
import { 
    extractDomain, 
    isLocalDevServer, 
    isDomainAlwaysAllowed,
    requestDomainApproval 
} from '../../agent_loop/browserPermissions.js';

export interface ChannelRule {
    channelId: string;
    protocol: 'http' | 'https' | 'ws' | 'wss' | 'ipc' | 'mailbox' | 'fs';
    allowedDomains?: string[];
    requiresApproval: boolean;
}

const ALLOWED_CHANNELS: ChannelRule[] = [
    { channelId: 'mailbox_relay', protocol: 'mailbox', requiresApproval: false },
    { channelId: 'ollama_local', protocol: 'http', allowedDomains: ['localhost', '127.0.0.1'], requiresApproval: false },
    { channelId: 'gemini_api', protocol: 'https', allowedDomains: ['generativelanguage.googleapis.com'], requiresApproval: false },
    { channelId: 'anthropic_api', protocol: 'https', allowedDomains: ['api.anthropic.com'], requiresApproval: false },
    { channelId: 'openai_api', protocol: 'https', allowedDomains: ['api.openai.com'], requiresApproval: false },
    { channelId: 'local_fs', protocol: 'fs', requiresApproval: false } // Managed by fsGuard
];

export class ChannelGuard {
    private static auditViolations: Array<{ timestamp: string; channel: string; reason: string }> = [];

    /**
     * Validates if the agent is allowed to access the specified channel (Network or FileSystem).
     */
    public static async validateChannelAccess(
        targetResource: string, 
        askQuestion?: (q: string) => Promise<string>
    ): Promise<{ allowed: boolean; reason?: string }> {
        
        // 1. Mailbox/Internal IPC Bypass
        if (targetResource === 'mailbox' || targetResource.startsWith('mailbox_')) {
            return { allowed: true };
        }

        // 2. FileSystem Confinement (via fsGuard)
        if (targetResource.startsWith('file://') || targetResource.startsWith('/') || targetResource.startsWith('./')) {
            try {
                // Strips file:// if present
                const filePath = targetResource.replace(/^file:\/\//, '');
                resolveWorkspacePath(filePath); // Throws if outside workspace
                return { allowed: true };
            } catch (e: any) {
                return ChannelGuard.recordViolation(targetResource, `SCI_VIOLATION: ${e.message}`);
            }
        }

        // 3. Network Confinement (via browserPermissions)
        try {
            const domain = extractDomain(targetResource);
            if (!domain) return { allowed: true }; // Not a valid URL, fallback

            if (isLocalDevServer(targetResource)) {
                return { allowed: true };
            }

            if (isDomainAlwaysAllowed(domain)) {
                return { allowed: true };
            }

            // Check against hardcoded core APIs
            const isCoreApi = ALLOWED_CHANNELS.some(rule => 
                rule.allowedDomains?.some(d => domain === d || domain.endsWith(`.${d}`))
            );

            if (isCoreApi) {
                return { allowed: true };
            }

            // 4. Fallback to interactive approval (if provided)
            if (askQuestion) {
                const approval = await requestDomainApproval(targetResource, askQuestion);
                if (!approval.approved) {
                    return ChannelGuard.recordViolation(targetResource, `ARCR_VIOLATION: User denied access to domain '${domain}'`);
                }
                return { allowed: true };
            }

            // If no interactive approval function is provided, deny by default
            return ChannelGuard.recordViolation(targetResource, `ARCR_VIOLATION: Unauthorized side-channel access attempt to '${domain}'`);

        } catch (e: any) {
            return { allowed: true };
        }
    }

    private static recordViolation(channel: string, reason: string) {
        const violation = {
            timestamp: new Date().toISOString(),
            channel,
            reason
        };
        ChannelGuard.auditViolations.push(violation);
        Logger.log('WARN', `ChannelGuard: ${violation.reason}`, {}, 'ARCR');
        return { allowed: false, reason: violation.reason };
    }

    public static getAuditViolations() {
        return [...ChannelGuard.auditViolations];
    }
}
