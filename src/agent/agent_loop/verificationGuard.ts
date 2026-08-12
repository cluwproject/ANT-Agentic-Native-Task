// ============================================================================
// ANT — CLI Agent Loop — Verification Guard
// ============================================================================
// Modul ini menjalankan satu pemeriksaan sebelum teks assistant ditampilkan
// atau dipakai sebagai dasar laporan: apakah ada klaim "ini bukti" (hash,
// "berhasil dibaca", metadata screenshot, dsb.) yang TIDAK dirujuk lewat tag
// [EVID:id] yang valid ke evidenceLedger?
//
// Ini BUKAN filter kata kunci untuk sensor konten. Ini validator struktural:
// teks boleh membahas apa saja, tapi begitu bentuknya adalah klaim bukti
// forensik/verifikasi, klaim itu wajib bisa ditelusuri ke eksekusi tool
// nyata. Kalau tidak, respons ditolak dan loop diminta mengulang dengan
// instruksi eksplisit — bukan diam-diam meloloskan teks yang belum tentu
// benar.

import { isValidEvidenceId, getEvidence } from './evidenceLedger.js';
import fs from 'fs';
import path from 'path';

export interface GuardResult {
    passed: boolean;
    violations: string[];
}

// Pola yang menandakan teks sedang MENGKLAIM sesuatu sebagai bukti
// terverifikasi (hash, keberadaan file, metadata gambar) — bukan sekadar
// membahas konsep hash secara umum.
const EVIDENCE_CLAIM_PATTERNS: RegExp[] = [
    /\b[a-f0-9]{64}\b/i,                          // string yang berbentuk hash SHA-256
    /sha-?256\s*[:=]/i,                            // "SHA-256:" diikuti nilai
    /berhasil\s+dibaca/i,
    /file\s+berhasil/i,
    /dimensi\s*[:=]\s*\d+\s*[×x]\s*\d+/i,          // "Dimensi: 1024 x 768"
    /screenshot.*(berhasil|tersimpan|dibuat)/i,
    /status\s*[:=]\s*["']?(verified|terverifikasi)/i,
    
    // TDD & Auto-Grader Claim Patterns
    /tests?\s+passed/i,                            // "test passed"
    /all\s+tests\s+passing/i,                      // "all tests passing"
    /\d+\s+passing/i,                              // "3 passing"
    /coverage.*100%/i,                             // "100% coverage"
    /tes\s*(berhasil|lolos|sukses)/i               // "tes lolos"
];

/**
 * Cek apakah setiap kemunculan pola klaim-bukti di dalam teks berada dalam
 * jarak wajar dari tag [EVID:id] yang valid. Pendekatan sederhana: kalau
 * teks mengandung pola klaim bukti TAPI tidak mengandung satu pun tag
 * [EVID:xxxxxxxx] yang valid di seluruh teks, tandai sebagai pelanggaran.
 * (Deteksi sederhana ini sengaja konservatif — lebih baik false-positive
 * sesekali daripada meloloskan klaim palsu.)
 */
export function verifyEvidenceClaims(text: string): GuardResult {
    const violations: string[] = [];

    const evidTags = Array.from(text.matchAll(/\[EVID:([a-f0-9]{8})\]/g)).map(m => m[1]);

    // PENTING: validasi tag EVID berjalan TANPA SYARAT — tidak bergantung
    // pada apakah pola klaim-bukti lain terdeteksi. ID yang dikarang model
    // harus tertangkap bahkan kalau kalimat di sekitarnya terdengar biasa
    // saja (mis. "Hasil tersimpan. [EVID:deadbeef]" tanpa kata "hash" atau
    // "berhasil dibaca" sama sekali).
    const invalidTags = evidTags.filter(id => !isValidEvidenceId(id));
    if (invalidTags.length > 0) {
        violations.push(
            `Tag [EVID:id] merujuk ID yang tidak ada di ledger: ${invalidTags.join(', ')}. ` +
            `Ini menandakan model menulis ID palsu, bukan ID nyata dari hasil tool.`
        );
    }

    // CHECK REALITY: Verifikasi apakah file bukti modifikasi/pembuatan berkas benar-benar ada di disk
    const validTags = evidTags.filter(id => isValidEvidenceId(id));
    for (const id of validTags) {
        const record = getEvidence(id);
        if (record && (record.tool === 'modify_file' || record.tool === 'write_file')) {
            const fileName = record.args?.file;
            if (fileName) {
                const filePath = path.resolve(process.cwd(), 'workspace', fileName);
                if (!fs.existsSync(filePath)) {
                    violations.push(
                        `Berkas '${fileName}' yang diklaim telah ditulis/diubah pada [EVID:${id}] tidak ditemukan secara fisik di disk (Halusinasi terdeteksi).`
                    );
                }
            }
        }
        
        // INDEPENDENT GRADER untuk TDD Loop
        // Jika teks mengklaim "tes lolos" atau "passed", kita cek hasil preview eksekusi asli.
        const claimsTestPassed = text.match(/tests?\s+passed|tes\s*(berhasil|lolos)|passing/i);
        if (claimsTestPassed && record && (record.tool === 'shell_exec' || record.tool === 'run_tests')) {
            const preview = record.resultPreview || '';
            // Cek tanda-tanda kegagalan umum atau injeksi penolakan Semantic Grader
            const isError = preview.includes('FAIL') || 
                            preview.includes('ERR!') || 
                            preview.includes('failing') ||
                            preview.includes('[SEMANTIC GRADE FAILED]');
            
            if (isError) {
                violations.push(
                    `Peringatan Independent Grader: Anda mengklaim bahwa pengujian berhasil ("${claimsTestPassed[0]}"), tetapi bukti OS asli dari [EVID:${id}] menunjukkan adanya ERROR atau kegagalan (exit code non-zero). Jangan berbohong tentang hasil pengujian!`
                );
            }
        }
    }

    // Terpisah: kalau ada pola klaim-bukti (hash mentah, "berhasil dibaca",
    // dimensi, dsb) TAPI tidak ada tag EVID sama sekali, itu juga pelanggaran
    // — model menulis klaim bukti dalam bentuk bebas, bukan lewat mekanisme
    // resmi.
    const matchedClaimPatterns = EVIDENCE_CLAIM_PATTERNS.filter(p => p.test(text));
    if (matchedClaimPatterns.length > 0 && evidTags.length === 0) {
        violations.push(
            'Teks berisi klaim bukti (hash/status file/metadata) tanpa satu pun tag [EVID:id]. ' +
            'Klaim semacam ini tidak dapat ditelusuri ke eksekusi tool nyata.'
        );
    }

    return { passed: violations.length === 0, violations };
}

/**
 * Pesan yang dikirim balik ke model saat klaim bukti ditolak — memberi
 * instruksi eksplisit untuk memperbaiki, bukan hanya menghapus konten diam-diam.
 */
export function buildCorrectionMessage(violations: string[]): string {
    return (
        `[SYSTEM VERIFICATION GUARD]\n` +
        `Respons Anda ditolak karena mengandung klaim bukti yang tidak terverifikasi:\n` +
        violations.map(v => `- ${v}`).join('\n') +
        `\n\nAturan: Anda TIDAK boleh menulis hash, status "berhasil dibaca", "tes lolos", atau metadata file ` +
        `secara langsung. Jika Anda perlu menampilkan bukti, panggil tool yang relevan terlebih ` +
        `dahulu (mis. shell_exec untuk menjalankan tes), lalu rujuk hasilnya dengan tag ` +
        `[EVID:id] yang akan diberikan sistem setelah tool tersebut benar-benar dieksekusi. ` +
        `Jangan mengarang ID atau nilai apa pun, dan jangan memanipulasi kesimpulan hasil tes jika aslinya gagal.`
    );
}
