// ============================================================================
// ANT — Unit Tests — Rate Limiter (Permissions)
// ============================================================================
// Tests for the security rate limiter that prevents runaway AI tool loops.

import { RateLimiter } from '../../src/core/agent_loop/permissions.js';

describe('RateLimiter', () => {

    it('should allow calls within the limit', () => {
        const limiter = new RateLimiter();
        for (let i = 0; i < 5; i++) {
            expect(limiter.checkLimit('shell_exec', 10, 60000)).toBe(true);
        }
    });

    it('should block calls that exceed the limit within the time window', () => {
        const limiter = new RateLimiter();
        const limit = 3;
        for (let i = 0; i < limit; i++) {
            limiter.checkLimit('web_request', limit, 60000);
        }
        // The next call should be rejected
        expect(limiter.checkLimit('web_request', limit, 60000)).toBe(false);
    });

    it('should track limits independently per tool', () => {
        const limiter = new RateLimiter();
        const limit = 2;
        limiter.checkLimit('tool_a', limit, 60000);
        limiter.checkLimit('tool_a', limit, 60000);

        // tool_a should be blocked
        expect(limiter.checkLimit('tool_a', limit, 60000)).toBe(false);
        // tool_b is on a separate counter, should still be allowed
        expect(limiter.checkLimit('tool_b', limit, 60000)).toBe(true);
    });

    it('should allow calls again after the time window expires', async () => {
        const limiter = new RateLimiter();
        const windowMs = 50; // very short window for testing
        limiter.checkLimit('fast_tool', 1, windowMs);

        // Should be blocked immediately
        expect(limiter.checkLimit('fast_tool', 1, windowMs)).toBe(false);

        // Wait for window to expire
        await new Promise(resolve => setTimeout(resolve, windowMs + 10));

        // Should be allowed again
        expect(limiter.checkLimit('fast_tool', 1, windowMs)).toBe(true);
    });
});
