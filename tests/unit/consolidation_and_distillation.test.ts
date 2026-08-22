import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import { consolidateMemories } from '../../src/core/memory_consolidation.js';
import { distillMilestoneProcedure } from '../../src/core/procedural_distiller.js';

const BASE_DIR = process.cwd();
const MEMORY_DIR = path.join(BASE_DIR, 'workspace', 'memories');
const CONTEXT_FILE = path.join(MEMORY_DIR, 'context.json');
const PROCEDURES_FILE = path.join(MEMORY_DIR, 'procedures.json');

describe('Autonomous Memory Consolidation & Procedural Distiller Tests', () => {

    before(async () => {
        await fs.mkdir(MEMORY_DIR, { recursive: true });
    });

    it('should cleanly handle consolidation when memory buffer is empty', async () => {
        await fs.writeFile(CONTEXT_FILE, JSON.stringify({}, null, 2));
        const res = await consolidateMemories();
        assert.ok(res.status === 'empty' || res.status === 'success');
    });

    it('should promote significant working memory entries and prune temporary context', async () => {
        const mockWorking = {
            temp_chat_1: "halo selamat siang",
            project_config_db: "Database port is 5432 with Prisma and PostgreSQL endpoint",
            error_lesson_nextjs: "Error ENOENT package.json resolved by creating directory before scaffold"
        };
        await fs.writeFile(CONTEXT_FILE, JSON.stringify(mockWorking, null, 2));

        const res = await consolidateMemories();
        assert.strictEqual(res.status, 'success');
        assert.ok(res.promotedCount >= 2, `Expected at least 2 promoted entries, got ${res.promotedCount}`);
        assert.strictEqual(res.prunedWorkingKeys, 3);

        // Verify context.json is pruned/clean
        const pruned = JSON.parse(await fs.readFile(CONTEXT_FILE, 'utf-8'));
        assert.deepStrictEqual(pruned, {});
    });

    it('should distill milestone success into a structured procedural gold standard', async () => {
        const profileId = 'next-prisma-unit-test';
        const targetDir = '/tmp/ant-test-distill';
        const goal = 'Setup Next.js 15 with Prisma ORM and TypeScript';
        const evidenceProof = ['evid_sha256_mock_12345'];

        const distilled = await distillMilestoneProcedure(profileId, targetDir, goal, evidenceProof);
        assert.ok(distilled, 'Expected distilled procedure record');
        assert.strictEqual(distilled?.profileId, profileId);
        assert.strictEqual(distilled?.status, 'VERIFIED_GOLD_STANDARD');
        assert.deepStrictEqual(distilled?.evidenceProof, evidenceProof);

        // Verify procedures.json persistence
        const procDb = JSON.parse(await fs.readFile(PROCEDURES_FILE, 'utf-8'));
        assert.ok(Array.isArray(procDb.procedures));
        const found = procDb.procedures.find((p: any) => p.id === distilled?.id);
        assert.ok(found, 'Distilled record should exist in procedures.json');
    });
});
