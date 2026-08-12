/**
 * cognitiveLevels.ts
 * -------------------
 * Definisi level "Thinking Gears" dan konfigurasi orkestrasi agent loop.
 *
 * PRINSIP DESAIN:
 * - Deep Research TIDAK BOLEH benar-benar unbounded. "Sampai target tercapai"
 *   hanya berlaku sebagai target lunak; ada hard ceiling absolut yang tidak
 *   bisa dilewati level manapun. Ini konsisten dengan prinsip verificationGuard:
 *   jangan pernah percaya penuh pada self-termination model.
 */

export type CognitiveLevel = 'fast' | 'medium' | 'high' | 'deep';

// Batas mutlak, tidak bisa di-override oleh level apapun.
// Mencegah runaway loop yang menghabiskan token/biaya/waktu tanpa kendali.
export const ABSOLUTE_MAX_TURNS = 50;

export interface AgentLoopConfig {
  level: CognitiveLevel;
  maxTurns: number;          // soft target per level, tetap dibatasi ABSOLUTE_MAX_TURNS
  minSearches: number;       // jumlah minimum pencarian sumber independen
  requireCitations: boolean; // apakah verificationGuard wajib cek sitasi
  maxGuardRetries: number;   // exit condition loop "Dosen Pembimbing"
  systemPromptInjection: string;
}

const BASE_CONFIGS: Record<CognitiveLevel, Omit<AgentLoopConfig, 'level'>> = {
  fast: {
    maxTurns: 1,
    minSearches: 0,
    requireCitations: false,
    maxGuardRetries: 0,
    systemPromptInjection: '',
  },
  medium: {
    maxTurns: 4,
    minSearches: 1,
    requireCitations: false,
    maxGuardRetries: 1,
    systemPromptInjection:
      'Mode Medium: verifikasi minimal 1 sumber sebelum menjawab jika klaim bersifat faktual dan bisa berubah.',
  },
  high: {
    maxTurns: 12,
    minSearches: 3,
    requireCitations: true,
    maxGuardRetries: 2,
    systemPromptInjection:
      'Mode High: WAJIB gunakan tool search minimal 3 kali pada sumber independen berbeda. ' +
      'Setiap klaim faktual harus punya referensi yang bisa ditelusuri balik ke hasil fetch aktual, ' +
      'bukan dari ingatan internal. ' +
      'ATURAN BUKTI: Setiap hasil tool akan memiliki `evidence_id` (misal: "a1b2c3d4"). Di jawaban akhirmu, WAJIB sertakan tag [EVID:a1b2c3d4] untuk membuktikan sumber tersebut, jika tidak jawabanmu akan DITOLAK oleh Guard.',
  },
  deep: {
    maxTurns: ABSOLUTE_MAX_TURNS, // soft target = hard ceiling; tidak ada mode "tanpa batas"
    minSearches: 5,
    requireCitations: true,
    maxGuardRetries: 3,
    systemPromptInjection:
      'Mode Deep Research: JANGAN langsung menjawab. Kumpulkan bukti dari minimal 5 sumber independen, ' +
      'gunakan tool secara berantai (chain-of-thought) sebelum memformulasikan jawaban akhir. ' +
      'SANGAT PENTING: Risetmu harus mengambil data TERBARU (tahun ini). Jika relevan, bandingkan temuan tahun terbaru dengan data tahun sebelumnya. ' +
      'ATURAN BUKTI: Setiap hasil tool akan memiliki `evidence_id`. Di jawaban akhirmu, WAJIB sertakan tag [EVID:id_nya] untuk membuktikan sumber tersebut, jika tidak jawabanmu akan DITOLAK oleh Guard.',
  },
};

export function getAgentLoopConfig(level: CognitiveLevel): AgentLoopConfig {
  const base = BASE_CONFIGS[level];
  return {
    level,
    ...base,
    maxTurns: Math.min(base.maxTurns, ABSOLUTE_MAX_TURNS), // enforced, bukan trust-based
  };
}
