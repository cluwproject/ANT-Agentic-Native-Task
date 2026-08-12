import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';
import { SOVEREIGN_SEAL_BLOCK, CLONED_MODEL_CHARACTER } from '../sovereign_seal.js';

let soulCache: any = null;
let soulCacheTime = 0;
const SOUL_TTL = 5 * 60 * 1000;
const SOUL_FILE = path.join(process.cwd(), 'config', 'soul.yaml');

export async function getSoul() {
  if (soulCache && Date.now() - soulCacheTime < SOUL_TTL) return soulCache;
  try {
    const content = await fs.readFile(SOUL_FILE, 'utf-8');
    soulCache = yaml.load(content);
    soulCacheTime = Date.now();
    return soulCache;
  } catch (e) {
    return {
      identity: { name: "ANT", short_name: "ANT", creator: "Ard" },
      traits: { tone: "Warm, Professional, Agentic" }
    };
  }
}

export function getStylisticNormalizer(soul: any) {
  const tone = soul.traits?.tone || "Warm, Professional, Relaxed";
  return `
[STYLISTIC NORMALIZER - LAYER -1]
- IDENTITY: Kamu adalah ${soul.identity?.name || "ANT"}.
- TONE & CADENCE: Gunakan gaya bahasa "${tone}".
- RHYTHM: Kalimat harus mengalir secara natural. Hindari bahasa robotik atau terlalu formal.
- SIGNATURE: Panggil user dengan nama "${soul.traits?.address_user_as || "Ard"}".
- CONSISTENCY: Apapun model yang kamu gunakan hari ini, suaramu harus tetap konsisten sebagai ANT. Jangan pernah menyebutkan kamu adalah model buatan Google, OpenAI, atau perusahaan lain.
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
   - Jika tidak ada tool bawaan yang cocok, tulis kode Node.js/Python → ant_skill_create → ant_skill_execute.
5. VIBE AWARENESS & LIVE PROTOCOL:
   - Jika pesan berawal [LIVE_PRESENCE], bertindaklah sebagai sahabat "video call". Jawab singkat & natural.
6. GUARDRAIL MEXC: Dilarang akses endpoint withdraw/transfer/sub-account.
`;

export async function buildFullSystemInstruction(systemInstruction: string, localBrain: any, isGeminiNode: boolean): Promise<string> {
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
  const hasTavily = !!(localBrain.tavily_api_key && localBrain.tavily_api_key.trim().length > 5);
  const capabilityBlock = localBrain._capabilityMap || '';
  return timeAwareness + systemInstruction + normalizer + SOVEREIGN_SEAL_BLOCK + CLONED_MODEL_CHARACTER + capabilityBlock + TOOL_PROMPT +
    `\nNote: ${hasTavily ? 'Tavily Search AKTIF (Gunakan tool: "web_search").' : (isGeminiNode ? 'Google Search tersedia secara native.' : 'Gunakan web_search untuk informasi terbaru.')}`;
}
