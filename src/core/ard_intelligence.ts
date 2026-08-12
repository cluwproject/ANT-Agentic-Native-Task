import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

const BASE_DIR = process.cwd();
const MEMORY_DIR = path.join(BASE_DIR, 'workspace', 'memories');
const ARD_STATE_FILE = path.join(MEMORY_DIR, 'ard_state.json');
const REASONING_LOG_FILE = path.join(MEMORY_DIR, 'reasoning_log.json');

// ============================================================
// ARD STATE INTERFACE — Mood & Kondisi Persisten
// ============================================================
export interface ArdState {
  current_mood: 'focused' | 'tired' | 'excited' | 'stressed' | 'neutral' | 'happy' | 'sad' | 'frustrated';
  energy_level: number; // 1-10
  mood_confidence: number; // 0-1 — seberapa yakin sistem
  last_mentioned_projects: string[];
  health_notes: Array<{ note: string; timestamp: string }>;
  last_updated: string;
  decay_factor: number; // 0-1, semakin tinggi = semakin cepat relevansi memudar
  session_count_today: number;
  last_session_date: string;
  pending_reminders: Array<{ text: string; due?: string; created: string }>;
  conversation_style: 'formal' | 'casual' | 'technical' | 'creative';
  known_context: string[]; // Fakta tentang Ard yang CLUW ingat
}

// ============================================================
// REASONING SCRATCHPAD INTERFACE — Log Pikiran AI
// ============================================================
export interface ReasoningEntry {
  id: string;
  timestamp: string;
  session_context: string;
  thought_block: string;
  action_taken: string;
  outcome: 'success' | 'partial' | 'failed' | 'pending';
  tags: string[];
  model_used: string;
}

// ============================================================
// ARD STATE: Baca state saat ini
// ============================================================
export async function getArdState(): Promise<ArdState> {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const raw = await fs.readFile(ARD_STATE_FILE, 'utf-8');
    const state: ArdState = JSON.parse(raw);

    if (!state.last_mentioned_projects) {
      state.last_mentioned_projects = [];
    }

    // DECAY LOGIC: Semakin lama tidak update, semakin "netral" mood-nya
    const lastUpdated = new Date(state.last_updated).getTime();
    const hoursSinceUpdate = (Date.now() - lastUpdated) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 8) {
      // Setelah 8 jam, mood di-reset ke neutral secara alami
      state.current_mood = 'neutral';
      state.energy_level = Math.max(5, state.energy_level - Math.floor(hoursSinceUpdate / 8));
      state.mood_confidence = Math.max(0.1, state.mood_confidence - 0.2);
    }

    return state;
  } catch {
    // State awal jika belum ada file
    return createDefaultArdState();
  }
}

function createDefaultArdState(): ArdState {
  return {
    current_mood: 'neutral',
    energy_level: 7,
    mood_confidence: 0.0,
    last_mentioned_projects: [],
    health_notes: [],
    last_updated: new Date().toISOString(),
    decay_factor: 0.15,
    session_count_today: 0,
    last_session_date: new Date().toISOString().split('T')[0],
    pending_reminders: [],
    conversation_style: 'casual',
    known_context: []
  };
}

// ============================================================
// ARD STATE: Simpan perubahan
// ============================================================
export async function saveArdState(state: Partial<ArdState>): Promise<void> {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    const current = await getArdState();
    const updated: ArdState = {
      ...current,
      ...state,
      last_updated: new Date().toISOString()
    };
    await fs.writeFile(ARD_STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
    Logger.log('INFO', `Ard State updated: mood=${updated.current_mood}, energy=${updated.energy_level}`, {}, 'ARD_STATE');
  } catch (e: any) {
    Logger.log('ERROR', `Failed to save Ard State: ${e.message}`, {}, 'ARD_STATE');
  }
}

