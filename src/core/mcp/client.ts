// ============================================================================
// ANT — MCP (Model Context Protocol) Stdio Client
// ============================================================================
// Implementasi MCP client transport stdio (newline-delimited JSON-RPC 2.0)
// sesuai spesifikasi MCP. Dengan ini SEMUA model di ANT (Gemini/Claude/OpenAI/
// Ollama lokal) bisa memakai ribuan tools dari ekosistem MCP: GitHub, Slack,
// database, browser, file system remote, dll.
//
// Konfigurasi server disimpan di `.ant/mcp.json`:
// {
//   "mcpServers": {
//     "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": {} }
//   }
// }
// ============================================================================

import { spawn, type ChildProcess } from 'child_process';

export const MCP_PROTOCOL_VERSION = '2024-11-05';

export class McpError extends Error {
    constructor(message: string, public code?: number | string) {
        super(message);
        this.name = 'McpError';
    }
}

export interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema?: Record<string, any>;
}

interface PendingRequest {
    resolve: (v: any) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * Client MCP satu server via stdio. Satu instance = satu child process.
 */
export class McpStdioClient {
    private proc: ChildProcess | null = null;
    private nextId = 1;
    private pending = new Map<number, PendingRequest>();
    private buffer = '';
    private stderrTail: string[] = [];
    public serverInfo: any = null;

    constructor(
        public readonly name: string,
        private readonly command: string,
        private readonly args: string[] = [],
        private readonly env: Record<string, string> = {},
        private readonly requestTimeoutMs = 30000
    ) {}

    get isRunning(): boolean {
        return !!this.proc && this.proc.exitCode === null && !this.proc.killed;
    }

    /** Spawn proses + handshake initialize → initialized notification. */
    async start(): Promise<void> {
        if (this.isRunning) return;

        this.proc = spawn(this.command, this.args, {
            shell: false,
            env: { ...process.env, ...this.env },
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true
        });

        this.proc.stdout!.setEncoding('utf-8');
        this.proc.stdout!.on('data', (chunk: string) => this.handleStdout(chunk));
        this.proc.stderr!.setEncoding('utf-8');
        this.proc.stderr!.on('data', (chunk: string) => {
            this.stderrTail.push(chunk);
            if (this.stderrTail.length > 50) this.stderrTail.shift();
        });
        this.proc.on('exit', code => {
            for (const [, p] of this.pending) {
                clearTimeout(p.timer);
                p.reject(new McpError(`MCP server '${this.name}' keluar (code ${code}). ${this.stderrTail.slice(-3).join('')}`));
            }
            this.pending.clear();
            this.proc = null;
        });

        try {
            const initResult = await this.request('initialize', {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: { tools: {} },
                clientInfo: { name: 'ant-cli', version: '0.4.0-alpha' }
            });
            this.serverInfo = initResult?.serverInfo ?? null;
            this.notify('notifications/initialized', {});
        } catch (err) {
            this.stop();
            throw err;
        }
    }

    private handleStdout(chunk: string): void {
        this.buffer += chunk;
        let nlIdx: number;
        while ((nlIdx = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, nlIdx).trim();
            this.buffer = this.buffer.slice(nlIdx + 1);
            if (!line) continue;
            let msg: any;
            try {
                msg = JSON.parse(line);
            } catch {
                continue; // bukan JSON valid — abaikan
            }
            const id = msg?.id;
            if (id !== undefined && id !== null && this.pending.has(id)) {
                const p = this.pending.get(id)!;
                this.pending.delete(id);
                clearTimeout(p.timer);
                if (msg.error) {
                    p.reject(new McpError(msg.error.message || 'MCP request error', msg.error.code));
                } else {
                    p.resolve(msg.result);
                }
            }
        }
    }

    async request(method: string, params: any): Promise<any> {
        if (!this.isRunning) throw new McpError(`MCP server '${this.name}' belum berjalan. (${method})`);
        const id = this.nextId++;
        const message = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new McpError(`Timeout ${this.requestTimeoutMs}ms pada MCP '${this.name}' (${method}).`));
            }, this.requestTimeoutMs);
            this.pending.set(id, { resolve, reject, timer });
            this.proc!.stdin!.write(message);
        });
    }

    private notify(method: string, params: any): void {
        if (!this.isRunning) return;
        try {
            this.proc!.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
        } catch {
            // fire-and-forget
        }
    }

    /** tools/list → daftar tool yang diekspos server ini. */
    async listTools(): Promise<McpToolInfo[]> {
        const res = await this.request('tools/list', {});
        return Array.isArray(res?.tools) ? res.tools : [];
    }

    /** tools/call → eksekusi tool. Return konten teks + raw result. */
    async callTool(toolName: string, args: Record<string, any>): Promise<{ text: string; raw: any }> {
        const res = await this.request('tools/call', { name: toolName, arguments: args ?? {} });
        const content = Array.isArray(res?.content) ? res.content : [];
        const text = content
            .filter((c: any) => c.type === 'text' && typeof c.text === 'string')
            .map((c: any) => c.text)
            .join('\n');
        return { text, raw: res };
    }

    stop(): void {
        if (!this.proc) return;
        try {
            this.proc.kill();
        } catch {}
        this.proc = null;
        this.pending.clear();
    }
}

