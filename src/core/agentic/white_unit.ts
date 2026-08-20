import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { Logger } from '../../utils/logger.js';
import { chat } from '../ai/index.js';
import { MissionBlackboard } from './swarm_orchestrator.js';

const BLACKBOARD_DIR = path.join(process.cwd(), 'workspace', 'missions');
const REPORTS_DIR = path.join(process.cwd(), 'workspace', 'reports');

export async function launchWhiteUnitReport(mission_id: string, brain: any): Promise<string | null> {
    try {
        console.log(chalk.cyan(`\n[WHITE UNIT] Memulai penyusunan laporan untuk misi: ${mission_id}`));
        
        // 1. Baca data dari Blackboard
        const missionPath = path.join(BLACKBOARD_DIR, `${mission_id}.json`);
        const rawData = await fs.readFile(missionPath, 'utf-8');
        const board: MissionBlackboard = JSON.parse(rawData);
        
        if (board.findings.length === 0) {
            console.log(chalk.yellow(`  [WHITE UNIT] Tidak ada temuan (CLEAN). Laporan tidak diperlukan.`));
            return null;
        }

        // 2. Siapkan Prompt Pelaporan
        const systemPrompt = `Kamu adalah WHITE UNIT (Compliance & Reporting Agent).
Tugasmu mengambil log mentah JSON dari pencarian kerentanan (Finding Cards) dan mengubahnya menjadi Executive Summary & Technical Report berformat Markdown.
Gunakan format profesional:
1. Executive Summary (Gambaran Umum)
2. Risk Assessment (Penilaian Risiko)
3. Detail Temuan (Formatkan dengan rapi, petakan ke kategori OWASP jika memungkinkan)
4. Rekomendasi Remediasi (Tindakan Perbaikan)

Data Misi:
Goal: ${board.goal}
Total Temuan: ${board.findings.length}
Data Mentah Temuan:
${JSON.stringify(board.findings, null, 2)}
`;

        const messages = [{ role: 'user', content: 'Tolong buatkan Laporan Audit Keamanan berdasarkan data misi ini.' }];
        
        console.log(chalk.dim(`  ▸ Menyusun struktur dan analisis menggunakan model...`));
        const modelToUse = process.env.ANT_SWARM_MODEL || 'qwen2.5:1.5b';
        
        // 3. Panggil Model
        const responseText = await chat(
            brain,
            messages,
            [],
            {},
            systemPrompt,
            modelToUse,
            'Swarm:white-unit'
        );

        // 4. Simpan Laporan
        await fs.mkdir(REPORTS_DIR, { recursive: true });
        const reportFilename = `${mission_id}_audit_report.md`;
        const reportPath = path.join(REPORTS_DIR, reportFilename);
        
        await fs.writeFile(reportPath, responseText.content);
        
        console.log(chalk.green(`  ✓ Laporan berhasil dibuat: ${reportPath}`));
        return reportPath;

    } catch (e: any) {
        Logger.log('ERROR', `White Unit failed: ${e.message}`, {}, 'SWARM');
        console.log(chalk.red(`  [WHITE UNIT ERROR] Gagal menyusun laporan: ${e.message}`));
        return null;
    }
}
