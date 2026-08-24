// ============================================================================
// ANT — MCP Registry — Config, Connection Pool & Tool Schema Bridge
// ============================================================================
// Mengelola kumpulan MCP server dari `.ant/mcp.json`, menyediakan:
//   1. add/remove/list konfigurasi server (persisten)
//   2. connect/disconnect runtime (connection pool)
//   3. getMcpToolSchemas() → entri schema tool bernama mcp__<server>__<tool>
//      yang di-merge otomatis ke seluruh provider declarations (OpenAI/
//      Anthropic/Gemini) sehingga SEMUA model bisa memanggilnya.
//   4. callMcpTool() → routing eksekusi dari actions/index.ts
// ============================================================================

import fs from 'fs';
import path from 'path';
import { Logger } from '../../utils/logger.js';
import { McpStdioClient, McpToolInfo } from './client.js';

export interface McpServerConfig {
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

interface McpConfigFile {
    mcpServers: Record<string, McpServerConfig>;
}

const clients = new Map<string, McpStdioClient>();
let cachedTools: Array<McpToolInfo & { server: string }> = [];

export function mcpConfigPath(baseDir: string = process.cwd()): string {
    return path.join(baseDir, '.ant', 'mcp.json');
}

export function loadMcpConfig(baseDir: string = process.cwd()): McpConfigFile {
    try {
        const p = mcpConfigPath(baseDir);
        if (!fs.existsSync(p)) return { mcpServers: {} };
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return { mcpServers: raw?.mcpServers && typeof raw.mcpServers === 'object' ? raw.mcpServers : {} };
    } catch {
        return { mcpServers: {} };
    }
}

export function saveMcpServer(name: string, config: McpServerConfig, baseDir: string = process.cwd()): void {
    const cfg = loadMcpConfig(baseDir);
    cfg.mcpServers[name] = config;
    const p = mcpConfigPath(baseDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
}

export function removeMcpServer(name: string, baseDir: string = process.cwd()): boolean {
    const cfg = loadMcpConfig(baseDir);
    if (!cfg.mcpServers[name]) return false;
    delete cfg.mcpServers[name];
    const p = mcpConfigPath(baseDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
    return true;
}


/** Connect (atau reuse) satu MCP server dan refresh cache tools-nya. */
export async function connectMcpServer(name: string, baseDir: string = process.cwd()): Promise<{ ok: boolean; tools: number; error?: string }> {
    const cfg = loadMcpConfig(baseDir);
    const conf = cfg.mcpServers[name];
    if (!conf) return { ok: false, tools: 0, error: `Server '${name}' tidak terdaftar di .ant/mcp.json` };

    let client = clients.get(name);
    if (!client || !client.isRunning) {
        client?.stop();
        client = new McpStdioClient(name, conf.command, conf.args || [], conf.env || {});
        clients.set(name, client);
    }
    try {
        await client.start();
        const tools = await client.listTools();
        // Refresh cache: buang tool lama milik server ini, tambah yang baru
        cachedTools = cachedTools.filter(t => t.server !== name);
        for (const t of tools) cachedTools.push({ ...t, server: name });
        await Logger.log('INFO', `MCP server '${name}' terhubung (${tools.length} tools).`, {}, 'MCP');
        return { ok: true, tools: tools.length };
    } catch (e: any) {
        clients.delete(name);
        client.stop();
        return { ok: false, tools: 0, error: e.message };
    }
}

/** Connect semua server terdaftar (toleran kegagalan per-server). */
export async function connectAllMcpServers(baseDir: string = process.cwd()): Promise<Array<{ name: string; ok: boolean; tools: number; error?: string }>> {
    const cfg = loadMcpConfig(baseDir);
    const results: Array<{ name: string; ok: boolean; tools: number; error?: string }> = [];
    for (const name of Object.keys(cfg.mcpServers)) {
        const r = await connectMcpServer(name, baseDir);
        results.push({ name, ...r });
    }
    return results;
}

export function disconnectAllMcpServers(): void {
    for (const [, c] of clients) c.stop();
    clients.clear();
}

/** Cache tools (sync) untuk digabungkan ke provider declarations. */
export function getCachedMcpTools(): Array<McpToolInfo & { server: string }> {
    return cachedTools;
}


/** Entri schema ala antToolsSchema dengan nama unik mcp__<server>__<tool>. */
export function getMcpToolSchemas(): Array<{ name: string; description: string; parameters: any }> {
    return cachedTools.map(t => ({
        name: `mcp__${t.server}__${t.name}`,
        description: `[MCP:${t.server}] ${t.description || t.name}`,
        parameters: sanitizeSchema(t.inputSchema)
    }));
}

function sanitizeSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
    return schema;
}

export function isMcpTool(toolName: string): boolean {
    return toolName.startsWith('mcp__');
}

/** Parse nama tool gabungan → {server, tool}. Return null jika format salah. */
export function parseMcpToolName(fullName: string): { server: string; tool: string } | null {
    const parts = fullName.split('__');
    if (parts.length < 3 || parts[0] !== 'mcp') return null;
    return { server: parts[1], tool: parts.slice(2).join('__') };
}

/** Eksekusi tool MCP via connection pool. */
export async function callMcpTool(fullName: string, args: Record<string, any>): Promise<{ text: string; raw: any }> {
    const parsed = parseMcpToolName(fullName);
    if (!parsed) throw new Error(`Nama MCP tool tidak valid: ${fullName}`);
    let client = clients.get(parsed.server);
    if (!client || !client.isRunning) {
        const r = await connectMcpServer(parsed.server);
        if (!r.ok) throw new Error(`Gagal konek MCP '${parsed.server}': ${r.error}`);
        client = clients.get(parsed.server)!;
    }
    return client.callTool(parsed.tool, args);
}
