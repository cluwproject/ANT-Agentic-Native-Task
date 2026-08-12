/**
 * scratchpad.ts
 * -------------
 * Memori eksternal untuk riset panjang. Terintegrasi dengan evidenceLedger.ts
 * agar `rawContentHash` yang diverifikasi adalah hash resmi dari sistem.
 */

import { getEvidence, listEvidence, EvidenceRecord } from './evidenceLedger.js';

export interface DistilledFact {
  summary: string;        // 1 paragraf ringkas, ini yang masuk ke context chat
  sourceUrl: string;
  rawContentHash: string; // referensi balik wajib — dari evidenceLedger
  evidenceId: string;     // ID [EVID:id] asli
}

export interface DistillationModel {
  summarize(rawContent: string, context: { sourceUrl: string }): Promise<string>;
}

export class Scratchpad {
  // Verifikasi hash langsung dengan mencocokkan di evidenceLedger
  verifyHashExists(hash: string): boolean {
    const allEvidence = listEvidence();
    for (const entry of allEvidence) {
      if (entry.resultHash === hash) return true;
    }
    return false;
  }
}

export async function distillEntry(
  evidenceId: string,
  model: DistillationModel
): Promise<DistilledFact | null> {
  const entry = getEvidence(evidenceId);
  if (!entry) return null;
  
  // Ambil URL dari args jika tersedia (biasanya ada di web_search atau read_url)
  const sourceUrl = entry.args?.url || entry.args?.query || 'system';
  
  const summary = await model.summarize(entry.resultPreview, { sourceUrl });
  
  return {
    summary,
    sourceUrl,
    rawContentHash: entry.resultHash, // Traceability mutlak ke hasil fetch aktual
    evidenceId: entry.id,
  };
}
