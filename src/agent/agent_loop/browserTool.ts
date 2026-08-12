// ============================================================================
// ANT — Browser Tool — Playwright Driver
// ============================================================================
// CATATAN ARSITEKTUR:
// ANT adalah CLI/Node process, bukan Electron app — jadi tidak ada
// "jendela browser" GUI seperti panel Browser di Claude Code Desktop. Yang
// dibangun di sini adalah padanan fungsionalnya: Claude (lewat CLUW) bisa
// menyuruh Chromium (headless atau headed) navigate/klik/screenshot sebuah
// halaman, dengan model keamanan yang setara — profil bersih per sesi,
// approval per-domain, dan bukti (screenshot) yang hash-nya dihitung dari
// byte gambar asli, bukan diklaim oleh model.
//
// DEPENDENSI: `npm install playwright` lalu `npx playwright install chromium`
// di lingkungan Anda sendiri. Sandbox tempat saya menulis kode ini tidak
// punya akses ke domain unduhan binary Chromium Playwright, jadi saya TIDAK
// bisa menjalankan browser sungguhan di sini untuk menguji end-to-end — yang
// sudah saya uji hanya logika murni (validasi scheme URL, ekstraksi domain,
// hashing evidence dari Buffer). Sebelum dipakai produksi, jalankan sendiri
// smoke test navigate+screenshot sederhana di mesin Anda.
//
// KEPUTUSAN KEAMANAN PENTING:
//   1. Hanya scheme http/https yang diizinkan. file://, chrome://,
//      javascript:, data: diblokir KERAS di sini — bukan lewat approval
//      user, karena scheme itu sendiri berbahaya (mis. file:// bisa
//      membaca filesystem lokal lewat "browser", memotong sandbox tool lain).
//   2. Setiap sesi browser pakai context baru (profil bersih) secara default.
//      Persist session adalah opt-in eksplisit, bukan default.
//   3. Screenshot di-hash dari byte PNG asli (lihat evidenceLedger.ts yang
//      sudah diperbarui untuk menerima Buffer), bukan dari deskripsi teks.

import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { recordEvidence } from './evidenceLedger.js';
import type { EvidenceRecord } from './evidenceLedger.js';

// Import lazy supaya modul ini tidak error di-load kalau 'playwright' belum
// terinstal — error baru muncul saat browser tool benar-benar dipanggil,
// dengan pesan yang jelas, bukan crash saat import.
type PlaywrightModule = typeof import('playwright');
let playwrightModule: PlaywrightModule | null = null;
async function loadPlaywright(): Promise<PlaywrightModule> {
    if (playwrightModule) return playwrightModule;
    try {
        playwrightModule = await import('playwright');
        return playwrightModule;
    } catch {
        throw new Error(
            "Package 'playwright' belum terinstal. Jalankan: npm install playwright && npx playwright install chromium"
        );
    }
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);
const SCREENSHOT_DIR = join('workspace', 'reports', 'screenshots');

export interface BrowserActionResult {
    success: boolean;
    data?: any;
    evidence?: EvidenceRecord;
    error?: string;
}

/** Validasi keras scheme URL. Dipanggil SEBELUM approval domain, bukan sesudahnya. */
export function assertSafeUrl(rawUrl: string): { ok: boolean; reason?: string } {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return { ok: false, reason: `URL tidak valid: ${rawUrl}` };
    }
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        return { ok: false, reason: `Scheme '${parsed.protocol}' tidak diizinkan. Hanya http/https.` };
    }
    return { ok: true };
}

// Satu browser instance dipakai ulang antar-panggilan dalam proses yang
// sama (mahal untuk launch tiap kali). Context baru dibuat per-navigasi
// KECUALI persistSession=true, sesuai prinsip "profil bersih by default".
let sharedBrowser: import('playwright').Browser | null = null;

async function getBrowser() {
    if (sharedBrowser) return sharedBrowser;
    const { chromium } = await loadPlaywright();
    sharedBrowser = await chromium.launch({ headless: true });
    return sharedBrowser;
}

let persistentContext: import('playwright').BrowserContext | null = null;
let currentPage: import('playwright').Page | null = null;

async function getPage(persistSession: boolean) {
    const browser = await getBrowser();

    if (persistSession) {
        if (!persistentContext) {
            persistentContext = await browser.newContext();
        }
        if (!currentPage || currentPage.isClosed()) {
            currentPage = await persistentContext.newPage();
        }
        return currentPage;
    }

    // Mode default: context baru setiap navigate → profil selalu bersih.
    const context = await browser.newContext();
    return context.newPage();
}

