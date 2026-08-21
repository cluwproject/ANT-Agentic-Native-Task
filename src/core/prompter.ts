/**
 * ════════════════════════════════════════════════════════════════════
 * ANT — ROCK-SOLID NATIVE PROMPTER WITH DYNAMIC SLASH TRIGGER
 * ════════════════════════════════════════════════════════════════════
 * - Pure Readline interface (zero raw-mode stutter / no dropped keys)
 * - Rock-solid prompt persistence ('You ❯ ' stays fixed)
 * - Tab completion across all registered slash commands
 * - Clean interactive slash menu on '/' trigger
 * ════════════════════════════════════════════════════════════════════
 */

import readline from 'readline';
import { SLASH_COMMANDS, showSlashMenu } from './slash_menu.js';

export async function askUser(promptText: string = 'You ❯ '): Promise<string> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: Boolean(process.stdin.isTTY),
            completer: (line: string) => {
                const hits = SLASH_COMMANDS
                    .map(c => c.command)
                    .filter(c => c.toLowerCase().startsWith(line.toLowerCase()));
                return [hits.length ? hits : SLASH_COMMANDS.map(c => c.command), line];
            }
        });

        rl.question(promptText, async (answer) => {
            rl.close();
            const trimmed = (answer || '').trim();
            if (trimmed === '/' || trimmed === '/help') {
                const selected = await showSlashMenu('/');
                resolve(selected ? selected.trim() : '');
            } else {
                resolve(trimmed);
            }
        });
    });
}
