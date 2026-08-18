// ============================================================================
// ANT — Unit Tests — Evidence Ledger
// ============================================================================
// Tests for the core cryptographic evidence tracking system.
// This is the #1 differentiator of ANT vs. all other AI frameworks.

import { recordEvidence, getEvidence, isValidEvidenceId, renderEvidenceTags, listEvidence } from '../../src/core/agent_loop/evidenceLedger.js';

describe('EvidenceLedger', () => {

    describe('recordEvidence()', () => {
        it('should record a string result and return a valid EvidenceRecord', () => {
            const record = recordEvidence('read_file', { path: '/tmp/test.txt' }, 'file content here');
            expect(record.id).toMatch(/^[a-f0-9]{8}$/);
            expect(record.tool).toBe('read_file');
            expect(record.resultHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 is 64 hex chars
            expect(record.resultSizeBytes).toBeGreaterThan(0);
            expect(record.createdAt).toBeTruthy();
        });

        it('should produce a deterministic SHA-256 hash for identical inputs', () => {
            const content = 'identical content for hashing';
            const r1 = recordEvidence('tool_a', {}, content);
            const r2 = recordEvidence('tool_a', {}, content);
            expect(r1.resultHash).toBe(r2.resultHash);
        });

        it('should produce different hashes for different content', () => {
            const r1 = recordEvidence('tool_a', {}, 'content A');
            const r2 = recordEvidence('tool_a', {}, 'content B');
            expect(r1.resultHash).not.toBe(r2.resultHash);
        });

        it('should handle Buffer (binary) inputs like PNG screenshots', () => {
            const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A]);
            const record = recordEvidence('screenshot', {}, fakePng);
            expect(record.resultPreview).toContain('binary data');
            expect(record.resultSizeBytes).toBe(fakePng.length);
            expect(record.resultHash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should handle object inputs by JSON-stringifying them', () => {
            const obj = { status: 'ok', data: [1, 2, 3] };
            const record = recordEvidence('web_request', { url: 'https://example.com' }, obj);
            expect(record.resultHash).toBeTruthy();
            expect(record.resultSizeBytes).toBeGreaterThan(0);
        });
    });

    describe('getEvidence()', () => {
        it('should retrieve a recorded evidence by ID', () => {
            const record = recordEvidence('shell_exec', { command: 'ls' }, 'file1.txt\nfile2.txt');
            const retrieved = getEvidence(record.id);
            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(record.id);
            expect(retrieved?.resultHash).toBe(record.resultHash);
        });

        it('should return undefined for a non-existent ID', () => {
            const result = getEvidence('00000000');
            expect(result).toBeUndefined();
        });
    });

    describe('isValidEvidenceId()', () => {
        it('should return true for a registered evidence ID', () => {
            const record = recordEvidence('env_check', {}, 'NODE_ENV=test');
            expect(isValidEvidenceId(record.id)).toBe(true);
        });

        it('should return false for a forged or non-existent ID', () => {
            expect(isValidEvidenceId('deadbeef')).toBe(false);
            expect(isValidEvidenceId('aaaabbbb')).toBe(false);
        });

        it('should return false for an empty string', () => {
            expect(isValidEvidenceId('')).toBe(false);
        });
    });

    describe('renderEvidenceTags()', () => {
        it('should replace a valid [EVID:id] tag with evidence details', () => {
            const record = recordEvidence('read_file', { path: '/root/test.ts' }, 'const x = 1;');
            const text = `The file was read. [EVID:${record.id}]`;
            const rendered = renderEvidenceTags(text);
            expect(rendered).toContain(`[Bukti: ${record.id}]`);
            expect(rendered).toContain(record.resultHash);
        });

        it('should mark an invalid [EVID:id] tag as invalid, not silently remove it', () => {
            const text = 'Here is forged evidence. [EVID:badf00d0]';
            const rendered = renderEvidenceTags(text);
            expect(rendered).toContain('BUKTI TIDAK VALID');
            expect(rendered).toContain('badf00d0');
        });

        it('should not alter text with no EVID tags', () => {
            const text = 'Normal AI response without any evidence tags.';
            const rendered = renderEvidenceTags(text);
            expect(rendered).toBe(text);
        });
    });

    describe('listEvidence()', () => {
        it('should return all recorded evidence records', () => {
            const before = listEvidence().length;
            recordEvidence('tool_x', {}, 'result x');
            recordEvidence('tool_y', {}, 'result y');
            const after = listEvidence();
            expect(after.length).toBeGreaterThanOrEqual(before + 2);
        });
    });
});
