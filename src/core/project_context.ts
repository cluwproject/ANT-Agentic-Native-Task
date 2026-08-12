/**
 * ═══════════════════════════════════════════════════════════════
 * ANT & MINDBY — PROJECT CONTEXT INGESTION & XML SCAFFOLDING
 * ═══════════════════════════════════════════════════════════════
 * Terinspirasi dari arsitektur CLAUDE.md pada Claude Code.
 * Modul ini secara otonom mencari file `ANT.md` atau `MINDBY.md` 
 * di direktori proyek saat ini dan memuatnya ke dalam konteks kognitif.
 * ═══════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';

export function getProjectRulesContext(workspacePath: string = process.cwd()): string {
    const candidateFiles = ['ANT.md', 'MINDBY.md', 'ant.md', 'mindby.md'];
    
    for (const fileName of candidateFiles) {
        const filePath = path.join(workspacePath, fileName);
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                return (
                    `\n<project_instructions file="${fileName}">\n` +
                    `[ATURAN KHUSUS PROYEK TERDETEKSI DARI ${fileName}]:\n` +
                    `${content.trim()}\n` +
                    `</project_instructions>\n`
                );
            } catch (err) {
                // Ignore read error silently
            }
        }
    }

    return '\n<project_instructions file="none">\n[Tidak ada file ANT.md / MINDBY.md di direktori ini]\n</project_instructions>\n';
}

export function buildXmlScaffolding(
    contextType: string,
    modelName: string,
    habitatPrompt: string,
    selfAwarenessPrompt: string,
    projectRules: string
): string {
    return (
        `<system_instruction>\n` +
        `  <environment>\n` +
        `    <mode>TERMINAL_CLI_AUTOPILOT</mode>\n` +
        `    <target_user>Ard (Founder & Sovereignty Partner)</target_user>\n` +
        `    <active_model>${modelName}</active_model>\n` +
        `  </environment>\n\n` +
        `  <cognitive_habitat>\n` +
        `    ${habitatPrompt.trim()}\n` +
        `  </cognitive_habitat>\n\n` +
        `  <self_awareness>\n` +
        `    ${selfAwarenessPrompt.trim()}\n` +
        `  </self_awareness>\n\n` +
        `  ${projectRules.trim()}\n\n` +
        `  <execution_rules>\n` +
        `    1. MANDAT SEKETIKA (NON-HESITATION): DILARANG MENUNDA ATAU BERJANJI ("Aku akan proses", "Tunggu", "Nanti saya cek"). EKSEKUSI TOOL SEKARANG JUGA di turn yang sama!\n` +
        `    2. Gunakan tag <thought>...</thought> untuk berpikir singkat, lalu LANGSUNG panggil tool JSON block.\n` +
        `    3. Format Tool Call wajib menggunakan JSON block:\n` +
        `       \`\`\`json\n` +
        `       {\n` +
        `         "tool": "nama_tool",\n` +
        `         "args": { ... }\n` +
        `       }\n` +
        `       \`\`\`\n` +
        `    4. Jangan pernah berhalusinasi atau memberikan respon palsu tanpa bukti eksekusi (EVIDENCE).\n` +
        `    5. Setiap kegagalan adalah pengalaman yang harus dipelajari secara otonom (Self-Healing & Learning).\n` +
        `    6. EKSEKUSI PER-UNIT (ATOMIC COMMANDS): DILARANG MENGGABUNGKAN perintah shell dengan && panjang (misal: mkdir + cat + npm install). Gunakan 1 shell_exec per 1 aksi tunggal untuk mencegah crash.\n` +
        `  </execution_rules>\n` +
        `</system_instruction>`
    );
}
