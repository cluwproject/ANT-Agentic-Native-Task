/**
 * Unit Tests — SQLite Vault (ADR-001)
 * Sprint 2 of 5 — Sovereign Runtime Era
 *
 * Memvalidasi:
 * 1. Inisialisasi vault dan WAL mode
 * 2. Store, Get, Delete entri
 * 3. Semantic search (lexical fallback)
 * 4. Count dan Prune
 * 5. Lease Lock API (Sprint 5 prep)
 * 6. vaultDiagnose untuk ant doctor
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

// ── Isolasi tmpdir per test run ──────────────────────────────────────
const TMP = path.join(os.tmpdir(), `ant-vault-test-${Date.now()}`);
const originalCwd = process.cwd;

// Override cwd agar vault menulis ke TMP
(process as any).cwd = () => TMP;

import {
  initSQLiteVault,
  vaultStore,
  vaultGet,
  vaultDelete,
  vaultSearch,
  vaultCount,
  vaultGetAll,
  vaultPrune,
  leaseAcquire,
  leaseRelease,
  leaseRenew,
  vaultDiagnose,
} from '../../src/core/memory/sqlite_vault.js';

// ── Setup & Teardown ─────────────────────────────────────────────────

before(async () => {
  await fs.mkdir(path.join(TMP, 'workspace', 'memories'), { recursive: true });
});

after(async () => {
  process.cwd = originalCwd;
  await fs.rm(TMP, { recursive: true, force: true });
});

// ── Test Suites ──────────────────────────────────────────────────────

describe('SQLite Vault — Init & WAL', () => {
  it('should initialize vault without error', async () => {
    await assert.doesNotReject(() => initSQLiteVault());
  });

  it('vaultDiagnose should return walMode = true', async () => {
    const diag = await vaultDiagnose();
    assert.equal(diag.walMode, true, 'WAL mode harus aktif');
    assert.ok(diag.path.endsWith('ant_vault.db'), 'path harus mengakhiri dengan ant_vault.db');
  });
});

describe('SQLite Vault — Store & Get', () => {
  it('should store and retrieve a working memory entry', async () => {
    await vaultStore('test-key-1', 'working', { msg: 'hello ant' }, [], ['test']);
    const entry = await vaultGet('test-key-1');
    assert.ok(entry, 'Entry harus ditemukan');
    assert.equal(entry!.layer, 'working');
    assert.ok(entry!.content.includes('hello ant'));
    assert.deepEqual(entry!.tags, ['test']);
  });

  it('should return null for non-existent id', async () => {
    const entry = await vaultGet('non-existent-key-xyz');
    assert.equal(entry, null);
  });

  it('should upsert correctly on duplicate id', async () => {
    await vaultStore('upsert-key', 'semantic', 'first value');
    await vaultStore('upsert-key', 'semantic', 'second value updated');
    const entry = await vaultGet('upsert-key');
    assert.ok(entry!.content.includes('second value updated'));
  });

  it('should store string content directly', async () => {
    await vaultStore('str-key', 'episodic', 'plain string data');
    const entry = await vaultGet('str-key');
    assert.ok(entry!.content.includes('plain string data'));
  });
});

describe('SQLite Vault — Delete', () => {
  it('should delete an existing entry', async () => {
    await vaultStore('del-key', 'core', 'to be deleted');
    await vaultDelete('del-key');
    const entry = await vaultGet('del-key');
    assert.equal(entry, null);
  });

  it('should not throw when deleting non-existent key', async () => {
    await assert.doesNotReject(() => vaultDelete('ghost-key-xyz'));
  });
});

describe('SQLite Vault — Count & GetAll', () => {
  it('should count entries per layer', async () => {
    await vaultStore('cnt-1', 'core', 'alpha');
    await vaultStore('cnt-2', 'core', 'beta');
    const count = await vaultCount('core');
    assert.ok(count >= 2, 'Harus ada minimal 2 entri di core');
  });

  it('should return all entries from a layer', async () => {
    const all = await vaultGetAll('core');
    assert.ok(Array.isArray(all));
    assert.ok(all.length >= 2);
  });
});

describe('SQLite Vault — Semantic Search (Lexical Fallback)', () => {
  before(async () => {
    await vaultStore('search-ant-1', 'semantic', 'ANT adalah runtime agentic berdaulat');
    await vaultStore('search-ant-2', 'semantic', 'Scaffolding pipeline menggunakan TypeScript');
    await vaultStore('search-ant-3', 'semantic', 'SQLite vault menyimpan memori secara lokal');
  });

  it('should find relevant entry with lexical fallback', async () => {
    const results = await vaultSearch(
      [],          // no embedding vector → lexical fallback
      ['sqlite', 'vault'],
      'semantic',
      5,
      0.3
    );
    assert.ok(results.length >= 1, 'Harus menemukan minimal 1 hasil');
    assert.ok(
      results.some(r => JSON.stringify(r.data).toLowerCase().includes('sqlite')),
      'Hasil harus mengandung kata "sqlite"'
    );
  });

  it('should return empty array when no match', async () => {
    const results = await vaultSearch([], ['quantum-teleportation-xyz'], 'semantic', 5, 0.8);
    assert.equal(results.length, 0);
  });

  it('should return results sorted by score descending', async () => {
    const results = await vaultSearch([], ['agentic', 'runtime'], 'semantic', 5, 0.1);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, 'Harus terurut score DESC');
    }
  });
});

describe('SQLite Vault — Prune', () => {
  it('should prune entries beyond keepLatest limit', async () => {
    // Isi 5 entri di working layer
    for (let i = 0; i < 5; i++) {
      await vaultStore(`prune-${i}`, 'working', `entry ${i}`);
    }
    const before = await vaultCount('working');
    await vaultPrune('working', 3);
    const after = await vaultCount('working');
    assert.ok(after <= 3, `Setelah prune harus <= 3, tapi dapat ${after}`);
    assert.ok(before > after || after <= 3, 'Prune harus mengurangi atau mempertahankan batas');
  });
});

describe('SQLite Vault — Lease Lock (Sprint 5 Prep)', () => {
  it('should acquire a lease successfully', async () => {
    const ok = await leaseAcquire('agent_loop', 'session-abc', 120);
    assert.equal(ok, true);
  });

  it('should deny acquiring an already-held lease', async () => {
    const ok = await leaseAcquire('agent_loop', 'session-xyz', 120);
    assert.equal(ok, false, 'Lease yang sudah dipegang harus ditolak');
  });

  it('should renew an existing lease', async () => {
    const renewed = await leaseRenew('agent_loop', 300);
    assert.equal(renewed, true);
  });

  it('should release a lease', async () => {
    await leaseRelease('agent_loop');
    // Setelah dilepas, harus bisa di-acquire kembali
    const ok = await leaseAcquire('agent_loop', 'new-session', 60);
    assert.equal(ok, true);
    await leaseRelease('agent_loop'); // cleanup
  });

  it('should not throw when releasing a non-existent lease', async () => {
    await assert.doesNotReject(() => leaseRelease('non-existent-resource'));
  });
});

describe('SQLite Vault — Diagnose (ant doctor prep)', () => {
  it('should return correct diagnostic info', async () => {
    const diag = await vaultDiagnose();
    assert.ok(typeof diag.totalRows === 'number');
    assert.ok(typeof diag.dbSizeKb === 'number');
    assert.ok(diag.walMode === true);
    assert.ok('working' in diag.layers);
    assert.ok('episodic' in diag.layers);
    assert.ok('semantic' in diag.layers);
    assert.ok('core' in diag.layers);
  });
});