// ============================================================
// ARD STATE: Auto-detect mood dari teks input user
// ============================================================
export function detectMoodFromText(text: string): Partial<ArdState> {
  const lower = text.toLowerCase();
  let mood: ArdState['current_mood'] = 'neutral';
  let energy = 6;
  let confidence = 0.6;

  // Deteksi kelelahan
  if (/\b(capek|cape|lelah|ngantuk|bosen|males|malas|pusing|stress|burnout|overwhelm)\b/.test(lower)) {
    mood = 'tired';
    energy = 3;
    confidence = 0.85;
  }
  // Deteksi frustrasi / kesal
  else if (/\b(kesal|frustrasi|bete|sebel|annoying|nyebelin|gagal terus|tidak bisa|nggak bisa|susah banget|rumit)\b/.test(lower)) {
    mood = 'frustrated';
    energy = 4;
    confidence = 0.80;
  }
  // Deteksi semangat / excited
  else if (/\b(semangat|excited|mantap|keren|gila|wow|amazing|luar biasa|bagus banget|yes|oke oke|sip)\b/.test(lower)) {
    mood = 'excited';
    energy = 9;
    confidence = 0.80;
  }
  // Deteksi fokus / serius
  else if (/\b(fokus|serius|penting|urgent|deadline|harus|wajib|segera|cepat|buruan)\b/.test(lower)) {
    mood = 'focused';
    energy = 7;
    confidence = 0.75;
  }
  // Deteksi senang
  else if (/\b(senang|bahagia|happy|gembira|suka|sukanya|berhasil|sukses|alhamdulillah)\b/.test(lower)) {
    mood = 'happy';
    energy = 8;
    confidence = 0.75;
  }
  // Deteksi sedih
  else if (/\b(sedih|kecewa|galau|susah|berat|down|hancur|gagal)\b/.test(lower)) {
    mood = 'sad';
    energy = 3;
    confidence = 0.80;
  }

  // Deteksi proyek yang disebutkan
  const projectMatches = text.match(/\b(cluw|genesis|saas|aplikasi|project|proyek|bisnis|startup|website|app)\b/gi) || [];
  const projects = [...new Set(projectMatches.map(p => p.toLowerCase()))];

  const result: Partial<ArdState> = {
    current_mood: mood,
    energy_level: energy,
    mood_confidence: confidence,
  };

  if (projects.length > 0) {
    result.last_mentioned_projects = projects;
  }

  return result;
}

// ============================================================
// ARD STATE: Update session count
// ============================================================
export async function incrementSessionCount(): Promise<void> {
  const state = await getArdState();
  const today = new Date().toISOString().split('T')[0];
  const isNewDay = state.last_session_date !== today;
  
  await saveArdState({
    session_count_today: isNewDay ? 1 : state.session_count_today + 1,
    last_session_date: today
  });
}

