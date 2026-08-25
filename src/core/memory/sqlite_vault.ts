/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  ANT SQLite Local Vault — ADR-001 Implementation
 *  Sprint 2 of 5 — Sovereign Runtime Era
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  Menggantikan JSON file vault dengan SQLite + WAL mode.
 *  Menggunakan node:sqlite built-in (Node v22+) — ZERO dependency baru.
 *  Interface publik 100% identik dengan memory.ts sehingga tidak ada
 *  breaking change di seluruh codebase.
 *
 *  Fitur:
 *  - WAL mode: performa tulis concurrent, aman untuk multi-session
 *  - Auto-migration: baca JSON lama → INSERT ke SQLite saat boot pertama
 *  - Tabel leases: siap untuk Sprint 5 (Distributed Lease Lock)
 *  - Cosine similarity: tetap berjalan via in-process calculation
 *  - Offline-first: tidak butuh koneksi apapun, sempurna untuk Termux
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Logger } from '../../utils/logger.js';

// ── Tipe Memory ──────────────────────────────────────────────────────
export type MemoryLayer = 'working' | 'episodic' | 'semantic' | 'core';

export interface VaultEntry {
  id: string;
  layer: MemoryLayer;
  content: string;         // JSON-stringified data
  embedding?: number[];    // 768-dim float array (opsional)
  score: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

// ── Path Konstanta ───────────────────────────────────────────────────
const BASE_DIR = process.cwd();
const MEMORY_DIR = path.join(BASE_DIR, 'workspace', 'memories');
// Override path DB via env (dipakai test isolation & deployment kustom).
// Default tetap workspace/memories/ant_vault.db.
const VAULT_DB   = process.env.ANT_SQLITE_DB_PATH
  ? path.resolve(process.env.ANT_SQLITE_DB_PATH)
  : path.join(MEMORY_DIR, 'ant_vault.db');
const DB_DIR     = path.dirname(VAULT_DB);

// ── Singleton Database ───────────────────────────────────────────────
let _db: any = null;
let _initPromise: Promise<void> | null = null;

/**
 * Inisialisasi SQLite vault — hanya berjalan sekali (singleton).
 * Aman dipanggil berulang kali.
 */
export async function initSQLiteVault(): Promise<void> {
  if (_db) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    await fs.mkdir(DB_DIR, { recursive: true });

    // Gunakan node:sqlite built-in (Node v22.5.0+)
    const { DatabaseSync } = await import('node:sqlite' as any);
    _db = new DatabaseSync(VAULT_DB);

    // ── Pragma performa & keamanan ───────────────────────────────────
    _db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous  = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA temp_store   = MEMORY;
    `);

    // ── Schema Memori ─────────────────────────────────────────────────
    _db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id          TEXT    PRIMARY KEY,
        layer       TEXT    NOT NULL CHECK(layer IN ('working','episodic','semantic','core')),
        content     TEXT    NOT NULL,
        embedding   BLOB,
        score       REAL    NOT NULL DEFAULT 0.0,
        tags        TEXT    NOT NULL DEFAULT '[]',
        created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
      CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at DESC);
    `);

    // ── Schema Lease Lock (Sprint 5) ──────────────────────────────────
    _db.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        resource_id    TEXT PRIMARY KEY,
        holder_session TEXT NOT NULL,
        expires_at     TEXT NOT NULL,
        pid            INTEGER,
        created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    Logger.log('INFO', `[SQLiteVault] Vault initialized: ${VAULT_DB}`, {}, 'MEMORY');

    // ── Auto-migrasi dari JSON lama ───────────────────────────────────
    await migrateFromJSON();
  })();

  return _initPromise;
}

/**
 * Migrasi one-shot dari vault JSON lama ke SQLite.
 * Hanya berjalan jika file JSON masih ada dan tabel memories kosong.
 */
