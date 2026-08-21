import { describe, it } from 'node:test';
import assert from 'node:assert';
import { HANDLED_PREFIXES, dispatchSlash } from '../../src/core/cli/commands/index.js';
import { SLASH_COMMANDS } from '../../src/core/slash_menu.js';
import type { CliContext } from '../../src/core/cli/types.js';

describe('Slash Commands & Registry Audit', () => {
    const mockCtx: CliContext = {
        sessionId: 'test-session',
        history: [],
        baseDir: process.cwd(),
        activeEnvPath: '/tmp/.env'
    };

    it('should include all main slash menu command roots in HANDLED_PREFIXES', () => {
        SLASH_COMMANDS.forEach(item => {
            const rootPrefix = item.command.split(' ')[0];
            assert.ok(
                (HANDLED_PREFIXES as readonly string[]).includes(rootPrefix),
                `Prefix ${rootPrefix} from slash_menu is missing in HANDLED_PREFIXES`
            );
        });
    });

    it('should intercept unknown slash command and return true (guard active)', async () => {
        const handled = await dispatchSlash('/non_existent_command_12345', mockCtx);
        assert.strictEqual(handled, true);
    });

    it('should return false for regular natural language prompts (fallthrough to agent loop)', async () => {
        const handled = await dispatchSlash('Halo ANT, tolong bantu analisa file ini', mockCtx);
        assert.strictEqual(handled, false);
    });
});
