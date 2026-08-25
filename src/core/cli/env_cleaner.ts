import fs from 'fs';

/**
 * Memperbaiki dan merapikan file .env dari baris yang menempel/terkorupsi
 * Contoh: "ANT_BLAST_RADIUS_CHECK=trueCLI_CUSTOM_MODEL=stealth/ox-alpha"
 * dipecah menjadi:
 * ANT_BLAST_RADIUS_CHECK=true
 * CLI_CUSTOM_MODEL=stealth/ox-alpha
 */
export function sanitizeEnvContent(content: string): string {
    if (!content) return '';

    // 1. Pecah baris yang menempel secara regex
    let cleaned = content;
    
    // Pecah boolean/string yang langsung disambung nama variabel baru
    cleaned = cleaned.replace(/([^\n\r=]+=[^\n\r]+?)(CLI_[A-Z0-9_]+=|AI_[A-Z0-9_]+=|CUSTOM_[A-Z0-9_]+=|ANT_[A-Z0-9_]+=|OPENAI_[A-Z0-9_]+=|OPENROUTER_[A-Z0-9_]+=|GEMINI_[A-Z0-9_]+=|ANTHROPIC_[A-Z0-9_]+=)/g, '$1\n$2');

    // 2. Parse per baris untuk memastikan tidak ada duplikasi ganda atau nilai korup
    const lines = cleaned.split(/\r?\n/);
    const resultLines: string[] = [];

    for (const rawLine of lines) {
        let line = rawLine.trim();
        if (!line) {
            resultLines.push('');
            continue;
        }

        if (line.startsWith('#')) {
            resultLines.push(line);
            continue;
        }

        // Jika baris masih mengandung variabel lain di dalamnya (misal: "CUSTOM_MODEL=stealth/ox-alphaCLI_AI_PROVIDER=Ollama")
        const fusedMatch = line.match(/^([A-Z0-9_]+)=(.+?)(CLI_[A-Z0-9_]+|AI_[A-Z0-9_]+|CUSTOM_[A-Z0-9_]+)=(.+)$/);
        if (fusedMatch) {
            const [, k1, v1, k2, v2] = fusedMatch;
            resultLines.push(`${k1}=${v1.trim()}`);
            resultLines.push(`${k2}=${v2.trim()}`);
            continue;
        }

        resultLines.push(line);
    }

    return resultLines.join('\n').trim() + '\n';
}

/**
 * Membersihkan nilai environment string tunggal dari residu variabel lain yang menempel
 */
export function sanitizeEnvValue(value: string | undefined): string {
    if (!value) return '';
    // Jika value mengandung potongan nama variabel lain yang menempel
    const match = value.match(/^([^=]+?)(?:CLI_[A-Z0-9_]+|AI_[A-Z0-9_]+|CUSTOM_[A-Z0-9_]+)/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return value.trim();
}

/**
 * Jalankan self-healing pada file .env fisik jika ditemukan anomali
 */
export function autoHealEnvFile(filePath: string): boolean {
    if (!filePath || !fs.existsSync(filePath)) return false;
    try {
        const original = fs.readFileSync(filePath, 'utf-8');
        const sanitized = sanitizeEnvContent(original);
        if (original !== sanitized) {
            fs.writeFileSync(filePath, sanitized, 'utf-8');
            return true;
        }
    } catch {}
    return false;
}
