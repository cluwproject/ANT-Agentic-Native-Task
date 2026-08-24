// ============================================================================
// ANT — CLI Argv — `ant mcp ...` (headless MCP management)
// ============================================================================
//   ant mcp list              → daftar server terdaftar
//   ant mcp add <n> <cmd...>  → daftarkan server
//   ant mcp remove <n>        → hapus server
//   ant mcp connect [n]       → konek + muat tools (exit non-zero jika gagal)
//   ant mcp tools             → daftar tool aktif (JSON-ready untuk CI)
// ============================================================================

import chalk from 'chalk';
import {
    loadMcpConfig, saveMcpServer, removeMcpServer,
    connectAllMcpServers, connectMcpServer, getMcpToolSchemas
} from '../../mcp/registry.js';

export async function handleMcpArgv(args: string[]): Promise<boolean> {
    if (args[0] !== 'mcp') return false;
    const sub = args[1] || 'list';

    switch (sub) {
        case 'list': {
            const cfg = loadMcpConfig();
            const names = Object.keys(cfg.mcpServers);
            console.log(chalk.cyan('[MCP] Registered servers:'));
            if (names.length === 0) console.log(chalk.dim('  (kosong)'));
            for (const name of names) {
                const c = cfg.mcpServers[name];
                console.log(`  ${name.padEnd(16)} ${c.command} ${(c.args || []).join(' ')}`);
            }
            return true;
        }
        case 'add': {
            const name = args[2];
            const rest = args.slice(3);
            if (!name || rest.length === 0) {
                console.log(chalk.yellow('Pemakaian: ant mcp add <nama> <command> [args...]'));
                process.exit(1);
            }
            saveMcpServer(name, { command: rest[0], args: rest.slice(1) });
            console.log(chalk.green(`✔ Server '${name}' tersimpan di .ant/mcp.json`));
            return true;
        }
        case 'remove': {
            const name = args[2];
            if (!name) { console.log(chalk.yellow('Pemakaian: ant mcp remove <nama>')); process.exit(1); }
            console.log(removeMcpServer(name)
                ? chalk.green(`✔ '${name}' dihapus.`)
                : chalk.red(`✖ '${name}' tidak ditemukan.`));
            return true;
        }
        case 'connect': {
            const target = args[2];
            const results = target
                ? [{ name: target, ...(await connectMcpServer(target)) }]
                : await connectAllMcpServers();
            let failed = false;
            for (const r of results) {
                if (r.ok) console.log(chalk.green(`✔ ${r.name}: ${r.tools} tools dimuat`));
                else { failed = true; console.log(chalk.red(`✖ ${r.name}: ${r.error}`)); }
            }
            if (failed && !process.env.CI) process.exitCode = 1;
            return true;
        }
        case 'tools': {
            // Headless mode = proses baru → cache tools kosong. Auto-connect
            // semua server terdaftar supaya daftar tools akurat.
            await connectAllMcpServers();
            const schemas = getMcpToolSchemas();
            console.log(JSON.stringify(schemas.map(s => ({ name: s.name, description: s.description })), null, 2));
            return true;
        }
        default:
            console.log(chalk.yellow(`Sub-perintah 'ant mcp ${sub}' tidak dikenal.`));
            return true;
    }
}
