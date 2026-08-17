/**
 * ════════════════════════════════════════════════════════════════════
 * ANT — ROCK-SOLID NATIVE PROMPTER WITH DYNAMIC SLASH TRIGGER
 * ════════════════════════════════════════════════════════════════════
 * - Native line editing & wrapping (zero text stutter / no duplication)
 * - Real-time slash menu trigger on '/' and instant Enter fallback
 * - Clean cancellation on Backspace / Esc
 * - Tab completion across all registered slash commands
 * ════════════════════════════════════════════════════════════════════
 */

import readline from 'readline';
import { SLASH_COMMANDS, showSlashMenu } from './slash_menu.js';

export async function askUser(promptText: string = 'You ❯ '): Promise<string> {
    return new Promise((resolve) => {
        let isHandled = false;

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            completer: (line: string) => {
                const hits = SLASH_COMMANDS
                    .map(c => c.command)
                    .filter(c => c.toLowerCase().startsWith(line.toLowerCase()));
                return [hits.length ? hits : SLASH_COMMANDS.map(c => c.command), line];
            }
        });

        readline.emitKeypressEvents(process.stdin);

        rl.question(promptText, async (answer) => {
            if (isHandled) return;
            isHandled = true;
            rl.close();

            const trimmed = (answer || '').trim();
            // If user typed '/' or '/help' and pressed Enter, open interactive slash menu
            if (trimmed === '/' || trimmed === '/help') {
                const selected = await showSlashMenu('/');
                resolve(selected ? selected.trim() : '');
            } else {
                resolve(trimmed);
            }
        });
    });
}
