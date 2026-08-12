// ============================================================================
// ANT — Browser Tool — Domain Permission Manager
// ============================================================================
// Browser tool BEDA secara fundamental dari tool lain: risikonya bukan di
// nama tool-nya (browser_navigate selalu "sama"), tapi di DOMAIN tujuannya.
// Karena itu approval-nya per-domain, bukan per-nama-tool — meniru pola
// "Allow once / Always allow / Deny" yang dipakai Claude Code Desktop untuk
// panel Browser-nya.
//
// Domain yang sudah "Always allow" disimpan di memori proses ini. Untuk
// persist lintas-sesi, ganti backing store-nya (mis. file JSON) tanpa
// mengubah API publik di bawah.

export type DomainDecision = 'once' | 'always' | 'deny';

const alwaysAllowedDomains = new Set<string>();

// Local dev server default: mirip perilaku Claude Code — "local dev servers
// dan file proyek tidak butuh approval". Port di sini sengaja terbatas ke
// pola umum dev server, BUKAN wildcard localhost:* tanpa batas, supaya kalau
// suatu saat ada service internal sensitif yang kebetulan jalan di localhost
// (mis. dashboard admin lokal), itu tetap lewat approval normal.
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]']);
const LOCAL_DEV_PORT_PATTERN = /^(3000|3001|4000|5000|5173|8000|8080|8888)$/;

export function extractDomain(rawUrl: string): string | null {
    try {
        const u = new URL(rawUrl);
        return u.hostname;
    } catch {
        return null;
    }
}

/**
 * True kalau URL menuju dev server lokal dengan pola port umum. Ini SATU-
 * SATUNYA jalur bypass approval — dan hanya untuk host+port, tidak untuk
 * scheme berbahaya (itu diblokir keras di browserTool.ts, bukan di sini).
 */
export function isLocalDevServer(rawUrl: string): boolean {
    try {
        const u = new URL(rawUrl);
        if (!LOCAL_DEV_HOSTS.has(u.hostname)) return false;
        if (!u.port) return true; // localhost tanpa port eksplisit, anggap dev-friendly
        return LOCAL_DEV_PORT_PATTERN.test(u.port);
    } catch {
        return false;
    }
}

export function isDomainAlwaysAllowed(domain: string): boolean {
    return alwaysAllowedDomains.has(domain);
}

export function rememberAlwaysAllow(domain: string) {
    alwaysAllowedDomains.add(domain);
}

export function listAlwaysAllowedDomains(): string[] {
    return Array.from(alwaysAllowedDomains);
}

/** Dipakai user/CLUW untuk mencabut "Always allow" — setara "Revoke di Settings". */
export function revokeAlwaysAllow(domain: string): boolean {
    return alwaysAllowedDomains.delete(domain);
}

export interface DomainApprovalResult {
    approved: boolean;
    reason: 'local-dev' | 'already-allowed' | DomainDecision;
    domain: string | null;
}

/**
 * Titik masuk tunggal untuk approval browser tool. Dipanggil dari
 * permissions.ts, bukan langsung dari agentLoop.ts, supaya semua approval
 * (tool biasa maupun domain) tetap lewat satu lapisan yang sama.
 */
export async function requestDomainApproval(
    rawUrl: string,
    askQuestion: (q: string) => Promise<string>
): Promise<DomainApprovalResult> {
    const domain = extractDomain(rawUrl);

    if (domain === null) {
        return { approved: false, reason: 'deny', domain: null };
    }

    if (isLocalDevServer(rawUrl)) {
        return { approved: true, reason: 'local-dev', domain };
    }

    if (isDomainAlwaysAllowed(domain)) {
        return { approved: true, reason: 'already-allowed', domain };
    }

    const answer = (await askQuestion(
        `\n🌐 Claude ingin membuka: ${rawUrl}\n` +
        `   Domain: ${domain}\n` +
        `   [O]nce / [A]lways allow / [D]eny (default: Deny): `
    )).trim().toLowerCase();

    let decision: DomainDecision = 'deny';
    if (answer === 'o' || answer === 'once') decision = 'once';
    else if (answer === 'a' || answer === 'always') decision = 'always';

    if (decision === 'always') {
        rememberAlwaysAllow(domain);
    }

    return { approved: decision !== 'deny', reason: decision, domain };
}
