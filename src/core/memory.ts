import fs from 'fs/promises';
import path from 'path';
import { getEmbedding } from './ai.js';
import { getBrainConfig } from '../shared/data.js';
import { Logger } from '../utils/logger.js';

const BASE_DIR = process.cwd();
const MEMORY_DIR = path.join(BASE_DIR, 'workspace', 'memories');
const CONTEXT_FILE = path.join(MEMORY_DIR, 'context.json'); // Short-term Working Memory
const EPISODIC_FILE = path.join(MEMORY_DIR, 'episodic.json'); // Long-term Raw Episodic Log
const SEMANTIC_FILE = path.join(MEMORY_DIR, 'semantic.json'); // Long-term Knowledge/Patterns
const CORE_FILE = path.join(MEMORY_DIR, 'core.json'); // Decision/Permanent Facts Memory

export interface MemoryEntry {
  data: any;
  embedding?: number[];
  updatedAt: string;
  tags?: string[];
  metadata?: any;
}

export interface PartitionedMemoryStats {
  shortTerm: { count: number; desc: string; status: string };
  longTerm: { episodicCount: number; semanticCount: number; desc: string; status: string };
  decision: { coreCount: number; constitutionCount: number; desc: string; status: string };
  behavioral: { proceduresCount: number; desc: string; status: string };
}

export async function initMemory() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

/**
 * Returns complete partitioned memory statistics for audit and analysis
 */
export async function getPartitionedMemoryStats(): Promise<PartitionedMemoryStats> {
  const PROCEDURES_FILE = path.join(MEMORY_DIR, 'procedures.json');
  
  let workingCount = 0;
  let episodicCount = 0;
  let semanticCount = 0;
  let coreCount = 0;
  let constitutionCount = 3; // Default sovereign rules count
  let proceduresCount = 0;

  try {
    const workingData = await fs.readFile(CONTEXT_FILE, 'utf-8').catch(() => '{}');
    workingCount = Object.keys(JSON.parse(workingData)).length;
  } catch {}

  try {
    const episodicData = await fs.readFile(EPISODIC_FILE, 'utf-8').catch(() => '{}');
    episodicCount = Object.keys(JSON.parse(episodicData)).length;
  } catch {}

  try {
    const semanticData = await fs.readFile(SEMANTIC_FILE, 'utf-8').catch(() => '{}');
    semanticCount = Object.keys(JSON.parse(semanticData)).length;
  } catch {}

  try {
    const coreData = await fs.readFile(CORE_FILE, 'utf-8').catch(() => '{}');
    coreCount = Object.keys(JSON.parse(coreData)).length;
  } catch {}

  try {
    const identityPath = path.join(BASE_DIR, 'cluw-genesis', 'core', 'identity.json');
    const identityJson = JSON.parse(await fs.readFile(identityPath, 'utf-8').catch(() => '{}'));
    if (identityJson.sovereign_rules) {
      constitutionCount = identityJson.sovereign_rules.length;
    }
  } catch {}

  try {
    const proceduresPath = path.join(MEMORY_DIR, 'procedures.json');
    const proceduresJson = JSON.parse(await fs.readFile(proceduresPath, 'utf-8').catch(() => '{}'));
    if (proceduresJson.procedures) {
      proceduresCount = proceduresJson.procedures.length;
    }
  } catch {}

  return {
    shortTerm: {
      count: workingCount,
      desc: "Cache & real-time live session context variables.",
      status: workingCount > 20 ? "Buffer Full (Auto-Recycling)" : "Optimal"
    },
    longTerm: {
      episodicCount,
      semanticCount,
      desc: "RAG sovereign memories of past chats & consolidated vector patterns.",
      status: "Synced & Active"
    },
    decision: {
      coreCount,
      constitutionCount,
      desc: "Immutable Sovereign Constitutional Rules & core decisions.",
      status: "Protected"
    },
    behavioral: {
      proceduresCount,
      desc: "Learned preferences & user-specific interaction habits.",
      status: "Continuous Learning"
    }
  };
}

export async function storeMemory(layer: 'working' | 'episodic' | 'semantic' | 'core', key: string, value: any, tags: string[] = []) {
  try {
    await initMemory();
    const filePath = layer === 'working' ? CONTEXT_FILE : 
                     layer === 'episodic' ? EPISODIC_FILE : 
                     layer === 'semantic' ? SEMANTIC_FILE : CORE_FILE;
    
    let memory: Record<string, MemoryEntry> = {};
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      memory = JSON.parse(data);
    } catch (e) {}

    // Generate embedding for semantic retrieval if not a simple working memory
    const config = await getBrainConfig();
    const textToEmbed = typeof value === 'string' ? value : JSON.stringify(value);
    const embedding = (layer === 'episodic' || layer === 'semantic' || layer === 'core') 
      ? await getEmbedding(config, textToEmbed) 
      : undefined;

    memory[key] = {
      data: value,
      embedding: embedding || undefined,
      updatedAt: new Date().toISOString(),
      tags
    };

    await fs.writeFile(filePath, JSON.stringify(memory, null, 2));
    
    if (layer === 'episodic') {
       Logger.log('INFO', `Event logged to Episodic Memory: ${key}`, { tags }, 'MEMORY');
    }
    
    return true;
  } catch (e: any) {
    Logger.log('ERROR', `Failed to store memory (${layer}): ${e.message}`, {}, 'MEMORY');
    return false;
  }
}

