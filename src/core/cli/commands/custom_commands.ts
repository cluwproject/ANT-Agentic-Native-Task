// ============================================================================
// ANT — CLI Commands — Custom Slash Commands (.ant/commands/*.md)
// ============================================================================
// Konvensi ala Claude Code custom commands: setiap file markdown di
// `.ant/commands/` menjadi slash command reusable yang bisa dishare antar
// anggota tim via Git.
//
//   .ant/commands/review.md  →  /review
//
// Format file:
//   ---
//   description: Review perubahan kode terakhir
//   ---
//   Prompt template... Gunakan $ARGUMENTS untuk menyisipkan argumen user.
//
// Saat dipanggil (`/review fokus ke auth`), seluruh body dikirim ke agent
// loop sebagai prompt dengan $ARGUMENTS diganti argumen user.
// ============================================================================

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { CliContext } from '../types.js';

export interface CustomCommandDef {
    name: string;          // tanpa leading '/', mis: "review"
    description: string;
    template: string;
    sourcePath: string;
}

let cache: CustomCommandDef[] | null = null;

/** Parse isi markdown command → {description, template}. */
export function parseCustomCommand(raw: string): { description: string; template: string } {
    let description = '';
    let template = raw.trim();

    const fmMatch = raw.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (fmMatch) {
        const frontmatter = fmMatch[1];
        template = fmMatch[2].trim();
        for (const line of frontmatter.split(/\r?\n/)) {
            const m = line.match(/^description\s*:\s*(.+)$/i);
            if (m) description = m[1].trim().replace(/^["']|["']$/g, '');
        }
    }
    // Fallback: baris komentar pertama <!-- ... --> atau # heading
    if (!description) {
        const htmlComment = template.match(/<!--\s*(.+?)\s*-->/);
        if (htmlComment) description = htmlComment[1].trim();
        else {
            const heading = template.match(/^#\s+(.+)$/m);
            if (heading) description = heading[1].trim();
        }
    }
    return { description, template };
}

/** Muat semua custom commands dari <baseDir>/.ant/commands/*.md (sync). */
export function listCustomCommands(baseDir: string = process.cwd(), forceReload = false): CustomCommandDef[] {
    if (cache && !forceReload) return cache;
    cache = [];
    const dir = path.join(baseDir, '.ant', 'commands');
    try {
        if (!fs.existsSync(dir)) return cache;
        for (const file of fs.readdirSync(dir)) {
            if (!file.toLowerCase().endsWith('.md')) continue;
            try {
                const full = path.join(dir, file);
                const raw = fs.readFileSync(full, 'utf-8');
                const parsed = parseCustomCommand(raw);
                cache.push({
                    name: path.basename(file).replace(/\.md$/i, '').toLowerCase(),
                    description: parsed.description || `Custom command dari ${file}`,
                    template: parsed.template,
                    sourcePath: full
                });
            } catch {
                // skip file rusak — jangan crash REPL
            }
        }
    } catch {
        // directory unreadable → kosong saja
    }
    return cache;
}

/** Ganti placeholder $ARGUMENTS dalam template. */
export function applyArguments(template: string, args: string): string {
    if (template.includes('$ARGUMENTS')) {
        return template.split('$ARGUMENTS').join(args);
    }
    return args ? `${template}\n\n[ARGUMENTS]: ${args}` : template;
}

/** Handler slash dispatch — return true jika text cocok dengan custom command. */
export async function handleCustomCommands(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('/')) return false;

    const spaceIdx = text.indexOf(' ');
    const cmdName = (spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)).toLowerCase();
    if (!cmdName) return false;

    const defs = listCustomCommands(ctx.baseDir || process.cwd());
    const def = defs.find(d => d.name === cmdName);
    if (!def) return false;

    const args = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();
    const prompt = applyArguments(def.template, args);

    console.log(chalk.magenta(`\n[CUSTOM COMMAND] ${def.sourcePath}`));
    console.log(chalk.dim('─'.repeat(Math.max(40, (process.stdout.columns || 80) - 2))));

    // Jalankan prompt hasil template lewat agent loop penuh (dengan tool access)
    const { runCliAgentLoop } = await import('../../agent_loop/index.js');
    const resultMessages = await runCliAgentLoop(prompt, ctx.history);
    if (Array.isArray(resultMessages)) {
        ctx.history = resultMessages;
    }

    // Invalidate cache agar file baru langsung dikenali di sesi berikutnya
    cache = null;
    return true;
}
