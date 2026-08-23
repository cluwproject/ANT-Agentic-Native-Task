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
    { command: '/new_chat',          description: 'Start fresh conversation session (clear context)' },
    { command: '/clear',             description: 'Clear screen and refresh active session' },
    { command: '/plan',              description: 'Generate or review multi-step HTN execution plan' },
    { command: '/branch list',       description: 'List all saved conversation branches' },
    { command: '/branch create',     description: 'Create and save branch from current conversation' },
    { command: '/branch checkout',   description: 'Switch active session to a saved branch' },
    { command: '/store',             description: 'Store semantic memory into CockroachDB / Vault' },
    { command: '/recall',            description: 'Recall past memories via Vector Similarity Search' },
    { command: '/memories',          description: 'List all stored semantic memories in database' },
    { command: '/vault',             description: 'Switch active memory vault (CockroachDB cloud / local)' },
    { command: '/mailbox',           description: 'Open inter-model relay & handover ledger' },
    { command: '/health',            description: 'Audit CockroachDB cluster & cognitive memory health' },
    { command: '/swarm',             description: 'Launch ANT-CYBER-CORPS 5-unit parallel security audit' },
    { command: '/sync',              description: 'Flush offline memory queue → sync to CockroachDB cloud' },
    { command: '/consolidate',       description: 'Trigger autonomous memory sleep cycle & knowledge consolidation' },
    { command: '/scaffold',          description: 'Scaffold new project from profile (INIT → IMPLEMENT → VERIFY → SECURE)' },
    { command: '/resume',            description: 'Resume previous session by ID' },
    { command: '/model',             description: 'Hot-swap active AI model (Ollama/Bedrock/OpenAI)' },
    { command: '/session list',      description: 'View all saved conversation sessions' },
    { command: '/session load',      description: 'Load conversation session by ID' },
    { command: '/checkpoint',        description: 'Save a Git commit checkpoint of current workspace' },
    { command: '/undo',              description: 'Restore file from latest .bak backup' },
    { command: '/skills',            description: 'List all available custom skills in workspace' },
    { command: '/agent list',        description: 'List available custom agents' },
    { command: '/agent run',         description: 'Execute specific agent manually' },
    { command: '/task schedule',     description: 'Schedule background task with cron expression' },
    { command: '/task list',         description: 'List registered scheduled tasks' },
    { command: '/git status',        description: 'View Git repository working status' },
    { command: '/git diff',          description: 'View current code diff changes' },
    { command: '/git log',           description: 'View Git commit history logs' },
    { command: '/report',            description: 'Compile and render White Unit swarm audit report' },
    { command: '/osint',             description: 'Launch Purple Unit multi-dimensional OSINT mission' },
    { command: '/connect',           description: 'Audit network connectivity to CockroachDB & EventBus' },
    { command: '/help',              description: 'Display all commands and operational options' },
    { command: '/exit',              description: 'Disconnect from ANT agent runtime' },
];

const MAX_VISIBLE = 8;

function renderMenu(filtered: SlashCommand[], selectedIdx: number, query: string) {
    const cols = Math.max(35, (process.stdout.columns || 80) - 2);
    const width = Math.min(cols, 70);
    const separator = chalk.dim('─'.repeat(width));

    const lines: string[] = [];
    lines.push(separator);
    lines.push(chalk.cyan.bold('> ') + chalk.white.bold((query || '/').slice(0, width - 4)));
    lines.push(separator);

    const totalRows = Math.min(filtered.length, MAX_VISIBLE);
    const startIdx = Math.max(0, selectedIdx - Math.floor(MAX_VISIBLE / 2));
    const visible = filtered.slice(startIdx, startIdx + MAX_VISIBLE);
    const remaining = filtered.length - startIdx - visible.length;

    visible.forEach((cmd, i) => {
        const absIdx = startIdx + i;
        const isSelected = absIdx === selectedIdx;

        const prefix = isSelected ? chalk.cyan.bold('❯ ') : '  ';
        const cmdFormatted = isSelected ? chalk.cyan.bold(cmd.command.padEnd(24)) : chalk.white(cmd.command.padEnd(24));
        
        const rawDesc = cmd.description;
        const maxDescLen = Math.max(8, width - 28);
        const descShort = rawDesc.length > maxDescLen ? rawDesc.slice(0, maxDescLen - 3) + '...' : rawDesc;
        const descFormatted = isSelected ? chalk.white(descShort) : chalk.dim(descShort);

        lines.push(`${prefix}${cmdFormatted} ${descFormatted}`);
    });

    if (remaining > 0) {
        lines.push(chalk.dim(`   ↓ ${remaining} more (use arrows / type to filter)`));
    }

    process.stdout.write(lines.join('\n') + '\n');
    return lines.length;
}

function clearMenu(menuLines: number) {
    for (let i = 0; i < menuLines; i++) {
        process.stdout.write('\x1B[1A\x1B[2K\r');
    }
}

/**
 * Tampilkan slash menu interaktif. Return string perintah yang dipilih,
 * atau `null` jika user cancel (Esc). Fallback ke readline jika stdin
 * tidak mendukung raw mode (environment non-TTY).
 */
export async function showSlashMenu(initialChar: string = '/'): Promise<string | null> {
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

        const redraw = () => {
            const f = filtered();
            if (menuLines > 0) clearMenu(menuLines);
            if (query.startsWith('/') && f.length > 0) {
                if (selectedIdx >= f.length) selectedIdx = Math.max(0, f.length - 1);
                menuLines = renderMenu(f, selectedIdx, query);
            } else {
                menuLines = 0;
            }
        };

        const cleanup = (result: string | null) => {
            if (menuLines > 0) clearMenu(menuLines);
            try {
                process.stdin.setRawMode(false);
                process.stdin.removeAllListeners('data');
            } catch {}
            resolve(result);
        };

        try {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
        } catch {
            return resolve(null);
        }

        // Initial draw
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
                    if (query.length === 0) {
                        cleanup(null);
                        return;
                    }
                    selectedIdx = 0;
                    redraw();
                } else {
                    cleanup(null);
                    return;
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

            // Ignore other escape sequences (e.g. arrow left/right, F-keys)
            if (key.startsWith('\u001b')) {
                return;
            }

            // Printable single character
            if (key.length === 1 && (key >= ' ' || key === '/')) {
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
            const width = Math.max(50, (process.stdout.columns || 80) - 2); // -2 to prevent terminal auto-wrap
            const borderH = '─'.repeat(width - 2);
            const lines: string[] = [];
            lines.push(chalk.dim(`┌${borderH}┐`));
            
            visibleSessions.forEach((s, i) => {
                const isSelected = i === selectedIdx;
                const prefix = isSelected ? chalk.cyan('  ❯ ') : '    ';
                
                // Trim string if it's too long
                const maxIdLen = 25;
                const idText = s.id.length > maxIdLen ? s.id.substring(0, maxIdLen-3) + '...' : s.id.padEnd(maxIdLen);
                const idStr = isSelected ? chalk.cyan.bold(idText) : chalk.white(idText);
                const detailStr = chalk.dim(`(Terakhir: ${s.time})`);

                const content = `${prefix}${idStr} ${detailStr}`;
                // Strip ANSI to get real length
                const cleanLen = content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
                
                if (cleanLen > width - 4) {
                    // if still too long, just truncate the whole string (ignoring ansi complexity, just rough fallback)
                    lines.push(chalk.dim('│') + content + chalk.dim('│'));
                } else {
                    const pad = ' '.repeat(Math.max(0, width - 2 - cleanLen));
                    lines.push(chalk.dim('│') + content + pad + chalk.dim('│'));
                }
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
