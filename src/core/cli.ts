/**
 * ═══════════════════════════════════════════════════════════════
 * ANT — AGENTIC NATIVE TASK (CLI ROOT ENTRYPOINT)
 * ═══════════════════════════════════════════════════════════════
 */

import { main } from './cli/index.js';

export { main } from './cli/index.js';
export * from './cli/types.js';
export * from './cli/identity.js';

main().catch(err => {
    console.error('Fatal CLI Error:', err);
    process.exit(1);
});
