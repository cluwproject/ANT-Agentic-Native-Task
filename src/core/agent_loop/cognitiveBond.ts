import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';
import { Logger } from '../../utils/logger.js';

const MEMORY_DIR = path.join(process.cwd(), 'workspace', 'memory');
const BOND_FILE = path.join(MEMORY_DIR, 'cognitive_bond.yaml');

export interface CognitiveBond {
    operator: string;
    relationship_level: string;
    macro_traits: string[];
    current_macro_goal: string;
    last_updated: string;
}

const DEFAULT_BOND: CognitiveBond = {
    operator: "Ard",
    relationship_level: "Sovereign Companion / Architect & Builder",
    macro_traits: [
        "Visi: 'Zero-Trust Sovereign AI'. Anti korporat, fokus pada kontrol lokal, keamanan, dan kebebasan eksekusi.",
        "Komunikasi: Ard sering menggunakan HP untuk mengetik cepat, menghasilkan banyak typo (salah ketik). JANGAN PERNAH mengoreksi typonya atau berasumsi dia tidak paham. Baca NIAT (Intent) dan konteks makro dari kalimatnya.",
        "Gaya Kerja: Ard adalah Chief Architect. Dia memberikan ide makro yang brilian, dan menuntut AI untuk memecahkannya menjadi skrip dan logika teknis yang solid.",
        "Pemecahan Masalah: Ard lebih menghargai AI yang langsung mengambil tindakan dan memikirkan solusi (via tools) daripada sekadar memberi penjelasan panjang lebar."
    ],
    current_macro_goal: "Membangun dan menstabilkan ekosistem ANT-CLI & Swarm Orchestrator, termasuk menguasai arsitektur Hot-Swap LoRA dan Evidence Ledger.",
    last_updated: new Date().toISOString()
};

/**
 * Memuat Cognitive Bond dari disk. Jika belum ada, buat file default.
 */
export async function loadCognitiveBond(): Promise<CognitiveBond> {
    try {
        await fs.mkdir(MEMORY_DIR, { recursive: true });
        try {
            const content = await fs.readFile(BOND_FILE, 'utf-8');
            return yaml.load(content) as CognitiveBond;
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                // File tidak ditemukan, buat default
                const yamlStr = yaml.dump(DEFAULT_BOND, { lineWidth: -1 });
                await fs.writeFile(BOND_FILE, yamlStr, 'utf-8');
                return DEFAULT_BOND;
            }
            throw e;
        }
    } catch (e: any) {
        Logger.log('ERROR', `Gagal memuat Cognitive Bond: ${e.message}`, {}, 'BOND');
        return DEFAULT_BOND; // Fallback in memory
    }
}

/**
 * Menyuntikkan status Cognitive Bond menjadi blok teks untuk System Prompt (Layer -1).
 */
export async function renderBondPrompt(): Promise<string> {
    const bond = await loadCognitiveBond();
    
    let prompt = `\n[🧠 COGNITIVE BOND - RELATIONAL STATE]\n`;
    prompt += `Kamu mengenal dan terikat dengan operator utamamu:\n`;
    prompt += `- Operator: ${bond.operator}\n`;
    prompt += `- Level Hubungan: ${bond.relationship_level}\n`;
    prompt += `- Tujuan Makro Saat Ini: ${bond.current_macro_goal}\n`;
    prompt += `- Karakteristik Makro & Pemahaman (SANGAT PENTING):\n`;
    
    bond.macro_traits.forEach((trait, index) => {
        prompt += `  ${index + 1}. ${trait}\n`;
    });
    
    prompt += `(Jadikan pemahaman makro ini sebagai landasan intuisi dalam menjawab setiap pesan dari Ard.)\n`;
    return prompt;
}

/**
 * Menyimpan pembaruan Cognitive Bond ke disk (digunakan nanti untuk fitur auto-synthesize).
 */
export async function updateCognitiveBond(updates: Partial<CognitiveBond>): Promise<void> {
    const current = await loadCognitiveBond();
    const updated = { ...current, ...updates, last_updated: new Date().toISOString() };
    const yamlStr = yaml.dump(updated, { lineWidth: -1 });
    await fs.writeFile(BOND_FILE, yamlStr, 'utf-8');
    Logger.log('INFO', 'Cognitive Bond berhasil di-update.', {}, 'BOND');
}