async function migrateFromJSON(): Promise<void> {
  const countRow = _db.prepare('SELECT COUNT(*) as c FROM memories').get() as any;
  if (countRow.c > 0) return; // Sudah ada data, skip migrasi

  const jsonFiles: { file: string; layer: MemoryLayer }[] = [
    { file: path.join(MEMORY_DIR, 'context.json'),  layer: 'working'   },
    { file: path.join(MEMORY_DIR, 'episodic.json'), layer: 'episodic'  },
    { file: path.join(MEMORY_DIR, 'semantic.json'), layer: 'semantic'  },
    { file: path.join(MEMORY_DIR, 'core.json'),     layer: 'core'      },
  ];

  let totalMigrated = 0;
  const insertStmt = _db.prepare(`
    INSERT OR IGNORE INTO memories (id, layer, content, embedding, score, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const { file, layer } of jsonFiles) {
    if (!fsSync.existsSync(file)) continue;
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const data: Record<string, any> = JSON.parse(raw);
      for (const [key, entry] of Object.entries(data)) {
        const embBlob = entry.embedding && entry.embedding.length > 0
          ? Buffer.from(new Float32Array(entry.embedding).buffer)
          : null;
        const content = typeof entry.data === 'string'
          ? entry.data
          : JSON.stringify(entry.data);
        const tags = JSON.stringify(entry.tags || []);
        const ts = entry.updatedAt || new Date().toISOString();
        insertStmt.run(key, layer, content, embBlob, 0.0, tags, ts, ts);
        totalMigrated++;
      }
      Logger.log('INFO', `[SQLiteVault] Migrated ${Object.keys(data).length} entries from ${path.basename(file)}`, {}, 'MEMORY');
    } catch (e: any) {
      Logger.log('WARN', `[SQLiteVault] Migration skipped for ${file}: ${e.message}`, {}, 'MEMORY');
    }
  }

  if (totalMigrated > 0) {
    Logger.log('INFO', `[SQLiteVault] Migration complete: ${totalMigrated} total entries`, {}, 'MEMORY');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────
function getDB(): any {
  if (!_db) throw new Error('[SQLiteVault] Vault not initialized. Call initSQLiteVault() first.');
  return _db;
}

function embeddingToBlob(emb: number[]): Buffer | null {
  if (!emb || emb.length === 0) return null;
  return Buffer.from(new Float32Array(emb).buffer);
}

function blobToEmbedding(blob: Buffer | null): number[] {
  if (!blob) return [];
  return Array.from(new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    ma  += a[i] * a[i];
    mb  += b[i] * b[i];
  }
  return (ma && mb) ? dot / (Math.sqrt(ma) * Math.sqrt(mb)) : 0;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Simpan atau perbarui entri memori di vault.
 */
export async function vaultStore(
  id: string,
  layer: MemoryLayer,
  data: any,
  embedding: number[] = [],
  tags: string[] = [],
  score = 0.0
): Promise<void> {
  await initSQLiteVault();
  const db = getDB();
  const content = typeof data === 'string' ? data : JSON.stringify(data);
  const embBlob = embeddingToBlob(embedding);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO memories (id, layer, content, embedding, score, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      content    = excluded.content,
      embedding  = excluded.embedding,
      score      = excluded.score,
      tags       = excluded.tags,
      updated_at = excluded.updated_at
  `).run(id, layer, content, embBlob, score, JSON.stringify(tags), now, now);
}

/**
 * Ambil satu entri memori berdasarkan ID.
 */
export async function vaultGet(id: string): Promise<VaultEntry | null> {
  await initSQLiteVault();
  const row = getDB()
    .prepare('SELECT * FROM memories WHERE id = ?')
    .get(id) as any;
  if (!row) return null;
  return rowToEntry(row);
}

/**
 * Hapus entri memori berdasarkan ID.
 */
export async function vaultDelete(id: string): Promise<void> {
  await initSQLiteVault();
  getDB().prepare('DELETE FROM memories WHERE id = ?').run(id);
}

/**
 * Semantic search dengan cosine similarity jika embedding tersedia,
 * fallback ke lexical search jika tidak.
 */
