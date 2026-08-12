// ============================================================================
// ANT — CLI Agent Loop — Entry Point (Compatibility Facade)
// ============================================================================
// File ini menjaga kompatibilitas dengan signature lama:
//   runCliAgentLoop(initialMessage, contextMsgs) → Promise<messages[]>
//   closeCli()
//   askUser(query)
// supaya pemanggil existing di codebase (mis. cli.ts) tidak perlu diubah.
//
// Di baliknya, sekarang memakai struktur modular:
//   ui.ts / toolCallParser.ts / permissions.ts / contextManager.ts / agentLoop.ts
//
// Jika ingin hasil lengkap (completed/cancelled/attemptsUsed, bukan hanya
// array pesan mentah), gunakan runCliAgentLoopDetailed().

import readline from 'readline';
import type { ChatMessage, LoopOptions } from './types.js';
import { runCliAgentLoop as runCoreLoop } from './agentLoop.js';

const completer = (line: string) => {
    const commands = [
        '/new_chat', '/clear', '/help', '/exit', '/quit', 
        '/loop start', '/loop stop', '/sessions', '/session load', '/resume',
        '/plugin', '!npm', '!ls', '!pwd', '!node'
    ];
    const hits = commands.filter((c) => c.startsWith(line.toLowerCase()));
    if (line.startsWith('/') || line.startsWith('!')) {
        return [hits.length ? hits : commands, line];
    }
    return [[], line];
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer
});

let resolvePrompt: ((val: string) => void) | null = null;
let inputBuffer: string[] = [];
let pasteTimer: NodeJS.Timeout | null = null;
let linesInCurrentBurst = 0;

rl.on('line', (line) => {
    if (!resolvePrompt) return;
    
    inputBuffer.push(line);
    linesInCurrentBurst++;
    
    if (pasteTimer) clearTimeout(pasteTimer);
    
    pasteTimer = setTimeout(() => {
        // Jika ada banyak baris yang masuk seketika (paste multi-line)
        if (linesInCurrentBurst > 1) {
            // Tahan pengiriman, tunggu user menekan Enter secara manual
            process.stdout.write('\x1b[33m[Teks multi-baris di-paste. Tekan ENTER sekali lagi untuk mengirim...]\x1b[0m\n❯ ');
            linesInCurrentBurst = 0; // Reset counter untuk Enter selanjutnya
        } else {
            // Jika hanya 1 baris (ketikan manual atau Enter), kirimkan semua buffer
            const fullInput = inputBuffer.join('\n');
            inputBuffer = [];
            linesInCurrentBurst = 0;
            
            const resolve = resolvePrompt;
            resolvePrompt = null;
            if (resolve) resolve(fullInput);
        }
    }, 40); // 40ms window untuk mendeteksi paste
});

const askQuestion = (query: string): Promise<string> => {
    process.stdout.write(query);
    return new Promise(resolve => {
        resolvePrompt = resolve;
    });
};

/** Signature identik dengan versi lama — drop-in replacement. */
export async function runCliAgentLoop(
    initialMessage: string,
    contextMsgs: ChatMessage[] = [],
    options?: LoopOptions
): Promise<ChatMessage[]> {
    const result = await runCoreLoop(initialMessage, contextMsgs, askQuestion, options);
    return result.messages;
}

/** BARU: versi yang mengembalikan status lengkap, bukan cuma array pesan. */
export async function runCliAgentLoopDetailed(
    initialMessage: string,
    contextMsgs: ChatMessage[] = [],
    options?: LoopOptions
) {
    return runCoreLoop(initialMessage, contextMsgs, askQuestion, options);
}

export function closeCli() {
    rl.close();
}

export function askUser(query: string) {
    return askQuestion(query);
}

// Re-ekspor tipe untuk kemudahan pemanggil
export type { ChatMessage, LoopOptions, LoopResult } from './types.js';
