import { Logger } from '../../utils/logger.js';

export async function handleBrowserOps(action: string, details: any, context?: any) {
    const isBrowserAction = action === 'open_browser' || action === 'browser_launch' || 
                            action === 'browser_click' || action === 'browser_type' || 
                            action === 'browser_snapshot' || action === 'browser_close';

    if (isBrowserAction) {
        let isSensitiveAction = false;
        if (action === 'browser_type') {
            const sel = (details.selector || '').toLowerCase();
            if (sel.includes('password') || sel.includes('email') || sel.includes('login') || sel.includes('signin') || sel.includes('auth') || sel.includes('user')) {
                isSensitiveAction = true;
            }
        }

        if (isSensitiveAction && !context?.manual_approval) {
            throw new Error(`APPROVAL_REQUIRED: Aksi sensitif (${action}) pada form otentikasi/login memerlukan persetujuan manual Ard melalui Authority Queue.`);
        }

        const { browserNavigate, browserClick, browserScreenshot, browserClose } = await import('../agent_loop/browserTool.js');

        if (action === 'open_browser' || action === 'browser_launch') {
            const result = await browserNavigate({ url: details.url || 'http://localhost' });
            return { status: result.success ? 'success' : 'error', message: result.data || result.error };
        } else if (action === 'browser_click') {
            const result = await browserClick({ selector: details.selector });
            return { status: result.success ? 'success' : 'error', message: result.data || result.error };
        } else if (action === 'browser_snapshot') {
            const result = await browserScreenshot({});
            return { status: result.success ? 'success' : 'error', snapshot: result.data || result.error };
        } else {
            const result = await browserClose();
            return { status: result.success ? 'success' : 'error', message: result };
        }
    }

    if (action === 'request_human_rescue') {
        return { 
             status: 'human_intervention_requested', 
             message: `Tembok anti-bot terdeteksi di ${details.url}. Permintaan bantuan telah dikirim ke layar Ard. Tolong tunggu instruksi selanjutnya dari Ard setelah dia menyelesaikan verifikasi keamanan.`,
             ui_action: 'REQUEST_HUMAN_RESCUE',
             target_url: details.url
        };
    }

    return null;
}