export async function vaultSearch(
  queryVector: number[],
  queryTerms: string[],
  layer: MemoryLayer,
  limit = 5,
  minScore = 0.4
): Promise<Array<{ id: string; data: any; score: number; tags: string[]; updated_at: string }>> {
  await initSQLiteVault();
  const rows = getDB()
    .prepare('SELECT * FROM memories WHERE layer = ? ORDER BY updated_at DESC LIMIT 500')
    .all(layer) as any[];

  return rows
    .map((row: any) => {
      const entry = rowToEntry(row);
      const emb   = entry.embedding || [];
      let score   = 0;

      if (queryVector.length > 0 && emb.length > 0) {
        score = cosineSimilarity(queryVector, emb);
      } else {
        const text  = entry.content.toLowerCase();
        let hits = 0;
        for (const term of queryTerms) {
          if (text.includes(term)) hits++;
        }
        const tagHits = entry.tags.filter((t: string) => queryTerms.includes(t.toLowerCase())).length;
        score = queryTerms.length > 0
          ? (hits / queryTerms.length) * 0.7 + (tagHits > 0 ? 0.3 : 0)
          : 0;
      }

      let parsedData: any;
      try { parsedData = JSON.parse(entry.content); }
      catch { parsedData = entry.content; }

      return { id: entry.id, data: parsedData, score, tags: entry.tags, updated_at: entry.updated_at };
    })
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Hitung total entri memori per layer.
 */
export async function vaultCount(layer?: MemoryLayer): Promise<number> {
  await initSQLiteVault();
  const row = layer
    ? getDB().prepare('SELECT COUNT(*) as c FROM memories WHERE layer = ?').get(layer) as any
    : getDB().prepare('SELECT COUNT(*) as c FROM memories').get() as any;
  return row.c;
}

/**
 * Ambil semua entri dari satu layer (untuk keperluan konsolidasi).
 */
export async function vaultGetAll(
  layer: MemoryLayer,
  limit = 200
): Promise<VaultEntry[]> {
  await initSQLiteVault();
  const rows = getDB()
    .prepare('SELECT * FROM memories WHERE layer = ? ORDER BY updated_at DESC LIMIT ?')
    .all(layer, limit) as any[];
  return rows.map(rowToEntry);
}

/**
 * Prune: hapus entri tertua di layer tertentu jika melebihi batas.
 */
export async function vaultPrune(layer: MemoryLayer, keepLatest = 500): Promise<number> {
  await initSQLiteVault();
  const result = getDB().prepare(`
    DELETE FROM memories
    WHERE layer = ? AND id NOT IN (
      SELECT id FROM memories WHERE layer = ? ORDER BY updated_at DESC LIMIT ?
    )
  `).run(layer, layer, keepLatest);
  return result.changes ?? 0;
}

// ── Lease Lock API (Sprint 5 Prep) ────────────────────────────────────

export async function leaseAcquire(
  resourceId: string,
  holderSession: string,
  ttlSeconds = 120,
  pid?: number
): Promise<boolean> {
  await initSQLiteVault();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  try {
    getDB().prepare(`
      INSERT INTO leases (resource_id, holder_session, expires_at, pid)
      VALUES (?, ?, ?, ?)
    `).run(resourceId, holderSession, expiresAt, pid ?? null);
    return true;
  } catch {
    // Lease sudah dipegang — cek apakah sudah expired
    const existing = getDB()
      .prepare('SELECT expires_at FROM leases WHERE resource_id = ?')
      .get(resourceId) as any;
    if (existing && existing.expires_at < new Date().toISOString()) {
      // Expired — ambil alih
      getDB().prepare(`
        UPDATE leases SET holder_session=?, expires_at=?, pid=? WHERE resource_id=?
      `).run(holderSession, expiresAt, pid ?? null, resourceId);
      return true;
    }
    return false;
  }
}

export async function leaseRelease(resourceId: string): Promise<void> {
  await initSQLiteVault();
  getDB().prepare('DELETE FROM leases WHERE resource_id = ?').run(resourceId);
}

export async function leaseRenew(resourceId: string, ttlSeconds = 120): Promise<boolean> {
  await initSQLiteVault();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const result = getDB().prepare(
    'UPDATE leases SET expires_at = ? WHERE resource_id = ?'
  ).run(expiresAt, resourceId);
  return (result.changes ?? 0) > 0;
}

// ── Diagnostik (untuk ant doctor) ────────────────────────────────────

export async function vaultDiagnose(): Promise<{
  path: string;
  totalRows: number;
  layers: Record<string, number>;
  dbSizeKb: number;
  walMode: boolean;
}> {
  await initSQLiteVault();
  const db = getDB();
  const total = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as any).c;
  const layers: Record<string, number> = {};
  for (const layer of ['working', 'episodic', 'semantic', 'core']) {
    layers[layer] = (db.prepare('SELECT COUNT(*) as c FROM memories WHERE layer = ?').get(layer) as any).c;
  }
  const wal = (db.prepare("PRAGMA journal_mode").get() as any).journal_mode === 'wal';
  let sizeKb = 0;
  try {
    const stat = fsSync.statSync(VAULT_DB);
    sizeKb = Math.round(stat.size / 1024);
  } catch {}
  return { path: VAULT_DB, totalRows: total, layers, dbSizeKb: sizeKb, walMode: wal };
}

/**
 * Optimasi & defragmentasi SQLite DB (VACUUM + wal_checkpoint)
 */
export async function vaultOptimize(): Promise<{ beforeSizeKb: number; afterSizeKb: number; vacuumed: boolean }> {
  await initSQLiteVault();
  const db = getDB();
  let beforeSizeKb = 0;
  try {
    beforeSizeKb = Math.round(fsSync.statSync(VAULT_DB).size / 1024);
  } catch {}

  try {
    db.exec('PRAGMA optimize;');
    db.exec('VACUUM;');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {}

  let afterSizeKb = 0;
  try {
    afterSizeKb = Math.round(fsSync.statSync(VAULT_DB).size / 1024);
  } catch {}

  return { beforeSizeKb, afterSizeKb, vacuumed: true };
}

/**
 * Tutup koneksi DB singleton (untuk graceful shutdown & test cleanup).
 * Setelah dipanggil, initSQLiteVault() dapat memulai koneksi baru.
 */
export async function vaultClose(): Promise<void> {
  if (_initPromise) {
    await _initPromise.catch(() => {});
  }
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
    _initPromise = null;
  }
}

// ── Internal Helper ───────────────────────────────────────────────────

function rowToEntry(row: any): VaultEntry {
  return {
    id:         row.id,
    layer:      row.layer,
    content:    row.content,
    embedding:  blobToEmbedding(row.embedding ?? null),
    score:      row.score,
    tags:       JSON.parse(row.tags || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
