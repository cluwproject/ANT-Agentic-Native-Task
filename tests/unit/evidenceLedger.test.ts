import { describe, it } from 'node:test';
import assert from 'node:assert';
import { recordEvidence, getEvidence, isValidEvidenceId, renderEvidenceTags, listEvidence } from '../../src/core/agent_loop/evidenceLedger.js';

describe('EvidenceLedger', () => {

    describe('recordEvidence()', () => {
        it('should record a string result and return a valid EvidenceRecord', () => {
            const record = recordEvidence('read_file', { path: '/tmp/test.txt' }, 'file content here');
            assert.match(record.id, /^[a-f0-9]{8}$/);
            assert.strictEqual(record.tool, 'read_file');
            assert.match(record.resultHash, /^[a-f0-9]{64}$/);
            assert.ok(record.resultSizeBytes > 0);
            assert.ok(record.createdAt);
        });

        it('should produce a deterministic SHA-256 hash for identical inputs', () => {
            const content = 'identical content for hashing';
            const r1 = recordEvidence('tool_a', {}, content);
            const r2 = recordEvidence('tool_a', {}, content);
            assert.strictEqual(r1.resultHash, r2.resultHash);
        });

        it('should produce different hashes for different content', () => {
            const r1 = recordEvidence('tool_a', {}, 'content A');
            const r2 = recordEvidence('tool_a', {}, 'content B');
            assert.notStrictEqual(r1.resultHash, r2.resultHash);
        });

        it('should handle Buffer (binary) inputs like PNG screenshots', () => {
            const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
            const record = recordEvidence('screenshot', {}, fakePng);
            assert.ok(record.resultPreview.includes('binary data'));
            assert.strictEqual(record.resultSizeBytes, fakePng.length);
            assert.match(record.resultHash, /^[a-f0-9]{64}$/);
        });

        it('should handle object inputs by JSON-stringifying them', () => {
            const obj = { status: 'ok', data: [1, 2, 3] };
            const record = recordEvidence('web_request', { url: 'https://example.com' }, obj);
            assert.ok(record.resultHash);
            assert.ok(record.resultSizeBytes > 0);
        });
    });

    describe('getEvidence()', () => {
        it('should retrieve a recorded evidence by ID', () => {
            const record = recordEvidence('shell_exec', { command: 'ls' }, 'file1.txt\nfile2.txt');
            const retrieved = getEvidence(record.id);
            assert.ok(retrieved);
            assert.strictEqual(retrieved?.id, record.id);
            assert.strictEqual(retrieved?.resultHash, record.resultHash);
        });

        it('should return undefined for a non-existent ID', () => {
            const result = getEvidence('00000000');
            assert.strictEqual(result, undefined);
        });
    });

    describe('isValidEvidenceId()', () => {
        it('should return true for a registered evidence ID', () => {
            const record = recordEvidence('env_check', {}, 'NODE_ENV=test');
            assert.strictEqual(isValidEvidenceId(record.id), true);
        });

        it('should return false for a forged or non-existent ID', () => {
            assert.strictEqual(isValidEvidenceId('deadbeef'), false);
            assert.strictEqual(isValidEvidenceId('aaaabbbb'), false);
        });

        it('should return false for an empty string', () => {
            assert.strictEqual(isValidEvidenceId(''), false);
        });
    });

    describe('renderEvidenceTags()', () => {
        it('should replace a valid [EVID:id] tag with evidence details', () => {
            const record = recordEvidence('read_file', { path: '/root/test.ts' }, 'const x = 1;');
            const text = `The file was read. [EVID:${record.id}]`;
            const rendered = renderEvidenceTags(text);
            assert.ok(rendered.includes(`[Bukti: ${record.id}]`));
            assert.ok(rendered.includes(record.resultHash));
        });

        it('should mark an invalid [EVID:id] tag as invalid, not silently remove it', () => {
            const text = 'Here is forged evidence. [EVID:badf00d0]';
            const rendered = renderEvidenceTags(text);
            assert.ok(rendered.includes('BUKTI TIDAK VALID'));
            assert.ok(rendered.includes('badf00d0'));
        });

        it('should preserve text content when no EVID tags are present', () => {
            const text = 'Normal AI response without any evidence tags.';
            const rendered = renderEvidenceTags(text);
            assert.ok(rendered.includes(text));
        });
    });

    describe('listEvidence()', () => {
        it('should return all recorded evidence records', () => {
            const before = listEvidence().length;
            recordEvidence('tool_x', {}, 'result x');
            recordEvidence('tool_y', {}, 'result y');
            const after = listEvidence();
            assert.ok(after.length >= before + 2);
        });
    });
});
