import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RateLimiter } from '../../src/core/agent_loop/permissions.js';

describe('RateLimiter', () => {
    it('should allow calls within the limit', () => {
        const limiter = new RateLimiter();
        for (let i = 0; i < 5; i++) {
            assert.strictEqual(limiter.checkLimit('shell_exec', 10, 60000), true);
        }
    });

    it('should block calls that exceed the limit within the time window', () => {
        const limiter = new RateLimiter();
        const limit = 3;
        for (let i = 0; i < limit; i++) {
            limiter.checkLimit('web_request', limit, 60000);
        }
        // The next call should be rejected
        assert.strictEqual(limiter.checkLimit('web_request', limit, 60000), false);
    });

    it('should track different tools independently', () => {
        const limiter = new RateLimiter();
        const limit = 2;
        limiter.checkLimit('tool_a', limit, 60000);
        limiter.checkLimit('tool_a', limit, 60000);
        assert.strictEqual(limiter.checkLimit('tool_a', limit, 60000), false);
        // tool_b should still be allowed
        assert.strictEqual(limiter.checkLimit('tool_b', limit, 60000), true);
    });

    it('should reset limits when clear() is called', () => {
        const limiter = new RateLimiter();
        const limit = 2;
        limiter.checkLimit('tool_a', limit, 60000);
        limiter.checkLimit('tool_a', limit, 60000);
        assert.strictEqual(limiter.checkLimit('tool_a', limit, 60000), false);
        limiter.clear();
        assert.strictEqual(limiter.checkLimit('tool_a', limit, 60000), true);
    });
});
