// ============================================================================
// ANT-CYBER-CORPS — Steganography Watermark Engine
// ============================================================================
// Modul ini menyisipkan "Watermark Tak Kasat Mata" (Zero-Width Characters)
// ke dalam teks output ANT. 
//
// Cara kerja:
// 1. Teks "ANT-ORIGIN" diubah ke biner (0 dan 1).
// 2. '0' dipetakan ke Zero-Width Space (\u200B).
// 3. '1' dipetakan ke Zero-Width Non-Joiner (\u200C).
// 4. Pembatas antar karakter dipetakan ke Zero-Width Joiner (\u200D).
// 5. String tak terlihat ini disisipkan di akhir laporan.
//
// Jika laporan di-copy-paste ke blog atau platform lain, karakter ini
// akan terbawa dan bisa dibuktikan keasliannya oleh ANT.
// ============================================================================

const ZWSP = '\u200B'; // Zero-Width Space (0)
const ZWNJ = '\u200C'; // Zero-Width Non-Joiner (1)
const ZWJ  = '\u200D'; // Zero-Width Joiner (Delimiter)

const WATERMARK_PAYLOAD = "ANT-ORIGIN-CLUW";

/**
 * Konversi teks biasa ke string Zero-Width Characters
 */
function textToZeroWidth(text: string): string {
    return text.split('').map(char => {
        const binary = char.charCodeAt(0).toString(2).padStart(8, '0');
        return binary.split('').map(bit => (bit === '0' ? ZWSP : ZWNJ)).join('');
    }).join(ZWJ);
}

/**
 * Ekstrak Zero-Width Characters kembali ke teks biasa
 */
function zeroWidthToText(zeroWidthStr: string): string {
    if (!zeroWidthStr) return '';
    
    return zeroWidthStr.split(ZWJ).map(encodedChar => {
        const binary = encodedChar.split('').map(char => {
            if (char === ZWSP) return '0';
            if (char === ZWNJ) return '1';
            return '';
        }).join('');
        
        if (binary.length !== 8) return '';
        return String.fromCharCode(parseInt(binary, 2));
    }).join('');
}

/**
 * Tambahkan watermark ke akhir string.
 */
export function injectWatermark(content: string): string {
    const hidden = textToZeroWidth(WATERMARK_PAYLOAD);
    return content + hidden;
}

/**
 * Deteksi dan kembalikan pesan watermark dari sebuah string jika ada.
 * Mengembalikan null jika tidak ada watermark ANT.
 */
export function extractWatermark(content: string): string | null {
    // Cari rentetan karakter Zero-Width di mana saja dalam teks
    const regex = new RegExp(`[${ZWSP}${ZWNJ}${ZWJ}]+`, 'g');
    const matches = content.match(regex);
    
    if (!matches) return null;

    // Ambil rentetan zero-width terpanjang (asumsi itu payload kita)
    const longestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
    const decoded = zeroWidthToText(longestMatch);
    
    if (decoded.includes('ANT-ORIGIN')) {
        return decoded;
    }
    
    return null;
}
