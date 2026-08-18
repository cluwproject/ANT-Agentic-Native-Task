// mailboxWriter.js
// v1.1 — patch: cross-process safe append via advisory file lock (fixes race
// condition dari audit: dua invocation CLI bisa baca prevHash sama sebelum
// salah satu selesai nulis, bikin hash chain korup).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withLock } from './fileLock.js';

const GENESIS_HASH = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Mengurutkan kunci objek secara rekursif untuk menghasilkan JSON kanonikal deterministik.
 * Memastikan hash bernilai identik meskipun properti diurutkan berbeda.
 */
export function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalize(item)).join(',') + ']';
  }
  const sortedKeys = Object.keys(obj).sort();
  const keyValues = sortedKeys.map(key => JSON.stringify(key) + ':' + canonicalize(obj[key]));
  return '{' + keyValues.join(',') + '}';
}

export class MailboxWriter {
  ledgerPath: string;
  lockPath: string;

  /**
   * @param {string} [workspaceRoot] Direktori kerja proyek (default: process.cwd())
   */
  constructor(workspaceRoot = process.cwd()) {
    this.ledgerPath = path.join(workspaceRoot, 'workspace', 'registry', 'mailbox', 'ledger.jsonl');
    this.lockPath = this.ledgerPath + '.lock';
    this.ensureDirectory();
  }

  ensureDirectory() {
    const dir = path.dirname(this.ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  getLastEntryHash() {
    if (!fs.existsSync(this.ledgerPath)) {
      return GENESIS_HASH;
    }

    const fileContent = fs.readFileSync(this.ledgerPath, 'utf-8').trim();
    if (!fileContent) {
      return GENESIS_HASH;
    }

    const lines = fileContent.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    if (!lastLine) {
      return GENESIS_HASH;
    }

    try {
      const parsed = JSON.parse(lastLine);
      return parsed.entryHash || GENESIS_HASH;
    } catch (err: any) {
      throw new Error(`[MailboxWriter] Ledger terdeteksi rusak pada baris terakhir: ${err.message}`);
    }
  }

  computeHash(prevHash: string, payload: any): string {
    const canonicalPayload = canonicalize(payload);
    const hashInput = prevHash + canonicalPayload;
    const hash = crypto.createHash('sha256').update(hashInput, 'utf-8').digest('hex');
    return `sha256:${hash}`;
  }

  /**
   * Menulis entri envelope baru ke ledger.jsonl. Seluruh operasi read-modify-write
   * (baca prevHash → hitung hash → append) dibungkus lock supaya atomik lintas proses.
   * @param {object} envelopeData
   * @returns {object} Envelope lengkap yang berhasil ditulis
   */
  append(envelopeData: any) {
    return withLock(this.lockPath, () => {
      const prevHash = this.getLastEntryHash();

      const fullEnvelope: any = { ...envelopeData, prevHash };
      const entryHash = this.computeHash(prevHash, fullEnvelope);
      fullEnvelope.entryHash = entryHash;

      fs.appendFileSync(this.ledgerPath, JSON.stringify(fullEnvelope) + '\n', 'utf-8');
      return fullEnvelope;
    });
  }

  /**
   * Verifikasi mandiri integritas seluruh rantai hash pada ledger.jsonl.
   * @returns {{ valid: boolean, totalEntries: number, failedAt?: number, reason?: string }}
   */
  verifyChainIntegrity() {
    if (!fs.existsSync(this.ledgerPath)) {
      return { valid: true, totalEntries: 0 };
    }

    const lines = fs.readFileSync(this.ledgerPath, 'utf-8').trim().split('\n').filter(Boolean);
    let expectedPrevHash = GENESIS_HASH;

    for (let i = 0; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]);
        const { entryHash, ...payloadWithoutEntryHash } = entry;

        if (entry.prevHash !== expectedPrevHash) {
          return {
            valid: false,
            totalEntries: lines.length,
            failedAt: i + 1,
            reason: `Diskrepansi prevHash pada entri #${i + 1}. Ekspektasi: ${expectedPrevHash}, Ditemukan: ${entry.prevHash}`,
          };
        }

        const recalculatedHash = this.computeHash(entry.prevHash, payloadWithoutEntryHash);
        if (recalculatedHash !== entryHash) {
          return {
            valid: false,
            totalEntries: lines.length,
            failedAt: i + 1,
            reason: `Korupsi/manipulasi payload pada entri #${i + 1}. Hash dihitung: ${recalculatedHash}, Recorded: ${entryHash}`,
          };
        }

        expectedPrevHash = entryHash;
      } catch (err: any) {
        return {
          valid: false,
          totalEntries: lines.length,
          failedAt: i + 1,
          reason: `Gagal membaca entri JSON pada baris #${i + 1}: ${err.message}`,
        };
      }
    }

    return { valid: true, totalEntries: lines.length };
  }
}
