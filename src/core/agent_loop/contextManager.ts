// ============================================================================
// ANT — CLI Agent Loop — Context Manager
// ============================================================================
// Loop lama mendorong seluruh riwayat pesan tanpa batas ke setiap panggilan
// tieredChat, dan memotong hasil tool di 5000 karakter tanpa penanda.
// Untuk sesi panjang mendekati MAX_ATTEMPTS, ini membengkakkan context window.
//
// Modul ini opsional — jika LoopOptions.maxContextMessages tidak diisi,
// perilaku sama persis seperti versi lama (tidak ada pemangkasan).

import type { ChatMessage } from './types.js';

export const DEFAULT_MAX_TOOL_RESULT_CHARS = 5000;

/**
 * Potong hasil tool yang terlalu panjang, dengan penanda eksplisit berapa
 * karakter yang hilang — versi lama memotong diam-diam sehingga model tidak
 * tahu datanya terpotong dan bisa membuat kesimpulan salah dari JSON yang
 * setengah jalan.
 */
export function truncateToolResult(resultStr: string, maxChars = DEFAULT_MAX_TOOL_RESULT_CHARS): string {
    if (resultStr.length <= maxChars) return resultStr;
    const hidden = resultStr.length - maxChars;
    return resultStr.slice(0, maxChars) + `\n...[HASIL DIPOTONG: ${hidden} karakter tersembunyi dari total ${resultStr.length}]`;
}

/**
 * Pangkas riwayat pesan agar tidak tumbuh tanpa batas selama loop berjalan.
 * Strategi: pertahankan 2 pesan pertama (konteks awal + instruksi user),
 * pertahankan N pesan terakhir secara utuh, dan ganti bagian tengah dengan
 * satu penanda ringkasan supaya model tahu ada riwayat yang dipotong
 * (bukan diam-diam hilang).
 */
export function boundMessages(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
    if (messages.length <= maxMessages) return messages;

    const head = messages.slice(0, 2);
    const tailCount = Math.max(1, maxMessages - head.length - 1); // -1 untuk slot ringkasan
    const tail = messages.slice(-tailCount);
    const middleCount = messages.length - head.length - tail.length;

    if (middleCount <= 0) return messages;

    const summaryMarker: ChatMessage = {
        role: 'user',
        content: `[SYSTEM] ${middleCount} pesan lama dipangkas dari riwayat untuk menjaga context window. Fokus pada instruksi awal dan progres terbaru di bawah.`
    };

    return [...head, summaryMarker, ...tail];
}
