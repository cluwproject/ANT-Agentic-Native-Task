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
import { SLASH_COMMANDS, showSlashMenu } from './cli/slash_menu.js';

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

        // ── Bracketed Paste Mode ──────────────────────────────────────────
        // Aktifkan BPM di terminal: saat user paste, teks dibungkus
        //  \x1b[200~ ... \x1b[201~  sehingga kita bisa kumpulkan semua
        // baris sebelum Enter ditekan. Aman di Termux & Linux TTY.
        // Bila terminal tidak mendukung BPM, fallback ke mode normal.
        let bpmEnabled = false;
        if (process.stdin.isTTY && process.stdout.isTTY) {
            process.stdout.write('\x1b[?2004h');
            bpmEnabled = true;
        }

        let accumulated = '';
        let isPasting = false;
        let timer: NodeJS.Timeout | null = null;
        let settled = false;

        const finish = (value: string) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            // FIX memory leak: listener BPM WAJIB dilepas setiap giliran.
            // Tanpa ini, tiap askUser() menambah satu listener permanen
            // (MaxListenersExceeded setelah ±10 turn + artefak paste).
            process.stdin.removeListener('data', onRawData);
            rl.close();
            if (bpmEnabled) process.stdout.write('\x1b[?2004l');
            resolve(value);
        };

        const onRawData = (chunk: Buffer | string) => {
            const data = chunk.toString();
            if (data.includes('\x1b[200~')) {
                isPasting = true;
                accumulated += data.replace(/\x1b\[200~/g, '');
            } else if (data.includes('\x1b[201~')) {
                isPasting = false;
                accumulated += data.replace(/\x1b\[201~/g, '');
            } else if (isPasting) {
                accumulated += data;
            }
        };

        rl.setPrompt(promptText);
        rl.prompt();

        // Tangkap data raw untuk mendeteksi marker BPM
        if (bpmEnabled) {
            process.stdin.on('data', onRawData);
        }

        rl.on('line', (line) => {
            // Jika BPM aktif dan sedang dalam proses paste, tunda pengiriman
            if (isPasting) {
                return;
            }

            // Gabungkan accumulated paste + baris terakhir yang diketik/Enter
            const fullInput = accumulated ? (accumulated + '\n' + line).trim() : line.trim();
            accumulated = '';

            // Debounce kecil agar paste multi-baris terkumpul utuh
            timer = setTimeout(() => {
                if (fullInput === '/' || fullInput === '/help') {
                    // Cleanup manual TANPA men-resolve — menu interaktif
                    // ditampilkan dulu, hasilnya jadi nilai resolve.
                    settled = true;
                    if (timer) clearTimeout(timer);
                    process.stdin.removeListener('data', onRawData);
                    rl.close();
                    if (bpmEnabled) process.stdout.write('\x1b[?2004l');
                    void (async () => {
                        const selected = await showSlashMenu('/');
                        resolve(selected ? selected.trim() : '');
                    })();
                } else {
                    finish(fullInput);
                }
            }, 10);
        });

        // Jika rl tertutup tanpa line (Ctrl+D / stream end), jangan gantung
        rl.on('close', () => {
            setTimeout(() => finish(''), 0);
        });
    });
}
