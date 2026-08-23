import chalk from 'chalk';
import { initCockroachDB } from '../memory/mindby_cockroach.js';
import { enforceAuthGate } from '../../security/auth.js';
import { SelfHealer } from '../healing.js';
import { ensureIdentity } from './identity.js';

export async function bootSystem(sessionId: string, activeEnvPath: string): Promise<void> {
    // 1. Auth & Identity
    try {
        await enforceAuthGate();
        await ensureIdentity(activeEnvPath);
    } catch (e: any) {
        console.error(chalk.red(`[FATAL] Auth System Error: ${e.message}`));
        process.exit(1);
    }

    // 2. Self-Healing Startup Scan
    try {
        const diagnosis = await SelfHealer.diagnose('CLI Startup Scan');
        if (diagnosis.anomaliesDetected.length > 0) {
            console.log(chalk.yellow(`\n[SELF-HEALER] Terdeteksi ${diagnosis.anomaliesDetected.length} anomali pada sistem.`));
            diagnosis.remediationsApplied.forEach(r => {
                console.log(chalk.green(`  ✓ ${r}`));
            });
            console.log(chalk.green(`[OK] Semua anomali telah diperbaiki secara otonom.\n`));
        }
    } catch {
        // Silently continue
    }

    // 3. Cognitive DB, Event Bus, Proactive Engine & Scheduler
    try {
        await initCockroachDB();
        const { ANT_Bus } = await import('../events.js');
        await import('../events_subscriber.js');
        
        const { startProactiveEngine, startHeartbeat } = await import('../proactive.js');
        startProactiveEngine();
        startHeartbeat();
        
        const { startScheduler } = await import('../scheduler.js');
        startScheduler();
        
        ANT_Bus.emit('ant:started', { session: sessionId, time: new Date().toISOString() });
    } catch (e: any) {
        console.log(chalk.yellow(`[BOOT WARN] Urat saraf ANT gagal distart: ${e.message}`));
    }
}
