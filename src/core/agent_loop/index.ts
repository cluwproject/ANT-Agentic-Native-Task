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

import type { ChatMessage, LoopOptions } from './types.js';
import { runCliAgentLoop as runCoreLoop } from './agentLoop.js';
import { askUser } from '../prompter.js';

export { askUser };

const askQuestion = (query: string): Promise<string> => {
    return askUser(query);
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
    // No-op for prompter
}

// Re-ekspor tipe untuk kemudahan pemanggil
export type { ChatMessage, LoopOptions, LoopResult } from './types.js';