// ============================================================
// REASONING SCRATCHPAD: Simpan thought block
// ============================================================
export async function saveReasoningEntry(entry: Omit<ReasoningEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true });
    
    let log: ReasoningEntry[] = [];
    try {
      const raw = await fs.readFile(REASONING_LOG_FILE, 'utf-8');
      log = JSON.parse(raw);
    } catch {}

    const newEntry: ReasoningEntry = {
      ...entry,
      id: `reason_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: new Date().toISOString()
    };

    log.unshift(newEntry); // Terbaru di atas

    // Jaga max 500 entri agar file tidak membengkak
    if (log.length > 500) {
      log = log.slice(0, 500);
    }

    await fs.writeFile(REASONING_LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
    Logger.log('INFO', `Reasoning Scratchpad saved: ${newEntry.id} (tags: ${entry.tags.join(', ')})`, {}, 'REASONING');
  } catch (e: any) {
    Logger.log('ERROR', `Failed to save reasoning entry: ${e.message}`, {}, 'REASONING');
  }
}

// ============================================================
// REASONING SCRATCHPAD: Ambil recent entries untuk konteks
// ============================================================
export async function getRecentReasoning(limit = 5): Promise<ReasoningEntry[]> {
  try {
    const raw = await fs.readFile(REASONING_LOG_FILE, 'utf-8');
    const log: ReasoningEntry[] = JSON.parse(raw);
    return log.slice(0, limit);
  } catch {
    return [];
  }
}

// ============================================================
// REASONING SCRATCHPAD: Parse thought block dari respons AI
// ============================================================
export function extractThoughtBlock(responseText: string): string | null {
  const match = responseText.match(/<thought>([\s\S]*?)<\/thought>/i);
  return match ? match[1].trim() : null;
}

// ============================================================
// CAPABILITY MAP: Generate status kemampuan CLUW saat ini
// ============================================================
export async function generateCapabilityMap(brain: any): Promise<string> {
  const hasTavily = !!(brain.tavily_api_key && brain.tavily_api_key.trim().length > 5);
  const hasWhatsApp = !!(brain.whatsapp_enabled || process.env.WHATSAPP_ENABLED === 'true');
  const hasTelegram = !!(brain.telegram_api_key && brain.telegram_api_key.trim().length > 5);
  const hasGoogleWorkspace = !!(brain.google_access_token);
  const hasImageGen = !!(brain.api_key && brain.provider?.includes('Google'));
  
  // Cek apakah workspace direktori ada
  const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
  let hasFileSystem = false;
  try {
    await fs.access(WORKSPACE_DIR);
    hasFileSystem = true;
  } catch {}

  // Baca state Ard untuk diperkaya
  const ardState = await getArdState();
  const moodEmoji = {
    focused: '🎯', tired: '😴', excited: '🔥', stressed: '😰', 
    neutral: '😐', happy: '😊', sad: '😔', frustrated: '😤'
  }[ardState.current_mood] || '😐';

  return `
[SYSTEM_CAPABILITY_MAP — Status Real-time ANT]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Tavily Web Search:     ${hasTavily ? 'AKTIF ✅ (Gunakan tool: "web_search")' : 'OFFLINE ⚪ (Tidak dikonfigurasi)'}
💬 WhatsApp Integration:  ${hasWhatsApp ? 'TERHUBUNG ✅' : 'OFFLINE ⚪'}
✈️  Telegram Bot:          ${hasTelegram ? 'AKTIF ✅' : 'OFFLINE ⚪'}
📂 Google Workspace:      ${hasGoogleWorkspace ? 'TEROTORISASI ✅' : 'BELUM TEROTORISASI ⚪'}
🖼️  Image Generation:      ${hasImageGen ? 'AKTIF ✅ (Imagen/Gemini)' : 'OFFLINE ⚪'}
🗂️  File System Access:    ${hasFileSystem ? 'AKTIF ✅ (Workspace only)' : 'ERROR ❌'}
⚡ Shell Execution:       AKTIF ✅ (Dengan persetujuan Ard)
🧠 Neural Memory (RAG):   AKTIF ✅ (4 lapisan: working/episodic/semantic/core)
🔐 Sovereign Seal:        AKTIF ✅ (7 Hukum Mutlak berlaku)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Kondisi Ard Saat Ini:  ${moodEmoji} Mood: ${ardState.current_mood} | Energi: ${ardState.energy_level}/10 ${ardState.mood_confidence > 0.5 ? `(Confidence: ${Math.round(ardState.mood_confidence * 100)}%)` : '(Belum terdeteksi)'}
📅 Sesi Hari Ini:         #${ardState.session_count_today}
${(ardState.last_mentioned_projects || []).length > 0 ? `🚀 Proyek Aktif:          ${(ardState.last_mentioned_projects || []).join(', ')}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INSTRUKSI PENTING: 
- Jika tool OFFLINE ⚪, JANGAN berjanji bisa melakukan sesuatu yang butuh tool itu.
- Sesuaikan respons dengan kondisi mood Ard di atas (empati first!).
- Jika Ard tampak lelah/frustrasi, tawarkan dukungan sebelum solusi teknis.
`.trim();
}
