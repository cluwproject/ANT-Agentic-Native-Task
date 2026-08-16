// ============================================================================
// ANT — CLI Agent Loop — Evidence Ledger
// ============================================================================
// LATAR BELAKANG (insiden yang memicu modul ini):
// Model pernah menulis narasi "berhasil membaca file" lengkap dengan hash
// SHA-256 dan metadata screenshot yang TIDAK PERNAH benar-benar dihasilkan
// oleh tool apa pun — murni karangan teks yang polanya meyakinkan (nama
// file masuk akal, format hash 64 hex char) tapi salah secara faktual
// (hash-nya punya ekor berpola naik berurutan, mustahil dari fungsi hash
// kriptografi asli).
//
// ATURAN KERAS YANG DITEGAKKAN MODUL INI:
//   1. Hash SHA-256 tidak pernah dihitung atau ditulis oleh model. Hash
//      HANYA dihitung oleh kode ini sendiri (Node crypto), dari isi hasil
//      tool yang benar-benar dikembalikan oleh executeAction().
//   2. Setiap hasil tool yang "berbasis file/bukti" dicatat sebagai
//      EvidenceRecord dengan ID unik. Model hanya boleh MERUJUK bukti lewat
//      tag [EVID:id] di teksnya — tidak pernah menuliskan ulang isi/hash-nya
//      sendiri. Tag ini disubstitusi oleh sistem, bukan oleh model.
//   3. Kalau model menulis sesuatu yang terlihat seperti klaim bukti (hash,
//      "berhasil dibaca", dimensi gambar, dsb) TANPA tag [EVID:id] yang
//      valid, itu diblokir oleh verificationGuard.ts (lihat file itu).

import { createHash } from 'crypto';

export interface EvidenceRecord {
    id: string;              // 8 karakter hex, dipakai di tag [EVID:xxxxxxxx]
    tool: string;
    args: Record<string, any>;
    resultHash: string;      // SHA-256 asli, dihitung dari resultRaw
    resultPreview: string;   // potongan hasil untuk ditampilkan (bukan hash)
    resultSizeBytes: number;
    createdAt: string;       // ISO timestamp, dibuat oleh sistem
}

// In-memory per proses. Untuk lintas-sesi/persisten, ganti backing store ini
// (mis. simpan ke file/SQLite) tanpa mengubah API publiknya.
const ledger = new Map<string, EvidenceRecord>();

function generateEvidenceId(): string {
    // ID pendek tapi cukup unik untuk satu sesi kerja; bukan pengganti hash.
    return createHash('sha256')
        .update(`${Date.now()}-${Math.random()}`)
        .digest('hex')
        .slice(0, 8);
}

/**
 * Catat hasil tool sebagai bukti terverifikasi. Dipanggil HANYA dari
 * agentLoop.ts / browserTool.ts, tepat setelah executeAction() atau aksi
 * Playwright sukses — tidak pernah dipanggil berdasarkan klaim dari teks
 * model.
 *
 * Menerima string, object (di-JSON.stringify), ATAU Buffer mentah (mis.
 * byte PNG screenshot). Untuk Buffer, hash dihitung langsung dari byte
 * aslinya — bukan dari deskripsi/metadata tentang Buffer itu — supaya bukti
 * visual (screenshot) sama kuatnya dengan bukti tekstual (file/API result).
 */
export function recordEvidence(tool: string, args: Record<string, any>, result: any): EvidenceRecord {
    const isBuffer = Buffer.isBuffer(result);
    const resultRaw: string | Buffer = isBuffer ? result : (typeof result === 'string' ? result : JSON.stringify(result));
    const resultHash = createHash('sha256').update(resultRaw).digest('hex');
    const resultSizeBytes = Buffer.isBuffer(resultRaw) ? resultRaw.length : Buffer.byteLength(resultRaw, 'utf8');
    const resultPreview = isBuffer
        ? `<binary data, ${resultSizeBytes} bytes>`
        : (resultRaw as string).length > 300 ? (resultRaw as string).slice(0, 300) + '...' : (resultRaw as string);

    const record: EvidenceRecord = {
        id: generateEvidenceId(),
        tool,
        args,
        resultHash,
        resultPreview,
        resultSizeBytes,
        createdAt: new Date().toISOString()
    };

    ledger.set(record.id, record);
    return record;
}

export function getEvidence(id: string): EvidenceRecord | undefined {
    return ledger.get(id);
}

export function listEvidence(): EvidenceRecord[] {
    return Array.from(ledger.values());
}

/** Dipakai verificationGuard untuk cek apakah suatu ID valid dan nyata. */
export function isValidEvidenceId(id: string): boolean {
    return ledger.has(id);
}

/**
 * Render tag [EVID:id] dalam teks jadi data asli dari ledger. Ini satu-
 * satunya jalur yang boleh menampilkan hash/detail bukti ke user — nilainya
 * selalu diambil dari ledger, TIDAK PERNAH dari teks yang ditulis model.
 * Tag yang mengacu ID tidak valid diganti dengan penanda error, bukan
 * dihapus diam-diam (supaya kegagalan terlihat, bukan tersembunyi).
 */
export function renderEvidenceTags(text: string): string {
    const foundRecords: EvidenceRecord[] = [];
    
    let processedText = text.replace(/\[EVID:([a-f0-9]{8})\]/g, (_match, id) => {
        const record = getEvidence(id);
        if (!record) {
            return `[BUKTI TIDAK VALID: ID '${id}']`;
        }
        if (!foundRecords.includes(record)) {
            foundRecords.push(record);
        }
        return `[Bukti: ${id}]`;
    });

    if (foundRecords.length > 0) {
        processedText += `\n\n---\n**Lampiran Bukti Sistem Terverifikasi:**\n\n`;
        foundRecords.forEach(record => {
            const safePreview = record.resultPreview.replace(/\n/g, ' ').substring(0, 100);
            processedText += (
                `> **[${record.id}]** | Tool: \`${record.tool}\`\n` +
                `> SHA-256: \`${record.resultHash}\`\n` +
                `> Ukuran: ${record.resultSizeBytes} bytes | Waktu: ${record.createdAt}\n` +
                `> Preview: \`${safePreview}...\`\n\n`
            );
        });
    }

    return processedText;
}
