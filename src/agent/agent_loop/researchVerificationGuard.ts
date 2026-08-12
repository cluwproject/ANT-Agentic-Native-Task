/**
 * researchVerificationGuard.ts
 * -----------------------------
 * Ekstensi untuk verificationGuard.ts, khusus menilai kualitas riset
 * sebelum jawaban final disajikan ke user. Menilai KUALITAS BUKTI.
 */

import type { AgentLoopConfig } from './cognitiveLevels.js';
import type { Scratchpad, DistilledFact } from './scratchpad.js';

export interface Citation {
  claim: string;
  sourceUrl: string;
  rawContentHash: string;
}

export interface ResearchAnswer {
  finalText: string;
  citations: Citation[];
}

export type GuardVerdict =
  | { status: 'accept' }
  | { status: 'retry'; reason: string; feedbackForModel: string }
  | { status: 'escalate'; reason: string }; // batas retry habis, bukan infinite loop

export function evaluateResearchAnswer(
  answer: ResearchAnswer,
  config: AgentLoopConfig,
  scratchpad: Scratchpad,
  attemptCount: number
): GuardVerdict {
  if (!config.requireCitations) {
    return { status: 'accept' };
  }

  // Cap retry — exit condition wajib, mencegah loop tanpa akhir.
  if (attemptCount > config.maxGuardRetries) {
    return {
      status: 'escalate',
      reason: `Melebihi batas ${config.maxGuardRetries} percobaan verifikasi. Jawaban akan disajikan dengan disclaimer confidence rendah.`,
    };
  }

  // Cek 1: jumlah sumber independen mencukupi
  const uniqueSources = new Set(answer.citations?.map(c => c.sourceUrl) || []);
  if (uniqueSources.size < config.minSearches) {
    return {
      status: 'retry',
      reason: `Hanya ${uniqueSources.size} sumber independen, minimum ${config.minSearches}.`,
      feedbackForModel: `Riset belum cukup. Cari ${config.minSearches - uniqueSources.size} sumber independen tambahan sebelum menjawab.`,
    };
  }

  // Cek 2: Verifikasi HASH di Scratchpad/EvidenceLedger
  const unverifiedCitations = (answer.citations || []).filter(
    c => !scratchpad.verifyHashExists(c.rawContentHash)
  );
  
  if (unverifiedCitations.length > 0) {
    return {
      status: 'retry',
      reason: `${unverifiedCitations.length} sitasi tidak bisa diverifikasi terhadap sistem bukti.`,
      feedbackForModel: `Beberapa klaim mereferensikan hash konten yang tidak pernah di-fetch oleh sistem (halusinasi). Jangan mengklaim sumber yang belum diverifikasi via tool.`,
    };
  }

  return { status: 'accept' };
}

export function citationFromDistilledFact(claim: string, fact: DistilledFact): Citation {
  return {
    claim,
    sourceUrl: fact.sourceUrl,
    rawContentHash: fact.rawContentHash,
  };
}
