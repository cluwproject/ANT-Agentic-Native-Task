// ============================================================================
// ANT — /workspace Command Handler (Interactive TUI)
// ============================================================================

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { CliContext } from '../types.js';

const MAX_LIST_ROWS = 20;

function clearLines(count: number) {
    for (let i = 0; i < count; i++) {
        process.stdout.write('\x1B[1A\x1B[2K\r');
    }
}

export async function handleWorkspaceCommands(text: string, ctx: CliContext): Promise<boolean> {
    if (!text.startsWith('/workspace')) return false;

    const wsRoot = path.join(ctx.baseDir, 'workspace');
    if (!fs.existsSync(wsRoot)) fs.mkdirSync(wsRoot, { recursive: true });

    let currentDir = wsRoot;
    const rest = text.slice('/workspace'.length).trim();
    if (rest) {
        const potential = path.resolve(wsRoot, rest);
        if (potential.startsWith(wsRoot) && fs.existsSync(potential) && fs.statSync(potential).isDirectory()) {
            currentDir = potential;
        }
    }

    await runInteractiveWorkspace(ctx, wsRoot, currentDir);
    return true;
}

async function runInteractiveWorkspace(ctx: CliContext, wsRoot: string, startDir: string) {
    const isTTY = !!(process.stdout.isTTY || process.stdin.isTTY);
    if (!isTTY) {
        console.log(chalk.red('\n[ERROR] Lingkungan terminal tidak mendukung mode interaktif (TTY).\n'));
        return;
    }

    return new Promise<void>((resolve) => {
        let currentDir = startDir;
        let entries: fs.Dirent[] = [];
        let selectedIdx = 0;
        let mode: 'list' | 'file' = 'list';
        let fileLines: string[] = [];
        let fileScroll = 0;
        let activeFile = '';
        let menuLines = 0;

        const refreshEntries = () => {
            try {
                entries = fs.readdirSync(currentDir, { withFileTypes: true });
                entries.sort((a, b) => {
                    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });
            } catch {
                entries = [];
            }
            selectedIdx = Math.min(selectedIdx, Math.max(0, entries.length - 1));
        };

        refreshEntries();

        const render = () => {
            if (menuLines > 0) clearLines(menuLines);
            let linesRendered = 0;

            const printLine = (str: string) => {
                process.stdout.write(str + '\n');
                linesRendered++;
            };

            const relPath = '.' + path.sep + path.relative(wsRoot, currentDir);
            
            printLine('');
            printLine(chalk.bgCyan.black(' ANT WORKSPACE EXPLORER ') + ' ' + chalk.cyan(`${relPath} `) + chalk.dim(mode === 'list' ? `(${entries.length} entri)` : `(Preview: ${activeFile})`));
            printLine('');

            if (mode === 'list') {
                if (entries.length === 0) {
                    printLine(chalk.yellow('  (Folder kosong)'));
                } else {
                    const start = Math.max(0, Math.min(selectedIdx - Math.floor(MAX_LIST_ROWS / 2), entries.length - MAX_LIST_ROWS));
                    const visible = entries.slice(start, start + MAX_LIST_ROWS);

                    visible.forEach((e, i) => {
                        const actualIdx = start + i;
                        const isSelected = actualIdx === selectedIdx;
                        const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
                        
                        let nameStr = e.isDirectory() ? chalk.bold.blue(e.name + '/') : chalk.green(e.name);
                        if (isSelected) nameStr = chalk.bgCyan.black(` ${e.name}${e.isDirectory() ? '/' : ''} `);
                        
                        printLine(`${prefix}${nameStr}`);
                    });

                    if (entries.length > MAX_LIST_ROWS) {
                        printLine(chalk.dim(`  ... (${start + 1}-${start + visible.length} dari ${entries.length} entri)`));
                    }
                }
                printLine('');
                printLine(chalk.dim('  [↑/↓] Pilih  [Enter/→] Masuk/Baca  [Esc/←] Kembali  [Q] Keluar Explorer'));
            } else if (mode === 'file') {
                const visible = fileLines.slice(fileScroll, fileScroll + MAX_LIST_ROWS);
                visible.forEach((line, i) => {
                    const num = String(fileScroll + i + 1).padStart(4);
                    printLine(chalk.dim(num + ' | ') + line.slice(0, 150));
                });
                
                if (fileLines.length > MAX_LIST_ROWS) {
                    printLine(chalk.dim(`  ... baris ${fileScroll + 1}-${fileScroll + visible.length} dari ${fileLines.length} (↑/↓ untuk scroll)`));
                }
                printLine('');
                printLine(chalk.dim('  [Esc/←] Kembali ke Folder  [Q] Keluar Explorer'));
            }

            menuLines = linesRendered;
        };

        const onData = (key: string) => {
            if (key === '\u0003' || key.toLowerCase() === 'q') {
                cleanup();
                return;
            }

            if (key === '\u001b' || key === '\u001b[D') { // Esc or Left
                if (mode === 'file') {
                    mode = 'list';
                    fileLines = [];
                    render();
                } else {
                    if (currentDir === wsRoot) {
                        cleanup();
                    } else {
                        currentDir = path.dirname(currentDir);
                        refreshEntries();
                        render();
                    }
                }
                return;
            }

            if (key === '\u001b[A') { // Up
                if (mode === 'list' && selectedIdx > 0) {
                    selectedIdx--;
                    render();
                } else if (mode === 'file' && fileScroll > 0) {
                    fileScroll--;
                    render();
                }
                return;
            }

            if (key === '\u001b[B') { // Down
                if (mode === 'list' && selectedIdx < entries.length - 1) {
                    selectedIdx++;
                    render();
                } else if (mode === 'file' && fileScroll < Math.max(0, fileLines.length - MAX_LIST_ROWS)) {
                    fileScroll++;
                    render();
                }
                return;
            }

            if (key === '\r' || key === '\n' || key === '\u001b[C') { // Enter or Right
                if (mode === 'list' && entries.length > 0) {
                    const selected = entries[selectedIdx];
                    const absPath = path.join(currentDir, selected.name);
                    
                    if (selected.isDirectory()) {
                        currentDir = absPath;
                        refreshEntries();
                        render();
                    } else {
                        try {
                            const stat = fs.statSync(absPath);
                            if (stat.size > 1024 * 1024 * 2) { 
                                fileLines = ['[ERROR] File terlalu besar untuk di-preview (> 2MB).'];
                            } else {
                                const content = fs.readFileSync(absPath, 'utf8');
                                fileLines = content.split(/\r?\n/);
                            }
                        } catch (e: any) {
                            fileLines = [`[ERROR] Gagal membaca file: ${e.message}`];
                        }
                        mode = 'file';
                        fileScroll = 0;
                        activeFile = selected.name;
                        render();
                    }
                }
                return;
            }
        };

        const cleanup = () => {
            if (menuLines > 0) clearLines(menuLines);
            process.stdout.write('\x1B[2K\x1B[0G'); // clear line
            process.stdin.setRawMode(false);
            process.stdin.removeListener('data', onData);
            console.log(chalk.green('✔ Workspace Explorer ditutup. Kembali ke sesi chat.\n'));
            resolve();
        };

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        render();
        process.stdin.on('data', onData);
    });
}
