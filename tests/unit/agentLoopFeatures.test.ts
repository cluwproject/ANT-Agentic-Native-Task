import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { nativeCallsToToolCalls } from '../../src/core/agent_loop/toolCallParser.js';
import { loadHookConfig, runPreToolCallHooks, runPostToolCallHooks } from '../../src/core/agent_loop/hooks.js';

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ant-hooks-'));
}

describe('nativeCallsToToolCalls (native tool-use bridge)', () => {
    it('return array kosong untuk input null/undefined', () => {
        assert.deepStrictEqual(nativeCallsToToolCalls(null), []);
        assert.deepStrictEqual(nativeCallsToToolCalls(undefined), []);
        assert.deepStrictEqual(nativeCallsToToolCalls('bukan array' as any), []);
    });

    it('konversi format OpenAI (args object)', () => {
        const calls = nativeCallsToToolCalls([{ name: 'read_file', args: { file: 'a.ts' } }]);
        assert.deepStrictEqual(calls, [{ tool: 'read_file', args: { file: 'a.ts' } }]);
    });

    it('konversi format Anthropic (arguments string JSON)', () => {
        const calls = nativeCallsToToolCalls([{ name: 'write_file', arguments: '{"file":"b.ts","content":"hi"}' }]);
        assert.strictEqual(calls[0].tool, 'write_file');
        assert.strictEqual(calls[0].args.content, 'hi');
    });

    it('konversi format Gemini (input object)', () => {
        const calls = nativeCallsToToolCalls([{ name: 'shell_exec', input: { command: 'ls' } }]);
        assert.strictEqual(calls[0].args.command, 'ls');
    });

    it('abaikan entry tanpa nama & args rusak jadi {}', () => {
        const calls = nativeCallsToToolCalls([
            { argsString: '{}' },
            { name: 'ok_tool', args: '{broken json' }
        ]);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].tool, 'ok_tool');
        assert.deepStrictEqual(calls[0].args, {});
    });
});

describe('hooks (.ant/hooks.json)', () => {
    it('return config kosong jika file tidak ada', () => {
        const dir = makeTempDir();
        const cfg = loadHookConfig(dir, true);
        assert.deepStrictEqual(cfg.pre_tool_call || [], []);
        assert.deepStrictEqual(cfg.post_tool_call || [], []);
    });

    it('muat konfigurasi string & object entries', () => {
        const dir = makeTempDir();
        fs.mkdirSync(path.join(dir, '.ant'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.ant', 'hooks.json'), JSON.stringify({
            pre_tool_call: [{ command: 'node guard.js', timeoutMs: 5000 }, "echo simple"],
            post_tool_call: ["node notify.js"]
        }));
        const cfg = loadHookConfig(dir, true);
        assert.strictEqual(cfg.pre_tool_call!.length, 2);
        assert.strictEqual(cfg.pre_tool_call![0].command, 'node guard.js');
        assert.strictEqual(cfg.pre_tool_call![0].timeoutMs, 5000);
        assert.strictEqual(cfg.post_tool_call![0].command, 'node notify.js');
    });

    it('pre hook exit 0 → allowed', async () => {
        const dir = makeTempDir();
        fs.mkdirSync(path.join(dir, '.ant'), { recursive: true });
        const cmd = process.platform === 'win32' ? 'exit /b 0' : 'exit 0';
        fs.writeFileSync(path.join(dir, '.ant', 'hooks.json'), JSON.stringify({ pre_tool_call: [cmd] }));
        const verdict = await runPreToolCallHooks('read_file', {}, dir);
        assert.strictEqual(verdict.allowed, true);
    });

    it('pre hook exit >= 2 → VETO tool', async () => {
        const dir = makeTempDir();
        fs.mkdirSync(path.join(dir, '.ant'), { recursive: true });
        const cmd = process.platform === 'win32' ? 'exit /b 2' : 'exit 2';
        fs.writeFileSync(path.join(dir, '.ant', 'hooks.json'), JSON.stringify({ pre_tool_call: [cmd] }));
        const verdict = await runPreToolCallHooks('delete_file', { file: 'x' }, dir);
        assert.strictEqual(verdict.allowed, false);
        assert.strictEqual(verdict.exitCode, 2);
    });

    it('post hook tidak pernah throw meski gagal', async () => {
        const dir = makeTempDir();
        fs.mkdirSync(path.join(dir, '.ant'), { recursive: true });
        const cmd = process.platform === 'win32' ? 'exit /b 9' : 'exit 9';
        fs.writeFileSync(path.join(dir, '.ant', 'hooks.json'), JSON.stringify({ post_tool_call: [cmd] }));
        await assert.doesNotReject(() => runPostToolCallHooks('read_file', {}, { ok: true }, dir));
    });

    it('hook menerima env ANTHOOK_TOOL', async () => {
        const dir = makeTempDir();
        fs.mkdirSync(path.join(dir, '.ant'), { recursive: true });
        // Script menulis nilai env ke file sementara lalu exit 2 (veto agar terdeteksi)
        const marker = path.join(dir, 'env-marker.txt');
        const script = process.platform === 'win32'
            ? `echo %ANTHOOK_TOOL%> "${marker}"\r\nexit /b 3`
            : `echo $ANTHOOK_TOOL > "${marker}"\nexit 3`;
        fs.writeFileSync(path.join(dir, '.ant', 'hooks.json'), JSON.stringify({ pre_tool_call: [script] }));
        await runPreToolCallHooks('write_file', {}, dir);
        assert.ok(fs.existsSync(marker), 'hook harus benar-benar dieksekusi');
        const content = fs.readFileSync(marker, 'utf-8');
        assert.ok(content.includes('write_file'));
    });
});
