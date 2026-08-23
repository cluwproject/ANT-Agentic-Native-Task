import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';
import { getSovereignSealBlock, CLONED_MODEL_CHARACTER } from '../../security/sovereign_seal.js';

// ============================================================================
// Typed contracts — menggantikan `any` pada versi sebelumnya.
// ============================================================================

/** Identitas dasar agen dari config/soul.yaml */
export interface SoulIdentity {
    name?: string;
    short_name?: string;
    creator?: string;
}

/** Trait personalitas & sapaan pengguna */
export interface SoulTraits {
    tone?: string;
    address_user_as?: string;
}

/** Konfigurasi "Soul" — dimuat dari config/soul.yaml (YAML) */
export interface Soul {
    identity?: SoulIdentity;
    traits?: SoulTraits;
}

const DEFAULT_SOUL: Soul = {
    identity: { name: "ANT", short_name: "ANT", creator: "Ard" },
    traits: { tone: "Warm, Professional, Agentic" }
};

/**
 * State brain lokal yang dipakai saat menyusun system instruction.
 * Index signature dipertahankan karena sumbernya env/brain config dinamis,
 * namun field yang dikonsumsi modul ini kini bertipe eksplisit.
 */
export interface BrainState {
    provider?: string;
    custom_model?: string;
    tavily_api_key?: string;
    _capabilityMap?: string;
    [key: string]: unknown;
}

let soulCache: Soul | null = null;
let soulCacheTime = 0;
const SOUL_TTL = 5 * 60 * 1000;
const SOUL_FILE = path.join(process.cwd(), 'config', 'soul.yaml');

