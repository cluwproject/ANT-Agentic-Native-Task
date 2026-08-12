import { listEvidence } from './evidenceLedger.js';

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
        } else if (ev.tool === 'run_tests') {
            lastTestIndex = i;
        }
    }

    // Jika tidak ada modifikasi, langsung lolos
    if (!hasModification) return { allowed: true };

    // Jika ada modifikasi tapi belum pernah dites
    if (lastTestIndex === -1) {
        return { 
            allowed: false, 
            reason: "Anda telah memodifikasi sistem atau kode tetapi belum menjalankan 'run_tests' sama sekali." 
        };
    }

    // Jika modifikasi terjadi SETELAH tes terakhir (STALE EVIDENCE)
    if (lastModIndex > lastTestIndex) {
        return { 
            allowed: false, 
            reason: "Anda melakukan modifikasi (write/edit/shell) SETELAH tes terakhir dijalankan. Bukti tes Anda sudah KADALUARSA (Stale Evidence). Anda wajib memanggil 'run_tests' kembali untuk membuktikan perubahan terbaru Anda tidak merusak sistem." 
        };
    }

    return { allowed: true };
}
