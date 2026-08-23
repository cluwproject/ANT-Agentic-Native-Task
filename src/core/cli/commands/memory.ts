import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { CliContext } from '../types.js';
import { storeCockroachMemory, recallCockroachMemory, listCockroachMemories, setVaultMode, getVaultMode, checkCockroachHealth } from '../../memory/mindby_cockroach.js';
import { getBrainConfig } from '../../../shared/data.js';

export async function handleMemoryCommands(text: string, ctx: CliContext): Promise<boolean> {
    // ── /store ────────────────────────────────────────────────────────
    if (text.startsWith('/store')) {
        const memoryContent = text.replace(/^\/store\s*/, '').trim();
        if (!memoryContent) {
            console.log(chalk.yellow('  Usage: /store <important_memory_content>'));
            console.log(chalk.dim('  Example: /store Target submission for CockroachDB Hackathon is August 18, 2026.'));
            return true;
        }
        console.log(chalk.dim('  Translating & Persisting memory to Dual-Vault...'));

        // Redact secrets
        const sanitizedMemory = memoryContent
            .replace(/(?:sk-[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{33}|ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{82}|xox[baprs]-[a-zA-Z0-9_-]{10,})/g, '[REDACTED_API_KEY]')
            .replace(/(?:password|secret|token|api_key|apikey|bearer)\s*[:=]\s*["']?([^\s"']+)["']?/gi, '$1: [REDACTED_SECRET]');

        let finalMemoryContent = sanitizedMemory;
        try {
            const { chat } = await import('../../ai/index.js');
            const brain = await getBrainConfig();
            const translated = await chat(
                brain, 
                [{ role: 'user', content: `Translate the following text to English. ONLY output the translation, no quotes, no explanation: ${sanitizedMemory}` }], 
                [], 
                {}, 
                "You are a strict translation system."
            );
            if (translated && translated.content && translated.content.trim()) {
                finalMemoryContent = translated.content.trim();
                console.log(chalk.cyan(`  [TRANSLATED] ${finalMemoryContent}`));
            }
        } catch {
            // Silent fallback
        }

        const { storeMemory, getEmbedding } = await import('../../memory/memory.js');
        const memKey = `mem_${Date.now()}`;
        const embedding = await getEmbedding(finalMemoryContent).catch(() => []);
        await storeMemory('semantic', memKey, finalMemoryContent, ['cli_user', 'operator']);

        const cloudSuccess = await storeCockroachMemory(finalMemoryContent, embedding.length > 0 ? embedding : undefined, ['cli_user']);
        if (cloudSuccess) {
            console.log(chalk.green(`  [OK] Memory synced to Cloud CockroachDB & Local Vault (vector: ${embedding.length > 0 ? '768-dim' : 'text only'})`));
        } else {
            const syncQueuePath = path.join(process.cwd(), 'workspace', 'memories', 'pending_sync.json');
            try {
                await fs.promises.mkdir(path.dirname(syncQueuePath), { recursive: true });
                let queue: any[] = [];
                try { queue = JSON.parse(await fs.promises.readFile(syncQueuePath, 'utf-8')); } catch {}
                queue.push({ content: memoryContent, embedding, tags: ['cli_user'], timestamp: new Date().toISOString() });
                await fs.promises.writeFile(syncQueuePath, JSON.stringify(queue, null, 2));
                console.log(chalk.yellow(`  [OFFLINE QUEUE] Saved to local vault. Queued for CockroachDB sync (run /sync later).`));
            } catch {
                console.log(chalk.green(`  [OK] Saved to local semantic vault.`));
            }
        }
        console.log();
        return true;
    }

    // ── /recall ───────────────────────────────────────────────────────
    if (text.startsWith('/recall')) {
        const query = text.replace(/^\/recall\s*/, '').trim();
        if (!query) {
            console.log(chalk.yellow('  Usage: /recall <search_query>'));
            return true;
        }
        console.log(chalk.dim(`  Recalling memories matching: "${query}"...`));
        const { getEmbedding } = await import('../../memory/memory.js');
        const embedding = await getEmbedding(query).catch(() => []);
        const results = await recallCockroachMemory(embedding, 5);
        if (results.length === 0) {
            console.log(chalk.yellow('  No memories found matching that query.'));
        } else {
            console.log(chalk.cyan(`\n  Found ${results.length} relevant memories:`));
            results.forEach((m, idx) => {
                const sim = m.score !== undefined ? ` (score: ${(m.score * 100).toFixed(1)}%)` : '';
                console.log(`  ${chalk.bold(idx + 1)}. ${chalk.white(m.content)}${chalk.dim(sim)}`);
            });
        }
        console.log();
        return true;
    }

    // ── /memories ─────────────────────────────────────────────────────
    if (text === '/memories') {
        console.log(chalk.cyan('\n  Listing stored semantic memories:'));
        const memories = await listCockroachMemories(15);
        if (memories.length === 0) {
            console.log(chalk.yellow('  No semantic memories stored yet. Use /store to persist one.'));
        } else {
            memories.forEach((m, idx) => {
                console.log(`  ${chalk.bold(idx + 1)}. ${chalk.white(m.content)} ${chalk.dim(`(${m.createdAt})`)}`);
            });
        }
        console.log();
        return true;
    }

    // ── /vault ────────────────────────────────────────────────────────
    if (text.startsWith('/vault')) {
        const targetMode = text.replace(/^\/vault\s*/, '').trim().toLowerCase();
        if (targetMode === 'cloud' || targetMode === 'local') {
            setVaultMode(targetMode as any);
            console.log(chalk.green(`  [OK] Memory Vault mode switched to: ${chalk.bold(targetMode.toUpperCase())}`));
        } else {
            const current = getVaultMode();
            console.log(chalk.cyan(`  Current Memory Vault mode: ${chalk.bold(current.toUpperCase())}`));
            console.log(chalk.dim('  Usage: /vault <cloud|local>'));
        }
        console.log();
        return true;
    }

    // ── /sync ─────────────────────────────────────────────────────────
    if (text === '/sync') {
        const syncQueuePath = path.join(process.cwd(), 'workspace', 'memories', 'pending_sync.json');
        try {
            let queue: any[] = [];
            try { queue = JSON.parse(await fs.promises.readFile(syncQueuePath, 'utf-8')); } catch {}
            if (queue.length === 0) {
                console.log(chalk.cyan('  [OK] No pending memories to sync. Cloud vault is up to date.'));
                return true;
            }
            console.log(chalk.cyan(`\n[Sync] Syncing ${queue.length} offline memories to CockroachDB...`));
            let synced = 0;
            const failed: any[] = [];
            for (const item of queue) {
                const ok = await storeCockroachMemory(item.content, item.embedding?.length > 0 ? item.embedding : undefined, item.tags || []);
                if (ok) synced++;
                else failed.push(item);
            }
            await fs.promises.writeFile(syncQueuePath, JSON.stringify(failed, null, 2));
            console.log(chalk.green(`  [OK] Successfully synced ${synced}/${queue.length} memories to CockroachDB.`));
            if (failed.length > 0) {
                console.log(chalk.yellow(`  [WARN] ${failed.length} items remain in offline queue.`));
            }
        } catch (e: any) {
            console.log(chalk.red(`  [ERROR] Sync failed: ${e.message}`));
        }
        console.log();
        return true;
    }

    // ── /health ───────────────────────────────────────────────────────
    if (text === '/health') {
        console.log(chalk.cyan('\n[MindBy CockroachDB Health Audit]'));
        const health = await checkCockroachHealth();
        const statusColor = health.status === 'CONNECTED' ? chalk.green : health.status === 'LOCAL' ? chalk.cyan : chalk.red;
        console.log(`  Cluster Status : ${statusColor(health.status)}`);
        console.log(`  Details        : ${chalk.white(health.details)}`);
        console.log(`  Total Memories : ${chalk.white(health.totalMemories)}`);
        console.log(`  Total Evidences: ${chalk.white(health.totalEvidences)}`);
        console.log(`  Active Mode    : ${chalk.white(getVaultMode().toUpperCase())}`);
        console.log();
        return true;
    }

    return false;
}