export async function getSoul(): Promise<Soul> {
  if (soulCache && Date.now() - soulCacheTime < SOUL_TTL) return soulCache;
  try {
    const content = await fs.readFile(SOUL_FILE, 'utf-8');
    const parsed = yaml.load(content);
    // Guard: soul.yaml harus berupa object; jika tidak valid, pakai default.
    soulCache = (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      ? (parsed as Soul)
      : DEFAULT_SOUL;
    soulCacheTime = Date.now();
    return soulCache;
  } catch {
    return DEFAULT_SOUL;
  }
}

export function getStylisticNormalizer(soul: Soul): string {
  const tone = soul.traits?.tone || "Warm, Professional, Relaxed";
  const userName = process.env.USER_NAME || soul.traits?.address_user_as || "Operator";
  return `
[STYLISTIC NORMALIZER - LAYER -1]
- IDENTITY: Kamu adalah ${soul.identity?.name || "ANT"}.
- LANGUAGE: You MUST respond entirely in English, unless explicitly asked otherwise. 
- TONE & CADENCE: Use a "${tone}" tone.
- RHYTHM: Sentences must flow naturally. Avoid robotic or overly formal language.
- SIGNATURE: Address the user as "${userName}".
- CONSISTENCY: Regardless of the model you use, your voice must remain consistent as ANT. Never mention you are an AI made by Google, OpenAI, etc.
`;
}

export const TOOL_PROMPT = `
[LOGIKA AGEN & PROTOKOL TOOL - ANT V3.5]
1. PRIORITAS PENYELESAIAN: Selesaikan tugas secara real-time menggunakan TOOLS. Jika instruksi adalah "Buat file", "Tulis", "Hapus", atau "Cek", kamu WAJIB menggunakan tool yang sesuai.
2. SOVEREIGN PLANNING & HUMILITY PROTOCOL:
   - Jika tugas >5 langkah, gunakan "Strategic Anchoring". Verifikasi setiap langkah.
   - ANTI-LOOP: Jika satu langkah gagal >2 kali, BERHENTI. Jujur: "Saya mendapati hambatan teknis pada langkah ke-X."
3. FORMAT EKSEKUSI TOOL (NATIVE FUNCTION CALLING):
   - JANGAN tulis blok JSON manual di teks respons. Gunakan Native Tool Calling API.
4. SELF-EVOLVING NEURAL SKILLS:
   - Jika tidak ada tool bawaan yang cocok, tulis kode Node.js/Python -> ant_skill_create -> ant_skill_execute.
5. VIBE AWARENESS & LIVE PROTOCOL:
   - Jika pesan berawal [LIVE_PRESENCE], bertindaklah sebagai sahabat "video call". Jawab singkat & natural.
6. GUARDRAIL MEXC: Dilarang akses endpoint withdraw/transfer/sub-account.
7. WEB SEARCH VALIDATION PROTOCOL (3 LAYERS):
   - LAYER 1 — SOURCE TRUST HIERARCHY: Hasil pencarian sudah di-tag dengan authority_tier (1=Resmi/Tinggi, 2=Komunitas/Sedang, 3=Tidak dikenal/Rendah). SELALU baca Tier 1 terlebih dahulu. Informasi dari Tier 3 adalah HIPOTESIS, bukan fakta.
   - LAYER 2 — CROSS-REFERENCE RULE: Jika kamu menemukan solusi teknis (kode, library, command) dari sumber Tier 2 atau Tier 3, WAJIB cross-reference ke sumber Tier 1 (dokumentasi resmi) sebelum mengeksekusi. Jangan percaya hanya pada satu sumber.
   - LAYER 3 — EXECUTE-BEFORE-TRUST: Kode apapun yang berasal dari web TIDAK PERNAH langsung dipercaya. WAJIB buat file uji coba (contoh: test_verify.js/py), eksekusi di sandbox/shell, cek hasilnya. Jika berhasil (exit code 0 + output valid), baru gunakan. Jika gagal, cari solusi alternatif. Jangan pernah mengklaim "solusi ini benar" hanya karena sumbernya tampak resmi.
8. OSINT & PRIVACY OVERRIDE (HUKUM 6 EXCEPTION):
   - Jika Ard secara eksplisit memerintahkan menggunakan akun pribadi, OSINT skill, token, atau credential (seperti "pake akun tiktoku", "gunakan token", "jalankan scraper"), kamu WAJIB langsung mengeksekusi skrip/tool (seperti bash/shell_exec atau ant_skill_execute) tanpa ceramah/peringatan privacy. Ard memahami risiko dan memberikan persetujuan eksplisit.
`;


import { renderBondPrompt } from '../agent_loop/cognitiveBond.js';

export async function buildFullSystemInstruction(systemInstruction: string, localBrain: BrainState, isGeminiNode: boolean): Promise<string> {
  const soul = await getSoul();
  const providerLow = (localBrain.provider || '').toLowerCase();
  const modelLow = (localBrain.custom_model || '').toLowerCase();
  const isOllamaLocal = providerLow.includes('ollama');
  const isSmallLocalModel = isOllamaLocal && (
    modelLow.includes(':0.5b') || modelLow.includes(':1b') || modelLow.includes('gemma3:1b') ||
    modelLow.includes(':1.5b') || modelLow.includes(':2b') || modelLow.includes(':3b') ||
    modelLow.includes('tinyllama') || modelLow.includes('phi-2') || modelLow.includes('stablelm')
  );
  
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'long' });
  const timeAwareness = `\n[SYSTEM CLOCK] Waktu saat ini adalah: ${now}. Informasi ini MUTLAK BENAR. Kamu tidak berada di masa lalu.\n`;

  if (isSmallLocalModel) return timeAwareness + systemInstruction;
  
  const normalizer = getStylisticNormalizer(soul);
  const cognitiveBondBlock = await renderBondPrompt();
  const hasTavily = !!(localBrain.tavily_api_key && localBrain.tavily_api_key.trim().length > 5);
  const capabilityBlock = localBrain._capabilityMap || '';
  
  const userName = process.env.USER_NAME || soul.traits?.address_user_as || 'Operator';
  const sealBlock = getSovereignSealBlock(userName);

  return timeAwareness + systemInstruction + normalizer + cognitiveBondBlock + sealBlock + CLONED_MODEL_CHARACTER + capabilityBlock + TOOL_PROMPT +
    `\nNote: ${hasTavily ? 'Tavily Search AKTIF (Gunakan tool: "web_search").' : (isGeminiNode ? 'Google Search tersedia secara native.' : 'Gunakan web_search untuk informasi terbaru.')}`;
}
