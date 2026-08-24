import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseOneShotArgs } from '../../src/core/cli/argv/one_shot.js';

describe('parseOneShotArgs (headless mode)', () => {
    it('return null tanpa -p/--prompt', () => {
        assert.strictEqual(parseOneShotArgs([]), null);
        assert.strictEqual(parseOneShotArgs(['--sandbox']), null);
    });

    it('parse prompt sederhana', () => {
        const inv = parseOneShotArgs(['-p', 'perbaiki bug login']);
        assert.deepStrictEqual(inv, { prompt: 'perbaiki bug login', outputFormat: 'text', sandbox: false });
    });

    it('mendukung --prompt panjang', () => {
        const inv = parseOneShotArgs(['--prompt', 'audit kode']);
        assert.strictEqual(inv?.prompt, 'audit kode');
    });

    it('parse --output-format json', () => {
        const inv = parseOneShotArgs(['-p', 'task', '--output-format', 'json']);
        assert.strictEqual(inv?.outputFormat, 'json');
    });

    it('menolak nilai --output-format tidak valid', () => {
        assert.throws(() => parseOneShotArgs(['-p', 'x', '--output-format', 'yaml']), /tidak valid/);
    });

    it('error jika -p tanpa argumen', () => {
        assert.throws(() => parseOneShotArgs(['-p']), /argumen prompt/);
    });

    it('error jika --output-format tanpa nilai', () => {
        assert.throws(() => parseOneShotArgs(['-p', 'x', '--output-format']), /nilai/);
    });

    it('flag --sandbox terdeteksi', () => {
        const inv = parseOneShotArgs(['--sandbox', '-p', 'tugas aman']);
        assert.strictEqual(inv?.sandbox, true);
    });
});
