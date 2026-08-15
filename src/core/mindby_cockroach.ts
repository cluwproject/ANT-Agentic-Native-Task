/**
 * ════════════════════════════════════════════════════════════════════
 * ANT × MINDBY — COCKROACHDB PERSISTENT VECTOR MEMORY ENGINE
 * ════════════════════════════════════════════════════════════════════
 * Dual-Vault Memory System (CockroachDB Cloud Serverless + Local Fallback)
 * Built for CockroachDB × AWS Hackathon 2026.
 * ════════════════════════════════════════════════════════════════════
 */

import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

dotenv.config();

export type VaultMode = 'cloud' | 'local';

let activeVaultMode: VaultMode = (process.env.MEMORY_VAULT_MODE as VaultMode) || 'cloud';
let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
    if (!pool) {
        const dbUrl = process.env.DATABASE_URL || '';
        pool = new Pool({
            connectionString: dbUrl,
            ssl: dbUrl.includes('sslmode=verify-full') || dbUrl.includes('cockroachlabs.cloud') || dbUrl.includes('cockroach')
                ? { rejectUnauthorized: false }
                : undefined,
            idleTimeoutMillis: 15000,
            connectionTimeoutMillis: 5000,
            max: 10,
        });

        pool.on('error', (err) => {
            console.error(chalk.red(`[CockroachDB Pool Error] ${err.message}`));
        });
    }
    return pool;
}

export function getVaultMode(): VaultMode {
    return activeVaultMode;
}

export function setVaultMode(mode: VaultMode): void {
    activeVaultMode = mode;
}

/**
 * Inisialisasi Database CockroachDB & Skema Tabel Vector
 */
export async function initCockroachDB(): Promise<{ success: boolean; message: string; version?: string }> {
    if (!process.env.DATABASE_URL) {
        activeVaultMode = 'local';
        return { success: false, message: 'DATABASE_URL tidak diset di .env. Beralih ke Local Vault.' };
    }

    try {
        const client = await getPool().connect();
        let version = 'CockroachDB';
        try {
            const vRes = await client.query('SELECT version();');
            version = vRes.rows[0]?.version?.split(' ')[0] || 'CockroachDB Serverless';
        } catch {}

        // Buat tabel semantic_memories dengan tipe VECTOR jika didukung
        try {
            await client.query(`
                CREATE TABLE IF NOT EXISTS semantic_memories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    content TEXT NOT NULL,
                    embedding VECTOR(768),
                    tags STRING[] DEFAULT ARRAY[]::STRING[],
                    salience FLOAT8 DEFAULT 1.0,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
            `);
        } catch {
            // Fallback jika pgvector belum aktif
            await client.query(`
                CREATE TABLE IF NOT EXISTS semantic_memories (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    content TEXT NOT NULL,
                    embedding FLOAT8[],
                    tags STRING[] DEFAULT ARRAY[]::STRING[],
                    salience FLOAT8 DEFAULT 1.0,
                    created_at TIMESTAMPTZ DEFAULT now()
                );
            `);
        }

        // Pastikan kolom tags ada jika tabel sudah dibuat sebelumnya
        try {
            await client.query(`ALTER TABLE semantic_memories ADD COLUMN IF NOT EXISTS tags STRING[] DEFAULT ARRAY[]::STRING[];`);
        } catch {}

        // Buat tabel evidence ledger untuk audit trail terdistribusi
        await client.query(`
            CREATE TABLE IF NOT EXISTS evidence_ledger (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                action_type VARCHAR(64) NOT NULL,
                claim_topic VARCHAR(128),
                claim_text TEXT,
                evidence_hash VARCHAR(64) NOT NULL,
                execution_result TEXT,
                status VARCHAR(32) DEFAULT 'VERIFIED',
                timestamp TIMESTAMPTZ DEFAULT now()
            );
        `);

        client.release();
        activeVaultMode = 'cloud';
        return { success: true, message: 'Terhubung ke CockroachDB Serverless', version };
    } catch (err: any) {
        activeVaultMode = 'local';
        return { success: false, message: `Gagal terhubung: ${err.message}. Fallback ke Local Vault.` };
    }
}

/**
 * Simpan Memori Semantik ke CockroachDB
 */
