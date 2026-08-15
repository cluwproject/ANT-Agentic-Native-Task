/**
 * ════════════════════════════════════════════════════════════════════
 * ANT — ROCK-SOLID NATIVE PROMPTER WITH DYNAMIC SLASH TRIGGER
 * ════════════════════════════════════════════════════════════════════
 * - Native line editing & wrapping (zero text stutter / no duplication)
 * - Real-time slash menu trigger on '/'
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

        const onKeypress = async (str: string, key: readline.Key) => {
            if (isHandled) return;

            // Trigger interactive slash menu only when '/' is pressed at start of prompt
            if ((rl as any).line === '' && (str === '/' || (key && key.name === 'slash'))) {
                isHandled = true;
                if (process.stdin.isTTY) {
                    process.stdin.removeListener('keypress', onKeypress);
                }
                rl.close();

                // Open interactive slash menu
                const selected = await showSlashMenu('/');
                resolve(selected ? selected.trim() : '');
            }
        };

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.on('keypress', onKeypress);
        }

        rl.question(promptText, (answer) => {
            if (isHandled) return;
            isHandled = true;
            if (process.stdin.isTTY) {
                process.stdin.removeListener('keypress', onKeypress);
            }
            rl.close();
            resolve(answer.trim());
        });
    });
}
