import { listEvidence } from './evidenceLedger.js';

function isSuccessfulTestEvidence(ev: ReturnType<typeof listEvidence>[number]): boolean {
    if (ev.tool === 'run_tests') return !/"status":"error"|"exitCode":(?:[1-9]|[1-9]\d+)/.test(ev.resultPreview);
    if (ev.tool !== 'shell_exec' && ev.tool !== 'exec') return false;

    const command = String(ev.args?.command || '');
    const isTestCommand = /\b(?:npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|jest|vitest|mocha|cypress|run_tests(?:\.sh)?|\.\/run_tests)\b/i.test(command);
    const failed = /"status":"error"|"exitCode":(?:[1-9]|[1-9]\d+)/.test(ev.resultPreview);
    return isTestCommand && !failed;
}

export function validateFreshness(): { allowed: boolean; reason?: string } {
    const evidenceList = listEvidence();

    // Cari index modifikasi kode terakhir dan tes terakhir
    let lastModIndex = -1;
    let lastTestIndex = -1;
    let hasModification = false;

    for (let i = 0; i < evidenceList.length; i++) {
        const ev = evidenceList[i];
        // Tool yang memodifikasi sistem
        if (ev.tool === 'write_file' || ev.tool === 'modify_file' || ev.tool === 'edit_file') {
            lastModIndex = i;
            hasModification = true;
        } else if (isSuccessfulTestEvidence(ev)) {
            lastTestIndex = i;
        }
    }

    // Jika tidak ada modifikasi, langsung lolos
    if (!hasModification) return { allowed: true };

    // Jika ada modifikasi tapi belum pernah dites
    if (lastTestIndex === -1) {
        return {
            allowed: false,
            reason: "Ada perubahan kode yang belum diuji. Jalankan tes proyek yang relevan melalui tool 'run_tests' atau perintah test yang dikenali."
        };
    }

    // Jika modifikasi terjadi SETELAH tes terakhir (STALE EVIDENCE)
    if (lastModIndex > lastTestIndex) {
        return {
            allowed: false,
            reason: "Perubahan terjadi setelah tes terakhir, sehingga bukti tes sudah kadaluarsa. Jalankan kembali tes proyek yang relevan sebelum menutup tugas."
        };
    }

    return { allowed: true };
}