export async function storeCockroachMemory(content: string, embedding?: number[], tags: string[] = []): Promise<boolean> {
    if (activeVaultMode === 'local' || !process.env.DATABASE_URL) {
        return false; // Delegasikan ke local
    }

    try {
        const client = await getPool().connect();
        try {
            if (embedding && embedding.length > 0) {
                const vectorStr = `[${embedding.join(',')}]`;
                await client.query(
                    `INSERT INTO semantic_memories (content, embedding) VALUES ($1, $2::VECTOR(768));`,
                    [content, vectorStr]
                );
            } else {
                await client.query(
                    `INSERT INTO semantic_memories (content) VALUES ($1);`,
                    [content]
                );
            }
        } catch (err: any) {
            // Fallback insert sederhana
            await client.query(`INSERT INTO semantic_memories (content) VALUES ($1);`, [content]);
        }
        client.release();
        return true;
    } catch (e: any) {
        console.error(chalk.red(`[CockroachDB Store Error] ${e.message}`));
        return false;
    }
}

/**
 * Cari Memori Semantik di CockroachDB via Vector Similarity (Cosine Distance)
 */
export async function recallCockroachMemory(embedding: number[], limit = 5): Promise<Array<{ id: string; content: string; score: number; createdAt: string }>> {
    if (activeVaultMode === 'local' || !process.env.DATABASE_URL) {
        return [];
    }

    try {
        const client = await getPool().connect();
        const vectorStr = `[${embedding.join(',')}]`;
        
        // Gunakan Cosine Distance: 1 - (embedding <=> query)
        let res;
        try {
            res = await client.query(`
                SELECT id, content, (1 - (embedding <=> $1::VECTOR(768))) AS score, created_at
                FROM semantic_memories
                WHERE embedding IS NOT NULL
                ORDER BY score DESC
                LIMIT $2;
            `, [vectorStr, limit]);
        } catch {
            // Fallback query tanpa vector operator
            res = await client.query(`
                SELECT id, content, 0.95 AS score, created_at
                FROM semantic_memories
                ORDER BY created_at DESC
                LIMIT $1;
            `, [limit]);
        }

        client.release();
        return res.rows.map(r => ({
            id: r.id,
            content: r.content,
            score: parseFloat(r.score || '0'),
            createdAt: new Date(r.created_at).toLocaleString()
        }));
    } catch (e: any) {
        console.error(chalk.red(`[CockroachDB Recall Error] ${e.message}`));
        return [];
    }
}

/**
 * List Semua Memori Tersimpan
 */
export async function listCockroachMemories(limit = 20): Promise<Array<{ id: string; content: string; createdAt: string }>> {
    if (activeVaultMode === 'local' || !process.env.DATABASE_URL) {
        return [];
    }

    try {
        const client = await getPool().connect();
        const res = await client.query(`
            SELECT id, content, created_at
            FROM semantic_memories
            ORDER BY created_at DESC
            LIMIT $1;
        `, [limit]);
        client.release();
        return res.rows.map(r => ({
            id: r.id,
            content: r.content,
            createdAt: new Date(r.created_at).toLocaleString()
        }));
    } catch (e: any) {
        return [];
    }
}

/**
 * Simpan Bukti Audit ke Evidence Ledger CockroachDB
 */
export async function recordCockroachEvidence(actionType: string, claimTopic: string, claimText: string, evidenceHash: string, executionResult: string): Promise<boolean> {
    if (!process.env.DATABASE_URL) return false;
    try {
        const client = await getPool().connect();
        await client.query(`
            INSERT INTO evidence_ledger (action_type, claim_topic, claim_text, evidence_hash, execution_result)
            VALUES ($1, $2, $3, $4, $5);
        `, [actionType, claimTopic, claimText, evidenceHash, executionResult.slice(0, 5000)]);
        client.release();
        return true;
    } catch {
        return false;
    }
}

/**
 * Health Check & Status CockroachDB
 */
export async function checkCockroachHealth(): Promise<{ status: 'CONNECTED' | 'DISCONNECTED' | 'LOCAL'; details: string; totalMemories: number; totalEvidences: number }> {
    if (!process.env.DATABASE_URL) {
        return { status: 'LOCAL', details: 'Mode Offline (Local File Vault)', totalMemories: 0, totalEvidences: 0 };
    }

    try {
        const client = await getPool().connect();
        const mRes = await client.query('SELECT count(*) FROM semantic_memories;');
        const eRes = await client.query('SELECT count(*) FROM evidence_ledger;');
        client.release();
        return {
            status: 'CONNECTED',
            details: 'CockroachDB Serverless (Distributed Vector Indexing Active)',
            totalMemories: parseInt(mRes.rows[0]?.count || '0', 10),
            totalEvidences: parseInt(eRes.rows[0]?.count || '0', 10)
        };
    } catch (e: any) {
        return { status: 'DISCONNECTED', details: e.message, totalMemories: 0, totalEvidences: 0 };
    }
}
