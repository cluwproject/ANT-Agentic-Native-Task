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
    process.stdout.write(promptText);

    return new Promise((resolve) => {
        let intercepted = false;
        let pasteBuffer = '';
        let pasteTimeout: NodeJS.Timeout | null = null;

        const onData = (keyBuf: Buffer) => {
            const key = keyBuf.toString();

            // Ctrl+C
            if (key === '\u0003') {
                process.stdout.write('\n');
                process.exit(0);
            }
            
            // Enter key mapping for raw mode check
            if (key === '\r' || key === '\n') {
                // If it's just an enter key, let's treat it like normal typing
                pasteBuffer += '\n';
            } else {
                pasteBuffer += key;
            }

            if (pasteTimeout) clearTimeout(pasteTimeout);

            // 30ms debounce to collect all chunks of a rapid paste
            pasteTimeout = setTimeout(() => {
                if (intercepted) return;
                intercepted = true;
                
                if (process.stdin.isTTY) process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', onData);

                // Deteksi paste: Buffer panjang ATAU mengandung newline namun bukan sekadar enter kosong
                if (pasteBuffer.length > 50 || (pasteBuffer.includes('\n') && pasteBuffer.trim().length > 5)) {
                    process.stdout.write('\r\x1b[K');
                    console.log(`\x1b[33m[Terdeteksi Teks Paste: ${pasteBuffer.length} karakter]\x1b[0m`);
                    
                    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                    rl.question('\x1b[36m? Teks panjang terdeteksi. (y) Kirim, (e) Tambah Instruksi, (n) Batal: \x1b[0m', (ans) => {
                        ans = ans.toLowerCase().trim();
                        if (ans === 'e') {
                            rl.question('\x1b[32mKetik instruksi tambahan:\n> \x1b[0m', (inst) => {
                                rl.close();
                                resolve(`${inst}\n\n[PASTED TEXT]:\n${pasteBuffer.trim()}`);
                            });
                        } else if (ans === 'n') {
                            console.log('\x1b[31mDibatalkan.\x1b[0m\n');
                            rl.close();
                            resolve('');
                        } else {
                            rl.close();
                            resolve(pasteBuffer.trim());
                        }
                    });
                    return;
                }

                // Normal typing / small input
                process.stdout.write('\r\x1b[K'); // Bersihkan prompt manual sebelumnya
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

                // Gunakan native prompt dari readline agar saat redraw tidak hilang
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
                
                // Tulis balik apa yang diketik user (pasteBuffer) SETELAH question dipanggil
                rl.write(pasteBuffer);
            }, 30);
        };

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        process.stdin.on('data', onData);
    });
}
