import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { storeMemory } from './memory.js';

const BASE_DIR = process.cwd();
const MEMORY_DIR = path.join(BASE_DIR, 'workspace', 'memories');
const PROCEDURES_FILE = path.join(MEMORY_DIR, 'procedures.json');
const CUSTOM_SKILLS_DIR = path.join(BASE_DIR, 'workspace', 'skills', 'custom');

export interface ProceduralRecord {
    id: string;
    profileId: string;
    targetDir: string;
    goal: string;
    verifiedAt: string;
    evidenceProof: string[];
    stepsSummary: string[];
    status: 'VERIFIED_GOLD_STANDARD';
}

/**
 * Procedural Skill Auto-Distillation Engine
 * - Automatically registers verified task recipes when MilestoneRunner passes VERIFY.
 * - Saves procedural metadata into workspace/memories/procedures.json.
 * - Seeds the cognitive system so future similar tasks recall the proven solution immediately.
 */
export async function distillMilestoneProcedure(
    profileId: string,
    targetDir: string,
    goal: string,
    evidenceProof: string[] = []
): Promise<ProceduralRecord | null> {
    try {
        await fs.mkdir(MEMORY_DIR, { recursive: true });
        await fs.mkdir(CUSTOM_SKILLS_DIR, { recursive: true });

        let procDb: { procedures: ProceduralRecord[] } = { procedures: [] };
        try {
            const raw = await fs.readFile(PROCEDURES_FILE, 'utf-8');
            procDb = JSON.parse(raw);
            if (!Array.isArray(procDb.procedures)) procDb.procedures = [];
        } catch {
            procDb = { procedures: [] };
        }

        const procId = `proc_${profileId.replace(/[^a-zA-Z0-9_]/g, '_')}_${Date.now()}`;
        const newRecord: ProceduralRecord = {
            id: procId,
            profileId,
            targetDir,
            goal,
            verifiedAt: new Date().toISOString(),
            evidenceProof,
            stepsSummary: ['INIT', 'SCAFFOLD', 'IMPLEMENT', 'VERIFY', 'SECURE'],
            status: 'VERIFIED_GOLD_STANDARD'
        };

        // Prepend new record and cap at 100
        procDb.procedures.unshift(newRecord);
        procDb.procedures = procDb.procedures.slice(0, 100);

        await fs.writeFile(PROCEDURES_FILE, JSON.stringify(procDb, null, 2));

        // Also store into Semantic Memory as a verified procedure pattern
        const summaryText = `[PROVEN PROCEDURAL SKILL: ${profileId.toUpperCase()}] Goal: ${goal}. Verified at ${newRecord.verifiedAt}. Evidence: ${evidenceProof.join(', ') || 'N/A'}. Steps: ${newRecord.stepsSummary.join(' -> ')}`;
        await storeMemory('semantic', `procedural_${procId}`, summaryText, ['procedural_skill', profileId, 'gold_standard']);

        Logger.log('INFO', `Procedural Skill distilled: ${procId} (${profileId})`, { evidenceCount: evidenceProof.length }, 'SKILL');
        return newRecord;
    } catch (e: any) {
        Logger.log('ERROR', `Failed to distill procedural skill: ${e.message}`, {}, 'SKILL');
        return null;
    }
}
