import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { storeMemory, getEmbedding } from './memory.js';
import { storeCockroachMemory } from './mindby_cockroach.js';

const BASE_DIR = process.cwd();
const MEMORY_DIR = path.join(BASE_DIR, 'workspace', 'memories');
const CONTEXT_FILE = path.join(MEMORY_DIR, 'context.json');
const EPISODIC_FILE = path.join(MEMORY_DIR, 'episodic.json');
const CONSOLIDATION_LOG = path.join(MEMORY_DIR, 'consolidation_audit.json');

export interface ConsolidationResult {
    status: 'success' | 'empty' | 'error';
    promotedCount: number;
    prunedWorkingKeys: number;
    summary: string;
    details?: string[];
}

/**
 * Autonomous Memory Consolidation Engine ("Sleep & Prune Cycle")
 * - Scans working memory & raw episodic logs.
 * - Extracts reusable factual knowledge & environment configurations.
 * - Promotes distilled knowledge into long-term Semantic Dual-Vault (Local JSON + CockroachDB).
 * - Prunes temporary working context cache to keep RAM/disk footprint small on Termux.
 */
export async function consolidateMemories(): Promise<ConsolidationResult> {
    try {
        await fs.mkdir(MEMORY_DIR, { recursive: true });

        let workingData: Record<string, any> = {};
        let episodicData: Record<string, any> = {};

        try {
            const rawWorking = await fs.readFile(CONTEXT_FILE, 'utf-8');
            workingData = JSON.parse(rawWorking);
        } catch { workingData = {}; }

        try {
            const rawEpisodic = await fs.readFile(EPISODIC_FILE, 'utf-8');
            episodicData = JSON.parse(rawEpisodic);
        } catch { episodicData = {}; }

        const workingKeys = Object.keys(workingData);
        const episodicKeys = Object.keys(episodicData);

        if (workingKeys.length === 0 && episodicKeys.length === 0) {
            return {
                status: 'empty',
                promotedCount: 0,
                prunedWorkingKeys: 0,
                summary: 'Working memory and episodic buffer are already clean and consolidated.'
            };
        }

        let promotedCount = 0;
        const details: string[] = [];

        // 1. Scan working memory keys for key project facts & configurations
        for (const key of workingKeys) {
            const entry = workingData[key];
            const content = typeof entry === 'string' ? entry : (entry?.data ? JSON.stringify(entry.data) : JSON.stringify(entry));
            const lowerContent = content.toLowerCase();
            
            // Heuristic filter: keep meaningful configuration / error lessons, skip conversational noise
            const isSignificant = content.length > 20 && (
                lowerContent.includes('error') || 
                lowerContent.includes('config') || 
                lowerContent.includes('version') || 
                lowerContent.includes('path') ||
                lowerContent.includes('port') ||
                lowerContent.includes('dependency') ||
                lowerContent.includes('endpoint') ||
                lowerContent.includes('profile')
            );

            if (isSignificant) {
                const semanticKey = `consolidated_${Date.now()}_${key.replace(/[^a-zA-Z0-9_]/g, '_')}`;
                const embedding = await getEmbedding(content).catch(() => []);
                
                await storeMemory('semantic', semanticKey, `[Consolidated Working Memory: ${key}] ${content}`, ['consolidated', 'auto_sleep_cycle']);
                await storeCockroachMemory(`[Consolidated] ${content}`, embedding.length > 0 ? embedding : undefined, ['consolidated', 'auto_sleep_cycle']).catch(() => false);
                
                promotedCount++;
                details.push(`Promoted key: ${key}`);
            }
        }

        // 2. Prune working memory buffer to prevent unbounded growth
        const prunedWorkingKeys = workingKeys.length;
        await fs.writeFile(CONTEXT_FILE, JSON.stringify({}, null, 2));

        // 3. Compact episodic log if it exceeds 100 entries (keep last 30)
        if (episodicKeys.length > 100) {
            const sortedKeys = episodicKeys.sort();
            const keysToKeep = sortedKeys.slice(-30);
            const compactedEpisodic: Record<string, any> = {};
            for (const k of keysToKeep) {
                compactedEpisodic[k] = episodicData[k];
            }
            await fs.writeFile(EPISODIC_FILE, JSON.stringify(compactedEpisodic, null, 2));
            details.push(`Compacted episodic memory from ${episodicKeys.length} to 30 entries.`);
        }

        // 4. Record consolidation audit trail
        let auditTrail: any[] = [];
        try {
            const rawAudit = await fs.readFile(CONSOLIDATION_LOG, 'utf-8');
            auditTrail = JSON.parse(rawAudit);
        } catch { auditTrail = []; }

        auditTrail.unshift({
            timestamp: new Date().toISOString(),
            promotedCount,
            prunedWorkingKeys,
            details
        });
        auditTrail = auditTrail.slice(0, 50); // Keep last 50 consolidation audits

        await fs.writeFile(CONSOLIDATION_LOG, JSON.stringify(auditTrail, null, 2));
        Logger.log('INFO', `Memory Consolidation complete: ${promotedCount} promoted, ${prunedWorkingKeys} working keys pruned.`, {}, 'MEMORY');

        return {
            status: 'success',
            promotedCount,
            prunedWorkingKeys,
            summary: `Memory Consolidation finished: ${promotedCount} knowledge nuggets promoted to Semantic Vault, ${prunedWorkingKeys} working entries cleaned.`,
            details
        };
    } catch (e: any) {
        Logger.log('ERROR', `Memory Consolidation failed: ${e.message}`, {}, 'MEMORY');
        return {
            status: 'error',
            promotedCount: 0,
            prunedWorkingKeys: 0,
            summary: `Memory Consolidation error: ${e.message}`
        };
    }
}
