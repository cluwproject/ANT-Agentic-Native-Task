// ============================================================================
// ANT — CLI Commands — /mcp (Model Context Protocol)
// ============================================================================
//   /mcp                     → status semua server terdaftar
//   /mcp connect [nama]      → konek satu / semua server + muat tools
//   /mcp add <nama> <cmd...> → daftarkan server baru ke .ant/mcp.json
//   /mcp remove <nama>       → hapus server dari konfigurasi
//   /mcp tools               → daftar tool MCP yang tersedia untuk model
// ============================================================================

import chalk from 'chalk';
import type { CliContext, CommandHandler } from '../types.js';
import {
    loadMcpConfig, saveMcpServer, removeMcpServer,
    connectAllMcpServers, connectMcpServer, getMcpToolSchemas
} from '../../mcp/registry.js';

function renderStatus(baseDir: string): void {
    const cfg = loadMcpConfig(baseDir);
    const names = Object.keys(cfg.mcpServers);
    console.log(chalk.cyan('\n[MCP] Model Context Protocol — Registered Servers'));
    if (names.length === 0) {
        console.log(chalk.dim('  Belum ada server. Contoh daftar:'));
        console.log(chalk.dim('  /mcp add github npx -y @modelcontextprotocol/server-github'));
        console.log(chalk.dim('  /mcp connect'));
        return;
    }
    for (const name of names) {
        const conf = cfg.mcpServers[name];
        console.log(`  ${chalk.bold(name.padEnd(16))} ${chalk.dim(conf.command)} ${(conf.args || []).join(' ')}`);
    }
    const schemas = getMcpToolSchemas();
    console.log(chalk.green(`\n  Tools MCP aktif di schema agent: ${schemas.length}`));
}

export const handleMcpCommands: CommandHandler = async (text: string, ctx: CliContext): Promise<boolean> => {
    if (!text.startsWith('/mcp')) return false;
    const baseDir = ctx.baseDir || process.cwd();
    const parts = text.trim().split(/\s+/);
    const sub = parts[1]?.toLowerCase();

    try {
        switch (sub) {
            case undefined: {
                renderStatus(baseDir);
                break;
            }
            case 'connect': {
                const target = parts[2];
                const results = target
                    ? [await connectMcpServer(target, baseDir)].map(r => ({ name: target, ...r }))
                    : await connectAllMcpServers(baseDir);
                for (const r of results) {
                    if (r.ok) console.log(chalk.green(`  ✔ ${r.name}: terhubung (${r.tools} tools dimuat)`));
                    else console.log(chalk.red(`  ✖ ${r.name}: ${r.error}`));
                }
                break;
            }
            case 'add': {
                const name = parts[2];
                const rest = parts.slice(3);
                if (!name || rest.length === 0 || rest[0].toLowerCase() === 'add') {
                    console.log(chalk.yellow('Pemakaian: /mcp add <nama> <command> [args...]'));
                    break;
                }
                saveMcpServer(name, { command: rest[0], args: rest.slice(1) }, baseDir);
                console.log(chalk.green(`✔ Server '${name}' disimpan ke ${baseDir}/.ant/mcp.json`));
                console.log(chalk.dim(`  Jalankan '/mcp connect ${name}' untuk memuat tools-nya.`));
                break;
            }
            case 'remove': {
                const name = parts[2];
                if (!name) {
                    console.log(chalk.yellow('Pemakaian: /mcp remove <nama>'));
                    break;
                }
                console.log(removeMcpServer(name, baseDir)
                    ? chalk.green(`✔ Server '${name}' dihapus.`)
                    : chalk.red(`✖ Server '${name}' tidak ditemukan.`));
                break;
            }
            case 'tools': {
                const schemas = getMcpToolSchemas();
                if (schemas.length === 0) {
                    console.log(chalk.dim('Tidak ada tool MCP termuat. Jalankan /mcp connect dulu.'));
                    break;
                }
                console.log(chalk.cyan(`\n[MCP TOOLS] ${schemas.length} tool tersedia untuk SEMUA model:`));
                for (const t of schemas) {
                    console.log(`  • ${chalk.bold(t.name)} — ${chalk.dim(t.description.slice(0, 90))}`);
                }
                break;
            }
            default:
                console.log(chalk.yellow(`Sub-perintah /mcp tidak dikenal: ${sub}. Gunakan connect|add|remove|tools.`));
        }
    } catch (e: any) {
        console.log(chalk.red(`[MCP ERROR] ${e.message}`));
    }
    return true;
};
