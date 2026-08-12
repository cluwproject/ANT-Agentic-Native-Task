// ============================================================================
// ANT — Interactive Slash Command Menu
// ============================================================================
// Saat user mengetik "/" di prompt, modul ini mengambil alih stdin secara
// sementara dalam raw-mode dan menampilkan panel autocomplete interaktif.
// Setelah Enter/Tab/Esc, kendali dikembalikan ke readline normal.
// ============================================================================

import chalk from 'chalk';

export interface SlashCommand {
    command: string;
    description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
    { command: '/new_chat',          description: 'Mulai sesi percakapan baru (fresh context)' },
    { command: '/clear',             description: 'Bersihkan layar & segar ulang sesi' },
    { command: '/resume',            description: 'Lanjutkan sesi sebelumnya by ID' },
    { command: '/model',             description: 'Ganti model AI yang sedang aktif' },
    { command: '/session list',      description: 'Lihat semua sesi percakapan tersimpan' },
    { command: '/session load',      description: 'Muat sesi percakapan by ID' },
    { command: '/undo',              description: 'Restore file dari backup .bak terakhir' },
    { command: '/loop start',        description: 'Aktifkan autopilot trading loop' },
    { command: '/loop stop',         description: 'Matikan autopilot trading loop' },
    { command: '/exness start',      description: 'Aktifkan Exness MT5 autopilot' },
    { command: '/exness stop',       description: 'Matikan Exness MT5 autopilot' },
    { command: '/exness journal',    description: 'Lihat jurnal keputusan trading otonom' },
    { command: '/agent list',        description: 'Lihat daftar agen yang tersedia' },
    { command: '/agent run',         description: 'Jalankan agen tertentu secara manual' },
    { command: '/task schedule',     description: 'Jadwalkan tugas dengan cron expression' },
    { command: '/task list',         description: 'Lihat daftar tugas terjadwal' },
    { command: '/git status',        description: 'Lihat status perubahan Git' },
    { command: '/git diff',          description: 'Lihat diff perubahan kode saat ini' },
    { command: '/git log',           description: 'Lihat riwayat commit Git' },
    { command: '/help',              description: 'Tampilkan semua perintah & opsi' },
    { command: '/exit',              description: 'Keluar dari ANT — Agentic Native Task' },
];

const MAX_VISIBLE = 7;

function renderMenu(filtered: SlashCommand[], selectedIdx: number, query: string) {
    const totalRows = Math.min(filtered.length, MAX_VISIBLE);
    const startIdx = Math.max(0, selectedIdx - Math.floor(MAX_VISIBLE / 2));
    const visible = filtered.slice(startIdx, startIdx + MAX_VISIBLE);
    const remaining = filtered.length - startIdx - visible.length;

    const width = process.stdout.columns || 80;
    const borderH = '─'.repeat(width - 2);
    const borderTop = chalk.dim(`┌${borderH}┐`);
    const borderBot = chalk.dim(`└${borderH}┘`);

    const lines: string[] = [];
    lines.push(borderTop);

    visible.forEach((cmd, i) => {
        const absIdx = startIdx + i;
        const isSelected = absIdx === selectedIdx;

        const prefix = isSelected ? chalk.cyan('  ❯ ') : '    ';
        const cmdStr = isSelected ? chalk.cyan.bold(cmd.command.padEnd(22)) : chalk.white(cmd.command.padEnd(22));
        const descStr = chalk.dim(cmd.description.slice(0, width - 32));

        const content = `${prefix}${cmdStr} ${descStr}`;
        const cleanLen = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
        const pad = ' '.repeat(Math.max(0, width - 2 - cleanLen));

        lines.push(chalk.dim('│') + content + pad + chalk.dim('│'));
    });

    if (remaining > 0) {
        const moreStr = `    ${chalk.dim(`↓ ${remaining} more`)}`;
        const cleanLen = moreStr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
        const pad = ' '.repeat(Math.max(0, width - 2 - cleanLen));
        lines.push(chalk.dim('│') + moreStr + pad + chalk.dim('│'));
    }

    const footer = '  ' + chalk.dim('↑/↓ Navigate') + '  ' + chalk.dim('Enter Select') + '  ' + chalk.dim('Tab Complete') + '  ' + chalk.dim('Esc Cancel');
    const cleanFooterLen = footer.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
    const footerPad = ' '.repeat(Math.max(0, width - 2 - cleanFooterLen));

    lines.push(chalk.dim(`├${borderH}┤`));
    lines.push(chalk.dim('│') + footer + footerPad + chalk.dim('│'));
    lines.push(borderBot);

    process.stdout.write('\n');
    process.stdout.write(lines.join('\n'));
    const menuLines = lines.length + 1;

    return menuLines;
}