export async function semanticSearch(query: string, layer: 'episodic' | 'semantic' | 'core' = 'semantic', limit = 3) {
  try {
    const filePath = layer === 'episodic' ? EPISODIC_FILE : 
                     layer === 'semantic' ? SEMANTIC_FILE : CORE_FILE;
    
    const data = await fs.readFile(filePath, 'utf-8');
    const memory: Record<string, MemoryEntry> = JSON.parse(data);
    
    const config = await getBrainConfig();
    const queryVector = await getEmbedding(config, query);
    
    if (!queryVector) return [];

    const results = Object.entries(memory)
      .map(([key, entry]) => {
        if (!entry.embedding) return { key, data: entry.data, score: 0 };
        
        // Cosine Similarity
        const dotProduct = queryVector.reduce((acc: number, val: number, i: number) => acc + val * (entry.embedding![i] || 0), 0);
        const mag1 = Math.sqrt(queryVector.reduce((acc: number, val: number) => acc + val * val, 0));
        const mag2 = Math.sqrt(entry.embedding.reduce((acc: number, val: number) => acc + val * val, 0));
        const score = dotProduct / (mag1 * mag2);
        
        return { key, data: entry.data, score, updatedAt: entry.updatedAt };
      })
      .filter(r => r.score > 0.7)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return results;
  } catch (e) {
    return [];
  }
}

/**
 * BACKGROUND CONSOLIDATION (v0.2)
 * Ringkas Episodic -> Semantic
 * Dijalankan saat idle.
 */
export async function consolidateMemories() {
  Logger.log('INFO', 'Starting memory consolidation process (Episodic → Semantic)...', {}, 'MEMORY');
  try {
    const episodicRaw = await fs.readFile(EPISODIC_FILE, 'utf-8').catch(() => '{}');
    const episodes: Record<string, MemoryEntry> = JSON.parse(episodicRaw);
    const episodeEntries = Object.entries(episodes);
    
    if (episodeEntries.length < 5) return; // Tidak cukup data
    
    const config = await getBrainConfig();
    const { chat } = await import('./ai.js');
    
    // Buat summary dari semua episode
    const episodeSummary = episodeEntries
      .slice(-50) // Ambil 50 terbaru
      .map(([k, v]) => `[${k}]: ${typeof v.data === 'string' ? v.data.slice(0, 100) : JSON.stringify(v.data).slice(0, 100)}`)
      .join('\n');
    
    const prompt = `Berikut adalah log kejadian episodik CLUW selama beberapa jam terakhir:\n\n${episodeSummary}\n\nExtract 3-5 pola atau fakta yang bisa dipelajari dari log ini. Format: JSON array of {key, pattern, confidence}.`;
    
    const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, 
      'Kamu adalah sistem konsolidasi memori. Ekstrak pola dari log kejadian.', 
      undefined, 'MEMORY');
    
    const content = typeof response === 'string' ? response : (response as any).content;
    
    // Parse dan simpan ke semantic
    try {
      const patterns = JSON.parse(content.replace(/\`\`\`json|\`\`\`/g, '').trim());
      for (const p of patterns) {
        await storeMemory('semantic', p.key, p.pattern, ['consolidated', 'auto']);
      }
      Logger.log('INFO', `Consolidated ${episodeEntries.length} episodes → ${patterns.length} semantic patterns`, {}, 'MEMORY');
    } catch (e) {
      Logger.log('ERROR', 'Consolidation parse failed', {}, 'MEMORY');
    }
  } catch (e: any) {
    Logger.log('ERROR', `Consolidation failed: ${e.message}`, {}, 'MEMORY');
  }
}

/**
 * PRUNE EPISODIC & SEMANTIC MEMORIES
 * Jika file memori episodik atau memori semantik terlalu besar,
 * pindahkan entri lama ke folder arsip /workspace/archive/.
 */
export async function pruneMemories() {
  Logger.log('INFO', 'Checking memory storage for auto-pruning...', {}, 'MEMORY');
  try {
    const memoryFiles = [EPISODIC_FILE, SEMANTIC_FILE, CONTEXT_FILE];
    const archiveDir = path.join(BASE_DIR, 'workspace', 'archive');
    await fs.mkdir(archiveDir, { recursive: true });

    for (const file of memoryFiles) {
      try {
        const stats = await fs.stat(file).catch(() => null);
        if (!stats) continue;

        if (stats.size > 10 * 1024 * 1024) {
          const raw = await fs.readFile(file, 'utf-8');
          const data = JSON.parse(raw);
          const entries = Object.entries(data);

          if (entries.length > 100) {
            Logger.log('WARN', `Memory file ${path.basename(file)} is too large (${(stats.size / 1024 / 1024).toFixed(2)} MB). Pruning and archiving...`, {}, 'MEMORY');
            
            const mid = Math.floor(entries.length / 2);
            const toArchive = Object.fromEntries(entries.slice(0, mid));
            const toKeep = Object.fromEntries(entries.slice(mid));

            await fs.writeFile(file, JSON.stringify(toKeep, null, 2), 'utf-8');

            const archiveFile = path.join(archiveDir, `archive_${path.basename(file)}_${Date.now()}.json`);
            await fs.writeFile(archiveFile, JSON.stringify(toArchive, null, 2), 'utf-8');

            Logger.log('INFO', `Successfully pruned ${entries.length} entries → Kept ${mid} entries. Archived to: ${path.basename(archiveFile)}`, {}, 'MEMORY');
          }
        }
      } catch (fileErr: any) {
        Logger.log('ERROR', `Failed to prune memory file: ${file}: ${fileErr.message}`, {}, 'MEMORY');
      }
    }
  } catch (e: any) {
    Logger.log('ERROR', `Memory pruning failed: ${e.message}`, {}, 'MEMORY');
  }
}
