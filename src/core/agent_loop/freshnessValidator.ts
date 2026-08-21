import { listEvidence } from './evidenceLedger.js';

function isSuccessfulTestEvidence(ev: ReturnType<typeof listEvidence>[number]): boolean {
    if (ev.tool === 'run_tests') return !/"status":"error"|"exitCode":(?:[1-9]|[1-9]\d+)/.test(ev.resultPreview);
    if (ev.tool !== 'shell_exec' && ev.tool !== 'exec') return false;

    const command = String(ev.args?.command || '');
    const isTestCommand = /\b(?:npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|jest|vitest|mocha|cypress|run_tests(?:\.sh)?|\.\/run_tests)\b/i.test(command);
    const failed = /"status":"error"|"exitCode":(?:[1-9]|[1-9]\d+)/.test(ev.resultPreview);
    return isTestCommand && !failed;
}

/**
 * Memeriksa apakah bukti penulisan/modifikasi file benar-benar menyentuh kode inti aplikasi.
 * File scratch, skrip sementara, dokumentasi, data, laporan, dan memory tidak mewajibkan unit test proyek.
 */
function isCoreCodeModification(ev: ReturnType<typeof listEvidence>[number]): boolean {
    if (ev.tool !== 'write_file' && ev.tool !== 'modify_file' && ev.tool !== 'edit_file' && ev.tool !== 'create_file') {
        return false;
    }
    const fileName = String(ev.args?.file || ev.args?.filePath || ev.args?.path || '');
    if (!fileName) return false;

    const normalized = fileName.replace(/\\/g, '/').toLowerCase();

    // 1. Abaikan file non-kode (dokumentasi, data, logs, reports)
    if (/\.(md|json|txt|csv|log|yaml|yml|svg|png|jpg|jpeg|gif)$/i.test(normalized)) {
        // Pengecualian: konfigurasi dependensi atau compiler inti
        if (!normalized.endsWith('package.json') && !normalized.endsWith('tsconfig.json')) {
            return false;
        }
    }

    // 2. Abaikan direktori scratch, skrip bantu, report, memory, dan folder tes
    if (
        normalized.includes('scratch/') ||
        normalized.includes('.tmp/') ||
        normalized.includes('tmp/') ||
        normalized.includes('temp/') ||
        normalized.includes('scripts/') ||
        normalized.includes('workspace/reports/') ||
        normalized.includes('workspace/memories/') ||
        normalized.includes('brain/') ||
        normalized.includes('tests/') ||
        normalized.includes('__tests__/') ||
        normalized.endsWith('.test.ts') ||
        normalized.endsWith('.spec.ts') ||
        normalized.endsWith('.test.js') ||
        normalized.endsWith('.spec.js')
    ) {
        return false;
    }

    // 3. Hanya anggap sebagai kode jika berekstensi bahasa pemrograman
    const isCodeFile = /\.(ts|js|mjs|cjs|jsx|tsx|go|rs|py|cpp|c|h)$/i.test(normalized);
    const isCorePath = normalized.startsWith('src/') || normalized.startsWith('lib/') || normalized.startsWith('core/') || !normalized.includes('/');

    return isCodeFile && isCorePath;
}

export function validateFreshness(): { allowed: boolean; reason?: string } {
    const evidenceList = listEvidence();

    // Cari index modifikasi kode terakhir dan tes terakhir
    let lastModIndex = -1;
    let lastTestIndex = -1;
    let hasModification = false;

    for (let i = 0; i < evidenceList.length; i++) {
        const ev = evidenceList[i];
        // Hanya verifikasi jika aksi menyentuh kode inti proyek
        if (isCoreCodeModification(ev)) {
            lastModIndex = i;
            hasModification = true;
        } else if (isSuccessfulTestEvidence(ev)) {
            lastTestIndex = i;
        }
    }

    // Jika tidak ada modifikasi pada kode inti, langsung lolos
    if (!hasModification) return { allowed: true };

    // Jika ada modifikasi kode inti tapi belum pernah dites
    if (lastTestIndex === -1) {
        return {
            allowed: false,
            reason: "Ada perubahan kode inti proyek yang belum diuji. Jalankan tes proyek yang relevan melalui tool 'run_tests' atau perintah test yang dikenali."
        };
    }

    // Jika modifikasi kode inti terjadi SETELAH tes terakhir (STALE EVIDENCE)
    if (lastModIndex > lastTestIndex) {
        return {
            allowed: false,
            reason: "Perubahan kode inti terjadi setelah tes terakhir, sehingga bukti tes sudah kadaluarsa. Jalankan kembali tes proyek yang relevan sebelum menutup tugas."
        };
    }

    return { allowed: true };
}
