// ============================================================================
// ANT — CLI Agent Loop — Tool Call Parser
// ============================================================================

import type { ToolCall } from './types.js';

export interface ParseResult {
    toolCalls: ToolCall[];
    cleanedText: string;
    parseError: boolean;
}

function cleanJsonString(str: string): string {
    return str
        .trim()
        .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
        .replace(/(?:\r\n|\r|\n)/g, '\n');
}

function tryParseJson(str: string): any {
    try {
        return JSON.parse(str);
    } catch {
        try {
            // Attempt repair for unescaped newlines inside strings
            const sanitized = str.replace(/(?<=:\s*"[^"]*)\n(?=[^"]*")/g, '\\n');
            return JSON.parse(sanitized);
        } catch {
            return null;
        }
    }
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

    // 1. Prioritaskan format tag <action>...</action> (Format ANT Native v2 & ChatML)
    const actionRegex = /<action>\s*([\s\S]*?)\s*<\/action>/gi;
    let match;
    while ((match = actionRegex.exec(cleaned)) !== null) {
        const rawAction = match[1].trim();
        const parsed = tryParseJson(rawAction);
        if (parsed) {
            const toolName = parsed.tool || parsed.name || parsed.action;
            const toolArgs = parsed.args || parsed.arguments || parsed.parameters || parsed;
            if (toolName && typeof toolName === 'string') {
                toolCalls.push({ tool: toolName, args: toolArgs });
                cleaned = cleaned.replace(match[0], '');
                continue;
            }
        }
        parseError = true;
    }

    // 2. Fenced code blocks: ```json ... ``` atau ``` ... ```
    const fencedRegex = /\`\`\`(?:json)?\s*\n([\s\S]*?)\n\`\`\`/gi;
    while ((match = fencedRegex.exec(cleaned)) !== null) {
        const blockContent = match[1].trim();
        if (blockContent.includes('"tool"') || blockContent.includes('"name"') || blockContent.includes('"action"')) {
            const parsed = tryParseJson(cleanJsonString(blockContent));
            if (parsed) {
                const toolName = parsed.tool || parsed.name || parsed.action;
                const toolArgs = parsed.args || parsed.arguments || parsed.parameters || parsed;
                if (toolName && typeof toolName === 'string') {
                    toolCalls.push({ tool: toolName, args: toolArgs });
                    cleaned = cleaned.replace(match[0], '');
                    continue;
                }
            }
            parseError = true;
        }
    }

    // 3. Fallback: brace-matching scan (Mencari semua blok JSON mandiri)
    let candidate: string | null;
    while ((candidate = extractFirstBalancedJsonWithKey(cleaned, ['tool', 'name', 'action'])) !== null) {
        const parsed = tryParseJson(cleanJsonString(candidate));
        if (parsed) {
            const toolName = parsed.tool || parsed.name || parsed.action;
            const toolArgs = parsed.args || parsed.arguments || parsed.parameters || parsed;
            
            if (toolName && typeof toolName === 'string') {
                toolCalls.push({ tool: toolName, args: toolArgs });
                cleaned = cleaned.replace(candidate, '');
                continue;
            }
        }
        // Hapus kandidat agar tidak terjadi infinite loop
        cleaned = cleaned.replace(candidate, '');
    }

    // 4. Deteksi kegagalan format sintaksis (misal model menulis "Langkah 1: Menulis script" tanpa code block yang valid)
    if (toolCalls.length === 0) {
        if (/\{\s*"(?:tool|action|name)"\s*:/i.test(cleaned)) {
            parseError = true;
        }
    }

    return { toolCalls, cleanedText: cleaned.trim(), parseError };
}

/**
 * Cari objek JSON valid pertama dalam teks yang mengandung salah satu key tertentu.
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
                    break;
                }
            }
        }
    }
    return null;
}

/**
 * Konversi native tool calls dari provider API (OpenAI/Anthropic/Gemini)
 * ke format ToolCall internal ANT. Lebih andal daripada parsing JSON block
 * karena struktur sudah terjamin oleh API provider.
 */
export function nativeCallsToToolCalls(native: any[] | undefined | null): ToolCall[] {
    if (!Array.isArray(native)) return [];
    const calls: ToolCall[] = [];
    for (const nc of native) {
        const name = nc?.name || nc?.tool;
        if (typeof name !== 'string' || !name) continue;
        let args: Record<string, any> = {};
        const rawArgs = nc.args ?? nc.arguments ?? nc.input ?? {};
        if (typeof rawArgs === 'string') {
            try { args = JSON.parse(rawArgs); } catch { args = {}; }
        } else if (rawArgs && typeof rawArgs === 'object') {
            args = rawArgs;
        }
        calls.push({ tool: name, args });
    }
    return calls;
}
