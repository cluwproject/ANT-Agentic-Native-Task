import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadProjectInstructions, renderProjectInstructionsBlock, getProjectInstructions, MAX_PROJECT_MEMORY_CHARS } from '../../src/core/agent_loop/projectMemory.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ant-projmem-'));
}

describe('projectMemory (ANT.md loader)', () => {
    it('return null jika tidak ada ANT.md', () => {
        const dir = makeTempDir();
        assert.strictEqual(loadProjectInstructions(dir), null);
        assert.strictEqual(getProjectInstructions(dir), '');
    });

    it('muat ANT.md dari root proyek', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'ANT.md'), '# Aturan Tim\nGunakan pnpm, bukan npm.');
        const pm = loadProjectInstructions(dir);
        assert.ok(pm);
        assert.strictEqual(pm.sourcePath, path.join(dir, 'ANT.md'));
        assert.ok(pm.content.includes('pnpm'));
        assert.strictEqual(pm.truncated, false);
    });

    it('fallback ke .ant/ANT.md jika root tidak ada', () => {
        const dir = makeTempDir();
        const nested = path.join(dir, '.ant');
        fs.mkdirSync(nested);
        fs.writeFileSync(path.join(nested, 'ANT.md'), 'konten nested');
        const pm = loadProjectInstructions(dir);
        assert.ok(pm);
        assert.ok(pm.content.includes('nested'));
    });

    it('prioritas ANT.md root di atas .ant/ANT.md', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'ANT.md'), 'versi root');
        const nested = path.join(dir, '.ant');
        fs.mkdirSync(nested);
        fs.writeFileSync(path.join(nested, 'ANT.md'), 'versi nested');
        assert.ok(loadProjectInstructions(dir)!.content.includes('versi root'));
    });

    it('memotong konten melebihi batas maksimum', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'ANT.md'), 'x'.repeat(MAX_PROJECT_MEMORY_CHARS + 5000));
        const pm = loadProjectInstructions(dir);
        assert.ok(pm);
        assert.strictEqual(pm.truncated, true);
        assert.ok(pm.content.length <= MAX_PROJECT_MEMORY_CHARS);
    });

    it('render block membungkus konten dengan delimiter + catatan keamanan', () => {
        const pm = { sourcePath: '/tmp/ANT.md', content: 'aturan', truncated: false };
        const block = renderProjectInstructionsBlock(pm);
        assert.ok(block.includes('[PROJECT INSTRUCTIONS — ANT.md]'));
        assert.ok(block.includes('<project_instructions>'));
        assert.ok(block.includes('aturan'));
        assert.ok(block.includes('Allowlist Gatekeeper'), 'harus menyebut security fence tetap berlaku');
    });
});
