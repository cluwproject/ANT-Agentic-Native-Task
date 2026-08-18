// ============================================================================
// ANT — Unit Tests — Verification Guard
// ============================================================================
// Tests that the guard correctly blocks hallucinated evidence claims
// and passes legitimate responses through cleanly.

import { verifyEvidenceClaims } from '../../src/core/agent_loop/verificationGuard.js';
import { recordEvidence } from '../../src/core/agent_loop/evidenceLedger.js';

describe('VerificationGuard', () => {

    describe('verifyEvidenceClaims() — SHOULD PASS', () => {
        it('should pass a clean AI response with no evidence claims', () => {
            const text = 'I can help you understand how SHA-256 works in general. It is a cryptographic hash function.';
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(true);
            expect(result.violations).toHaveLength(0);
        });

        it('should pass when a SHA-256 hash is paired with a valid EVID tag', () => {
            const record = recordEvidence('read_file', { path: '/tmp/audit.js' }, 'console.log("vulnerable");');
            const text = `File was read. SHA-256: ${record.resultHash} [EVID:${record.id}]`;
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(true);
        });

        it('should pass a normal conversational response', () => {
            const text = 'Based on the context, you should refactor this function into smaller components.';
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(true);
        });
    });

    describe('verifyEvidenceClaims() — SHOULD BLOCK (Hallucination Prevention)', () => {
        it('should block a response claiming a SHA-256 hash without a valid EVID tag', () => {
            const fakeHash = 'a'.repeat(64); // 64 hex chars — looks like SHA-256 but is fabricated
            const text = `File was read. SHA-256: ${fakeHash}`;
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(false);
            expect(result.violations.length).toBeGreaterThan(0);
        });

        it('should block a response with a fabricated [EVID:id] tag not in the ledger', () => {
            const text = 'Screenshot taken successfully. [EVID:deadbeef]';
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(false);
        });

        it('should block a response claiming "berhasil dibaca" without EVID proof', () => {
            const text = 'File berhasil dibaca dan isinya adalah konfigurasi penting.';
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(false);
        });

        it('should block a response claiming "screenshot berhasil" without EVID proof', () => {
            const text = 'Screenshot berhasil diambil dari halaman login.';
            const result = verifyEvidenceClaims(text);
            expect(result.passed).toBe(false);
        });
    });
});
