// ============================================================================
// ANT — CLI Agent Loop — Tool Call Parser
// ============================================================================
// CATATAN ARSITEKTUR:
// Versi lama memakai indexOf('{') sampai lastIndexOf('}') — bisa salah tangkap
// kalau ada lebih dari satu blok {...} dalam teks (mis. model menjelaskan
// format JSON sebagai contoh sebelum benar-benar memanggil tool).
//
// Modul ini menggantinya dengan dua strategi lebih andal:
//  1. Fenced code block (\`\`\`json ... \`\`\`) — prioritas utama, format yang
//     diminta di system instruction.
//  2. Brace-counting scan yang menghormati string literal dan nested object —
//     fallback jika model tidak memakai fenced block.

import type { ToolCall } from './types.js';

export interface ParseResult {
    toolCalls: ToolCall[];
    cleanedText: string;
    parseError: boolean;
}

export function parseToolCall(rawResponse: string): ParseResult {
    let cleaned = rawResponse
        .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
        .replace(/\]<\]minimax\[>\[/gi, '')
        .replace(/<\|?tool_call\|?>/gi, '')
        .replace(/<\/tool_call>/gi, '')
        .trim();

    const toolCalls: ToolCall[] = [];
    let parseError = false;

    // 1. Prioritaskan fenced code block eksplisit (Bisa lebih dari satu)
    const fencedRegex = /\`\`\`(?:json)?\n([\s\S]*?)\n\`\`\`/g;
    let match;
    while ((match = fencedRegex.exec(cleaned)) !== null) {
        if (match[1].includes('"tool"') || match[1].includes('"name"')) {
            try {
                const parsed = JSON.parse(match[1]);
                const toolName = parsed.tool || parsed.name;
                const toolArgs = parsed.args || parsed.arguments || parsed.parameters || {};
                if (toolName && typeof toolName === 'string') {
                    toolCalls.push({ tool: toolName, args: toolArgs });
                    // Hapus block ini agar tidak double-parsed di fallback
                    cleaned = cleaned.replace(match[0], '');
                }
            } catch {
                parseError = true;
            }
        }
    }

    // 2. Fallback: brace-matching scan (Mencari semua blok JSON yang tersisa)
    let candidate: string | null;
    while ((candidate = extractFirstBalancedJsonWithKey(cleaned, ['tool', 'name'])) !== null) {
        try {
            const parsed = JSON.parse(candidate);
            const toolName = parsed.tool || parsed.name;
            const toolArgs = parsed.args || parsed.arguments || parsed.parameters || {};
            
            if (toolName && typeof toolName === 'string') {
                toolCalls.push({ tool: toolName, args: toolArgs });
                cleaned = cleaned.replace(candidate, '');
            } else {
                // Hapus agar loop while tidak infinite
                cleaned = cleaned.replace(candidate, '');
            }
        } catch {
            parseError = true;
            cleaned = cleaned.replace(candidate, '');
        }
    }

    return { toolCalls, cleanedText: cleaned.trim(), parseError };
}

/**
 * Cari objek JSON valid pertama dalam teks yang mengandung salah satu key tertentu,
 * dengan brace-counting yang benar (menghitung ulang setiap kali menemukan
 * '{' baru sebagai titik awal, mengabaikan kurung kurawal di dalam string
 * literal, dan menghormati escape character).
 */
function extractFirstBalancedJsonWithKey(text: string, requiredKeys: string[]): string | null {
    for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = start; i < text.length; i++) {
            const ch = text[i];

            if (escapeNext) { escapeNext = false; continue; }
            if (ch === '\\') { escapeNext = true; continue; }
            if (ch === '"') { inString = !inString; continue; }
            if (inString) continue;

            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const candidate = text.substring(start, i + 1);
                    if (requiredKeys.some(key => candidate.includes(`"${key}"`))) {
                        return candidate;
                    }
                    break; // objek ini tidak relevan, lanjut cari '{' berikutnya
                }
            }
        }
    }
    return null;
}
