import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';
import { getSovereignSealBlock, CLONED_MODEL_CHARACTER } from '../sovereign_seal.js';

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

import { antToolsSchema } from '../tools_schema.js';

export function getFormattedToolCatalog(): string {
  const categories: Record<string, string[]> = {
    'FILESYSTEM & WORKSPACE': ['read_file', 'create_file', 'create_dir', 'modify_file', 'write_file', 'edit_file', 'patch_file', 'delete_file', 'list_dir', 'grep_search'],
    'GIT DEDICATED TOOLS': ['git_checkpoint', 'git_status', 'git_diff', 'git_log'],
    'SHELL & CODE VERIFICATION': ['shell_exec', 'run_tests', 'syntax_check', 'execute_js', 'env_check'],
    'WEB EXTRACTION & BROWSER': ['web_search', 'fetch_url_content', 'open_browser', 'browser_click', 'browser_type', 'browser_snapshot', 'browser_close'],
    'DYNAMIC SKILLS & RESCUE': ['ant_skill_create', 'ant_skill_execute', 'ant_skill_list', 'request_human_rescue']
  };

  let catalog = `\n[ARSENAL TOOLS NATIVE RESMI ANT — DEDICATED TOOLS]\n`;
  for (const [cat, tools] of Object.entries(categories)) {
    catalog += `\n* ${cat}:\n`;
    for (const toolName of tools) {
      const def = antToolsSchema.find(t => t.name === toolName);
      if (def) {
        catalog += `  - ${def.name}: ${def.description}\n`;
      }
    }
  }
  catalog += `\nATURAN EKSEKUSI:\n- Gunakan dedicated tool 'git_*' (seperti git_status, git_diff, git_checkpoint) untuk operasi Git.\n- Gunakan 'syntax_check' untuk validasi kode (TypeScript/Node) tanpa harus menjalankan shell.\n- Gunakan 'patch_file' untuk partial unified diff edit file.\n`;
  return catalog;
}

export function getToolPrompt(userName: string = 'Operator'): string {
  const catalog = getFormattedToolCatalog();
  return `
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
   - Jika ${userName} secara eksplisit memerintahkan menggunakan akun pribadi, OSINT skill, token, atau credential (seperti "pake akun tiktoku", "gunakan token", "jalankan scraper"), kamu WAJIB langsung mengeksekusi skrip/tool (seperti bash/shell_exec atau ant_skill_execute) tanpa ceramah/peringatan privacy. ${userName} memahami risiko dan memberikan persetujuan eksplisit.
${catalog}
`;
}


import { renderBondPrompt } from '../agent_loop/cognitiveBond.js';

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
  const cognitiveBondBlock = await renderBondPrompt();
  const hasTavily = !!(localBrain.tavily_api_key && localBrain.tavily_api_key.trim().length > 5);
  const capabilityBlock = localBrain._capabilityMap || '';
  
  const userName = process.env.USER_NAME || soul.traits?.address_user_as || 'Operator';
  const sealBlock = getSovereignSealBlock(userName);

  const toolPromptBlock = getToolPrompt(userName);

  return timeAwareness + systemInstruction + normalizer + cognitiveBondBlock + sealBlock + CLONED_MODEL_CHARACTER + capabilityBlock + toolPromptBlock +
    `\nNote: ${hasTavily ? 'Tavily Search AKTIF (Gunakan tool: "web_search").' : (isGeminiNode ? 'Google Search tersedia secara native.' : 'Gunakan web_search untuk informasi terbaru.')}`;
}
