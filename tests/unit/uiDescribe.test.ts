import { describe, it } from 'node:test';
import assert from 'node:assert';
import { describeToolCall } from '../../src/core/agent_loop/ui.js';

describe('describeToolCall — unified tool label & arg summary', () => {
    it('label tool native sesuai map', () => {
        assert.strictEqual(describeToolCall('read_file', { file: 'a.ts' }).label, 'Read');
        assert.strictEqual(describeToolCall('shell_exec', {}).label, 'Bash');
        assert.strictEqual(describeToolCall('run_tests', {}).label, 'Test');
    });

    it('tool tidak dikenal → capitalize', () => {
        const d = describeToolCall('custom_thing', {});
        assert.strictEqual(d.label, 'Custom_thing');
    });

    it('argSummary mengambil field yang relevan per tool', () => {
        assert.strictEqual(describeToolCall('read_file', { file: 'src/index.ts' }).argSummary, 'src/index.ts');
        assert.strictEqual(describeToolCall('shell_exec', { command: 'npm test' }).argSummary, 'npm test');
        assert.strictEqual(describeToolCall('list_dir', {}).argSummary, '.');
    });

    it('argumen panjang dipotong dengan ellipsis di tengah', () => {
        const d = describeToolCall('read_file', { file: 'x'.repeat(200) });
        assert.ok(d.argSummary.length < 120);
        assert.ok(d.argSummary.includes('…'));
    });

    it('tool MCP mendapat label cantik MCP[server] › tool', () => {
        const d = describeToolCall('mcp__demo__greet', { name: 'Ard' });
        assert.strictEqual(d.label, 'MCP[demo] › greet');
        assert.strictEqual(d.argSummary, 'Ard');
    });

    it('tool MCP tanpa args tetap aman', () => {
        const d = describeToolCall('mcp__github__list_prs', {});
        assert.strictEqual(d.label, 'MCP[github] › list_prs');
        assert.strictEqual(d.argSummary, '');
    });

    it('args undefined tidak melempar error', () => {
        assert.doesNotThrow(() => describeToolCall('read_file'));
    });
});
