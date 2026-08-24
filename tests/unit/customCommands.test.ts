import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    parseCustomCommand, listCustomCommands, applyArguments
} from '../../src/core/cli/commands/custom_commands.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ant-customcmd-'));
}

describe('custom slash commands (.ant/commands/*.md)', () => {
    it('parse frontmatter description', () => {
        const raw = '---\ndescription: Review perubahan kode\n---\nReview diff berikut: $ARGUMENTS';
        const parsed = parseCustomCommand(raw);
        assert.strictEqual(parsed.description, 'Review perubahan kode');
        assert.strictEqual(parsed.template, 'Review diff berikut: $ARGUMENTS');
    });

    it('fallback ke heading markdown jika tanpa frontmatter', () => {
        const parsed = parseCustomCommand('# Deploy Staging\njalankan deploy');
        assert.strictEqual(parsed.description, 'Deploy Staging');
        assert.ok(parsed.template.includes('deploy'));
    });

    it('applyArguments mengganti $ARGUMENTS', () => {
        const out = applyArguments('Cek file $ARGUMENTS dengan teliti', 'src/index.ts');
        assert.strictEqual(out, 'Cek file src/index.ts dengan teliti');
    });

    it('applyArguments append jika template tanpa placeholder', () => {
        const out = applyArguments('Ringkas proyek ini', 'fokus ke auth');
        assert.ok(out.includes('[ARGUMENTS]: fokus ke auth'));
    });

    it('listCustomCommands memuat semua .md sebagai command', () => {
        const dir = makeTempDir();
        const cmdDir = path.join(dir, '.ant', 'commands');
        fs.mkdirSync(cmdDir, { recursive: true });
        fs.writeFileSync(path.join(cmdDir, 'review.md'), '---\ndescription: Review kode\n---\nReview: $ARGUMENTS');
        fs.writeFileSync(path.join(cmdDir, 'deploy.md'), '# Deploy\nDeploy sekarang');
        fs.writeFileSync(path.join(cmdDir, 'ignored.txt'), 'bukan markdown');

        const defs = listCustomCommands(dir, true);
        assert.strictEqual(defs.length, 2);
        const names = defs.map(d => d.name).sort();
        assert.deepStrictEqual(names, ['deploy', 'review']);
        assert.ok(defs.find(d => d.name === 'review')!.description.includes('Review'));
    });

    it('return kosong untuk direktori tanpa commands', () => {
        const dir = makeTempDir();
        assert.deepStrictEqual(listCustomCommands(dir, true), []);
    });
});