export async function browserNavigate(args: { url: string; persistSession?: boolean }): Promise<BrowserActionResult> {
    const safe = assertSafeUrl(args.url);
    if (!safe.ok) {
        return { success: false, error: safe.reason };
    }

    try {
        const page = await getPage(!!args.persistSession);
        const response = await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const title = await page.title();
        
        // --- HUMAN-IN-THE-LOOP BOT DETECTOR ---
        const isCloudflare = title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('attention required');
        const hasCaptcha = await page.evaluate(() => {
            return document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[src*="hcaptcha"]').length > 0;
        });
        
        if (isCloudflare || hasCaptcha) {
             return { success: false, error: 'BOT_WALL_DETECTED: Terdeteksi proteksi anti-bot/CAPTCHA. Sistem tertahan. Panggil tool "request_human_rescue" untuk meminta bantuan Ard membuka blokir ini secara manual.' };
        }
        
        const result = {
            url: args.url,
            finalUrl: page.url(),
            title,
            statusCode: response?.status() ?? null
        };
        const evidence = recordEvidence('browser_navigate', args, result);
        return { success: true, data: result, evidence };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function browserClick(args: { selector: string; persistSession?: boolean }): Promise<BrowserActionResult> {
    try {
        const page = await getPage(!!args.persistSession);
        await page.click(args.selector, { timeout: 10000 });
        const result = { selector: args.selector, clickedUrl: page.url() };
        const evidence = recordEvidence('browser_click', args, result);
        return { success: true, data: result, evidence };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function browserGetText(args: { selector?: string; persistSession?: boolean }): Promise<BrowserActionResult> {
    try {
        const page = await getPage(!!args.persistSession);
        const text = args.selector
            ? await page.locator(args.selector).innerText()
            : await page.locator('body').innerText();
        const result = { selector: args.selector ?? 'body', text: text.slice(0, 10000) };
        const evidence = recordEvidence('browser_get_text', args, result);
        return { success: true, data: result, evidence };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Screenshot: hash dihitung dari BYTE PNG ASLI (lewat overload Buffer di
 * recordEvidence), bukan dari deskripsi teks tentang gambar. Ini yang
 * langsung menutup celah "screenshot dengan metadata karangan" dari insiden
 * sebelumnya — kalau file-nya tidak benar-benar dibuat, tidak akan pernah
 * ada evidence record untuk itu.
 */
export async function browserScreenshot(args: { persistSession?: boolean }): Promise<BrowserActionResult> {
    try {
        const page = await getPage(!!args.persistSession);
        const buffer = await page.screenshot({ type: 'png' });

        mkdirSync(SCREENSHOT_DIR, { recursive: true });
        const hashPrefix = createHash('sha256').update(buffer).digest('hex').slice(0, 12);
        const filename = `${Date.now()}-${hashPrefix}.png`;
        const filePath = join(SCREENSHOT_DIR, filename);
        writeFileSync(filePath, buffer);

        const evidence = recordEvidence('browser_screenshot', args, buffer);
        const result = { path: filePath, sizeBytes: buffer.length };
        return { success: true, data: result, evidence };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function browserClose(): Promise<BrowserActionResult> {
    try {
        if (currentPage && !currentPage.isClosed()) await currentPage.close();
        if (persistentContext) await persistentContext.close();
        if (sharedBrowser) await sharedBrowser.close();
        persistentContext = null;
        currentPage = null;
        sharedBrowser = null;
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const BROWSER_TOOL_NAMES = [
    'browser_navigate',
    'browser_click',
    'browser_get_text',
    'browser_screenshot',
    'browser_close'
] as const;

export function isBrowserTool(toolName: string): boolean {
    return (BROWSER_TOOL_NAMES as readonly string[]).includes(toolName);
}

/** Dispatcher tunggal dipanggil dari agentLoop.ts untuk semua browser_* tool. */
export async function executeBrowserAction(tool: string, args: Record<string, any>): Promise<BrowserActionResult> {
    switch (tool) {
        case 'browser_navigate': return browserNavigate(args as any);
        case 'browser_click': return browserClick(args as any);
        case 'browser_get_text': return browserGetText(args as any);
        case 'browser_screenshot': return browserScreenshot(args as any);
        case 'browser_close': return browserClose();
        default: return { success: false, error: `Tool browser tidak dikenal: ${tool}` };
    }
}

export async function fallbackWebSearch(query: string): Promise<any> {
    try {
        const page = await getPage(false);
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const title = await page.title();
        const isCloudflare = title.toLowerCase().includes('just a moment') || title.toLowerCase().includes('attention required');
        
        if (isCloudflare) {
             return { fallback_error: 'BOT_WALL_DETECTED', url: searchUrl };
        }
        
        const results = await page.evaluate(() => {
            const nodes = Array.from(document.querySelectorAll('.result'));
            return nodes.map(n => {
                const titleEl = n.querySelector('.result__title');
                const snippetEl = n.querySelector('.result__snippet');
                const urlEl = n.querySelector('.result__url');
                return {
                    title: titleEl ? (titleEl as HTMLElement).innerText.trim() : '',
                    content: snippetEl ? (snippetEl as HTMLElement).innerText.trim() : '',
                    url: urlEl ? (urlEl as HTMLElement).innerText.trim() : ''
                };
            }).slice(0, 5);
        });
        
        return { results };
    } catch (e: any) {
        return { fallback_error: e.message };
    }
}
