import { extractWatermark } from '../src/utils/watermark.js';
import fs from 'fs';

const filePath = process.argv[2];

if (!filePath) {
    console.error("Usage: npx tsx tools/verify_watermark.ts <path-to-text-file>");
    process.exit(1);
}

try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const watermark = extractWatermark(content);

    if (watermark) {
        console.log(`✅ [WATERMARK TERDETEKSI] Tulisan ini memiliki Provenance ANT!`);
        console.log(`   Payload: "${watermark}"`);
    } else {
        console.log(`❌ [TIDAK ADA WATERMARK] Tulisan ini bersih dari jejak ANT.`);
    }
} catch (e: any) {
    console.error(`Gagal membaca file: ${e.message}`);
}