function clearMenu(menuLines: number) {
    for (let i = 0; i < menuLines; i++) {
        process.stdout.write('\x1B[1A\x1B[2K');
    }
}

/**
 * Tampilkan slash menu interaktif. Return string perintah yang dipilih,
 * atau `null` jika user cancel (Esc). Fallback ke readline jika stdin
 * tidak mendukung raw mode (environment non-TTY).
 */
export async function showSlashMenu(initialChar: string = '/'): Promise<string | null> {
    // tsx dapat merusak stdin.isTTY — gunakan stdout sebagai fallback check
    const isTTY = !!(process.stdout.isTTY || process.stdin.isTTY);
    if (!isTTY || process.env.CI || process.env.TERM === 'dumb') {
        return null;
    }

    return new Promise((resolve) => {
        let query = initialChar;
        let selectedIdx = 0;
        let menuLines = 0;

        const filtered = () => SLASH_COMMANDS.filter(c =>
            c.command.toLowerCase().startsWith(query.toLowerCase())
        );

        // Redraw prompt line dengan query saat ini
        const redrawPrompt = () => {
            process.stdout.write('\x1B[2K\x1B[0G'); // clear line
            process.stdout.write(chalk.cyan('You ❯ ') + chalk.white(query));
        };

        const redraw = () => {
            const f = filtered();
            if (menuLines > 0) clearMenu(menuLines);
            redrawPrompt();
            if (query.startsWith('/') && f.length > 0) {
                if (selectedIdx >= f.length) selectedIdx = f.length - 1;
                menuLines = renderMenu(f, selectedIdx, query);
            } else {
                menuLines = 0;
            }
        };

        const cleanup = (result: string | null) => {
            if (menuLines > 0) clearMenu(menuLines);
            process.stdout.write('\x1B[2K\x1B[0G');
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeAllListeners('data');
            resolve(result);
        };

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        // Initial draw
        redrawPrompt();
        const f = filtered();
        if (f.length > 0) menuLines = renderMenu(f, selectedIdx, query);

        process.stdin.on('data', (key: string) => {
            const f = filtered();

            // Ctrl+C → exit
            if (key === '\u0003') {
                cleanup(null);
                process.exit(0);
            }

            // Esc → cancel
            if (key === '\u001b') {
                cleanup(null);
                return;
            }

            // Enter → select
            if (key === '\r' || key === '\n') {
                const selected = f[selectedIdx];
                const result = selected ? selected.command : query;
                process.stdout.write('\n');
                cleanup(result);
                return;
            }

            // Tab → autocomplete
            if (key === '\t') {
                const selected = f[selectedIdx];
                if (selected) {
                    query = selected.command;
                    selectedIdx = 0;
                    redraw();
                }
                return;
            }

            // Backspace
            if (key === '\u007f' || key === '\b') {
                if (query.length > 0) {
                    query = query.slice(0, -1);
                    selectedIdx = 0;
                    redraw();
                }
                return;
            }

            // Arrow Up
            if (key === '\u001b[A') {
                if (selectedIdx > 0) selectedIdx--;
                redraw();
                return;
            }

            // Arrow Down
            if (key === '\u001b[B') {
                if (selectedIdx < f.length - 1) selectedIdx++;
                redraw();
                return;
            }

            // Printable character
            if (key >= ' ' || key === '/') {
                query += key;
                selectedIdx = 0;
                redraw();
            }
        });
    });
}

