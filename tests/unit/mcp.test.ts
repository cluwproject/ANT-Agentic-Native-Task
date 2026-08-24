import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpStdioClient } from '../../src/core/mcp/client.js';
import {
    loadMcpConfig, saveMcpServer, removeMcpServer,
    parseMcpToolName, isMcpTool, getMcpToolSchemas
} from '../../src/core/mcp/registry.js';

// ── Mock MCP server (newline-delimited JSON-RPC 2.0 over stdio) ──────────
function createMockServerScript(): string {
    return `
const pending = new Map();
let nextId = 1;
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }
function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
process.stdin.setEncoding('utf-8');
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.method === 'initialize') {
      reply(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-server', version: '1.0.0' } });
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    } else if (msg.method === 'tools/list') {
      reply(msg.id, { tools: [
        { name: 'echo', description: 'Echo teks balik', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
        { name: 'add', description: 'Jumlahkan dua angka', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } }
      ]});
    } else if (msg.method === 'tools/call') {
      const args = msg.params.arguments || {};
      if (msg.params.name === 'echo') reply(msg.id, { content: [{ type: 'text', text: 'ECHO: ' + (args.text || '') }] });
      else if (msg.params.name === 'add') reply(msg.id, { content: [{ type: 'text', text: String((args.a || 0) + (args.b || 0)) }] });
      else reply(msg.id, { content: [{ type: 'text', text: 'unknown tool' }] });
    } else if (msg.id !== undefined) {
      reply(msg.id, {});
    }
  }
});
`;
}

describe('MCP registry — config persistence', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ant-mcp-'));

    after(() => {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    });

    it('config awal kosong', () => {
        assert.deepStrictEqual(loadMcpConfig(dir).mcpServers, {});
    });

    it('save & load server config', () => {
        saveMcpServer('mock', { command: 'node', args: ['server.mjs'] }, dir);
        const cfg = loadMcpConfig(dir);
        assert.strictEqual(cfg.mcpServers.mock.command, 'node');
        assert.deepStrictEqual(cfg.mcpServers.mock.args, ['server.mjs']);
    });

    it('remove server yang ada → true, yang tidak ada → false', () => {
        assert.strictEqual(removeMcpServer('mock', dir), true);
        assert.strictEqual(removeMcpServer('tidak-ada', dir), false);
    });
});

describe('MCP registry — tool naming', () => {
    it('isMcpTool mendeteksi prefix mcp__', () => {
        assert.strictEqual(isMcpTool('mcp__github__list_prs'), true);
        assert.strictEqual(isMcpTool('read_file'), false);
    });

    it('parseMcpToolName memecah server & tool', () => {
        const parsed = parseMcpToolName('mcp__github__list_prs');
        assert.deepStrictEqual(parsed, { server: 'github', tool: 'list_prs' });
    });

    it('parseMcpToolName null untuk format salah', () => {
        assert.strictEqual(parseMcpToolName('read_file'), null);
        assert.strictEqual(parseMcpToolName('mcp__onlyone'), null);
    });

    it('getMcpToolSchemas selalu array (kosong saat belum konek)', () => {
        assert.ok(Array.isArray(getMcpToolSchemas()));
    });
});

describe('MCP stdio client — end-to-end dengan mock server', () => {
    it('handshake + listTools + callTool bekerja', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ant-mcpc-'));
        const scriptPath = path.join(dir, 'mock-mcp-server.mjs');
        fs.writeFileSync(scriptPath, createMockServerScript());

        const client = new McpStdioClient('mock', process.execPath, [scriptPath], {}, 15000);
        try {
            await client.start();
            assert.ok(client.isRunning);
            assert.strictEqual(client.serverInfo?.name, 'mock-server');

            const tools = await client.listTools();
            assert.strictEqual(tools.length, 2);
            assert.ok(tools.some(t => t.name === 'echo'));

            const echo = await client.callTool('echo', { text: 'halo ant' });
            assert.strictEqual(echo.text, 'ECHO: halo ant');

            const add = await client.callTool('add', { a: 20, b: 22 });
            assert.strictEqual(add.text, '42');
        } finally {
            client.stop();
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
        }
    });

    it('request ke server mati melempar error jelas', async () => {
        const client = new McpStdioClient('dead', process.execPath, ['-e', 'process.exit(1)']);
        await assert.rejects(() => client.start());
        assert.strictEqual(client.isRunning, false);
    });
});
