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

        let accumulated = '';
        let timer: NodeJS.Timeout | null = null;

        // Cetak prompt ke layar
        rl.setPrompt(promptText);
        rl.prompt();

        rl.on('line', (line) => {
            if (accumulated === '') {
                accumulated = line;
            } else {
                accumulated += '\n' + line;
            }

            if (timer) clearTimeout(timer);

            // Beri jeda 30ms untuk menangkap line berikutnya jika user mem-paste block text.
            timer = setTimeout(async () => {
                rl.close();
                const trimmed = (accumulated || '').trim();
                
                // Cek slash command jika single line '/'
                if (trimmed === '/' || trimmed === '/help') {
                    const selected = await showSlashMenu('/');
                    resolve(selected ? selected.trim() : '');
                } else {
                    resolve(trimmed);
                }
            }, 30);
        });
    });
}