// ── SESSION SELECTOR INTERAKTIF ──────────────────────────────────────────────
export interface SessionItem {
    id: string;
    name: string;
    messages: number;
    time: string;
}

export async function showSessionSelector(sessions: SessionItem[]): Promise<string | null> {
    const isTTY = !!(process.stdout.isTTY || process.stdin.isTTY);
    if (!isTTY || process.env.CI || process.env.TERM === 'dumb') {
        return null;
    }

    return new Promise((resolve) => {
        let selectedIdx = 0;
        let menuLines = 0;
        
        // Batasi jumlah sesi yang ditampilkan agar tidak terlalu panjang
        const MAX_SESSIONS = 10;
        const visibleSessions = sessions.slice(0, MAX_SESSIONS);

        const renderSessionMenu = () => {
            const width = process.stdout.columns || 80;
            const borderH = '─'.repeat(width - 2);
            const lines: string[] = [];
            lines.push(chalk.dim(`┌${borderH}┐`));
            
            visibleSessions.forEach((s, i) => {
                const isSelected = i === selectedIdx;
                const prefix = isSelected ? chalk.cyan('  ❯ ') : '    ';
                
                const idStr = isSelected ? chalk.cyan.bold(s.id.padEnd(25)) : chalk.white(s.id.padEnd(25));
                const detailStr = chalk.dim(`(Terakhir: ${s.time})`);

                const content = `${prefix}${idStr} ${detailStr}`;
                const cleanLen = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
                const pad = ' '.repeat(Math.max(0, width - 2 - cleanLen));

                lines.push(chalk.dim('│') + content + pad + chalk.dim('│'));
            });
            
            if (sessions.length > MAX_SESSIONS) {
                const moreStr = `    ${chalk.dim(`↓ ${sessions.length - MAX_SESSIONS} sesi lainnya (ketik manual: /resume <id>)`)}`;
                const cleanLen = moreStr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
                const pad = ' '.repeat(Math.max(0, width - 2 - cleanLen));
                lines.push(chalk.dim('│') + moreStr + pad + chalk.dim('│'));
            }

            const footer = '  ' + chalk.dim('↑/↓ Navigasi') + '  ' + chalk.dim('Enter: Pilih') + '  ' + chalk.dim('Esc: Batal');
            const cleanFooterLen = footer.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
            const footerPad = ' '.repeat(Math.max(0, width - 2 - cleanFooterLen));

            lines.push(chalk.dim(`├${borderH}┤`));
            lines.push(chalk.dim('│') + footer + footerPad + chalk.dim('│'));
            lines.push(chalk.dim(`└${borderH}┘`));

            process.stdout.write('\n');
            process.stdout.write(lines.join('\n'));
            return lines.length + 1;
        };

        const redraw = () => {
            if (menuLines > 0) clearMenu(menuLines);
            process.stdout.write('\x1B[2K\x1B[0G'); // clear line
            process.stdout.write(chalk.cyan('You ❯ ') + chalk.white('Pilih Sesi:'));
            menuLines = renderSessionMenu();
        };

        const cleanup = (result: string | null) => {
            if (menuLines > 0) clearMenu(menuLines);
            process.stdout.write('\x1B[2K\x1B[0G');
            process.stdin.setRawMode(false);
            // Hapus HANYA listener menu ini agar readline CLI utama tidak ikut mati
            process.stdin.removeListener('data', onData);
            resolve(result);
        };

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        redraw();

        const onData = (key: string) => {
            if (key === '\u0003') { cleanup(null); process.exit(0); } // Ctrl+C
            if (key === '\u001b') { cleanup(null); return; } // Esc
            if (key === '\r' || key === '\n') {
                const selected = visibleSessions[selectedIdx];
                process.stdout.write('\n');
                cleanup(selected ? selected.id : null);
                return;
            }
            if (key === '\u001b[A') { if (selectedIdx > 0) selectedIdx--; redraw(); return; } // Up
            if (key === '\u001b[B') { if (selectedIdx < visibleSessions.length - 1) selectedIdx++; redraw(); return; } // Down
        };

        process.stdin.on('data', onData);
    });
}
