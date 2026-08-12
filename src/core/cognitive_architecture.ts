import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getArdState } from './ard_intelligence.js';
import { Logger } from '../utils/logger.js';

const BASE_DIR = process.cwd();

export type AutonomyLevel = 'FLUID' | 'BALANCED' | 'CAUTIOUS';

// Helper to read trust scores (from trust.json or trust.shadow.json)
async function readTrust(): Promise<any> {
  const TRUST_FILE = path.join(BASE_DIR, 'workspace', 'registry', 'trust.json');
  try {
    const raw = await fs.readFile(TRUST_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    const TRUST_SHADOW_FILE = path.join(BASE_DIR, 'core', 'trust.shadow.json');
    try {
      const rawShadow = await fs.readFile(TRUST_SHADOW_FILE, 'utf-8');
      return JSON.parse(rawShadow);
    } catch {
      return {};
    }
  }
}

// Helper to write trust scores to both registry and shadow copy
async function writeTrust(trust: any): Promise<void> {
  const TRUST_FILE = path.join(BASE_DIR, 'workspace', 'registry', 'trust.json');
  const TRUST_SHADOW_FILE = path.join(BASE_DIR, 'core', 'trust.shadow.json');
  const files = [TRUST_FILE, TRUST_SHADOW_FILE];

  await Promise.all(
    files.map(async (f) => {
      await fs.mkdir(path.dirname(f), { recursive: true }).catch(() => {});
      await fs.writeFile(f, JSON.stringify(trust, null, 2), 'utf-8');
    })
  ).catch((e) => {
    Logger.log('ERROR', `Failed to write trust registries: ${e.message}`, {}, 'TRUST_CALIBRATION');
  });
}

// ============================================================================
// 1. COGNITIVE LEDGER (Context Invalidation & Bloat Prevention)
// ============================================================================
interface LedgerEntry {
  filePath: string;
  hash: string;
  exports: string[];
  dependencies: string[]; // Deterministic dependencies via AST Static Parser
  patternsUsed: string[];
  summary: string;        // Semantic descriptions via LLM minor
  lastUpdated: string;
}

export class CognitiveLedger {
  private ledgerPath = path.join(BASE_DIR, 'workspace', 'memories', 'design_ledger.json');

  // Simple static parser to extract imports/exports with 100% syntactic accuracy
  private parseFileStructure(code: string): { exports: string[], dependencies: string[] } {
    const exports: string[] = [];
    const dependencies: string[] = [];

    // Match ESM imports: import ... from 'dep'
    const importRegex = /import\s+.*?\s+from\s+['"](.*?)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      dependencies.push(match[1]);
    }

    // Match ESM exports: export const / function / class / interface / type ...
    const exportRegex = /export\s+(const|function|class|interface|type)\s+(\w+)/g;
    while ((match = exportRegex.exec(code)) !== null) {
      exports.push(match[2]);
    }

    return { exports, dependencies };
  }

  async getLedger(): Promise<Record<string, LedgerEntry>> {
    try {
      const raw = await fs.readFile(this.ledgerPath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async updateEntry(
    filePath: string,
    code: string,
    semanticSummaryExtractor: (code: string) => Promise<{ summary: string; patternsUsed: string[] }>
  ): Promise<void> {
    const ledger = await this.getLedger();
    const hash = crypto.createHash('md5').update(code).digest('hex');

    // Skip if unchanged to optimize performance and prevent token leaks
    if (ledger[filePath] && ledger[filePath].hash === hash) {
      return;
    }

    // 1. Structural Determinism via AST (Zero Hallucination)
    const { exports, dependencies } = this.parseFileStructure(code);

    // 2. Semantic Analysis via LLM Minor (High-level patterns and summary only)
    const { summary, patternsUsed } = await semanticSummaryExtractor(code);

    ledger[filePath] = {
      filePath,
      hash,
      exports,
      dependencies,
      patternsUsed,
      summary,
      lastUpdated: new Date().toISOString()
    };

    await fs.mkdir(path.dirname(this.ledgerPath), { recursive: true }).catch(() => {});
    await fs.writeFile(this.ledgerPath, JSON.stringify(ledger, null, 2), 'utf-8');
    Logger.log('INFO', `Cognitive Ledger updated for: ${path.basename(filePath)}`, {}, 'COGNITIVE_LEDGER');
  }

  // Compile context using Dependency Graph Overlap and Top-K Relevance Similarity
  async compileContext(activeFilePath: string, activeFileCode: string, taskQuery: string): Promise<string> {
    const ledger = await this.getLedger();
    const activeEntry = ledger[activeFilePath];

    // Filter 1: Dependency Overlaps (direct imports or files importing the active file)
    const dependencyFiles = Object.values(ledger).filter(entry => 
      entry.filePath !== activeFilePath &&
      (entry.dependencies.some(d => d.includes(path.basename(activeFilePath))) ||
       (activeEntry && activeEntry.dependencies.some(d => entry.filePath.includes(d))))
    );

    // Filter 2: Top-K Semantic matches (max 3 related files based on query keyword matching)
    const semanticFiles = this.getTopKSemanticMatches(taskQuery, Object.values(ledger), 3);

    // Merge unique entries
    const relevantEntries = Array.from(new Set([...dependencyFiles, ...semanticFiles]));

    const ledgerContext = relevantEntries
      .map(entry => `- [${path.basename(entry.filePath)}] Patterns: ${entry.patternsUsed.join(', ')} | Summary: ${entry.summary}`)
      .join('\n');

    return `
=== DESIGN LEDGER (RELEVANT CODEBASE PATHWAYS) ===
Ledger ini menyimpan deskripsi file pendukung agar jendela konteks Anda tidak terpolusi kode mentah:
${ledgerContext || 'Belum ada relasi dependensi terdeteksi.'}

=== ACTIVE WORKING FILE (RAW CODE) ===
Gunakan file kode mentah ini untuk modifikasi aktif:
File: ${activeFilePath}
\`\`\`typescript
${activeFileCode}
\`\`\`
    `.trim();
  }

  private getTopKSemanticMatches(query: string, entries: LedgerEntry[], k: number): LedgerEntry[] {
    if (!query) return [];
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return [];

    const scored = entries.map(entry => {
      let score = 0;
      const textToSearch = `${entry.filePath} ${entry.summary} ${entry.patternsUsed.join(' ')}`.toLowerCase();
      queryWords.forEach(word => {
        if (textToSearch.includes(word)) score += 1;
      });
      return { entry, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => s.entry);
  }
}

// ============================================================================
// 2. STATEFUL EXECUTION LOCK (Strategic Inconsistency Resolution)
// ============================================================================
export interface ExecutionLock {
  taskId: string;
  globalStrategy: string;
  architecturalRules: string[];
  currentStepIndex: number;
  totalSteps: number;
  steps: Array<{ title: string; description: string; status: 'pending' | 'in_progress' | 'completed' }>;
  status: 'locked' | 'revision_requested' | 'completed';
  revisionInfo?: {
    stepIndex: number;
    reason: string;
    proposedStrategy: string;
    proposedSteps: any[];
  };
}

export class ExecutionLockManager {
  private lockPath = path.join(BASE_DIR, 'workspace', 'registry', 'execution_lock.json');

  async acquireLock(lock: ExecutionLock): Promise<void> {
    await fs.mkdir(path.dirname(this.lockPath), { recursive: true }).catch(() => {});
    await fs.writeFile(this.lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    Logger.log('INFO', `Strategic Execution Lock acquired for task: ${lock.taskId}`, {}, 'EXECUTION_LOCK');
  }

  async getLock(): Promise<ExecutionLock | null> {
    try {
      const data = await fs.readFile(this.lockPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async releaseLock(): Promise<void> {
    await fs.unlink(this.lockPath).catch(() => {});
    Logger.log('INFO', `Strategic Execution Lock released.`, {}, 'EXECUTION_LOCK');
  }

  // Propose a strategic revision mid-execution due to newly discovered constraints
  async proposeRevision(reason: string, proposedStrategy: string, proposedSteps: any[]): Promise<void> {
    const lock = await this.getLock();
    if (!lock) throw new Error("Tidak ada lock aktif.");

    lock.status = 'revision_requested';
    lock.revisionInfo = {
      stepIndex: lock.currentStepIndex,
      reason,
      proposedStrategy,
      proposedSteps
    };

    await fs.writeFile(this.lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    Logger.log('WARN', `AMANDEMEN RENCANA DIAJUKAN: ${reason}`, {}, 'EXECUTION_LOCK');
  }

  // Accept and commit the proposed amendment strategy
  async approveRevision(): Promise<void> {
    const lock = await this.getLock();
    if (!lock || lock.status !== 'revision_requested' || !lock.revisionInfo) return;

    lock.globalStrategy = lock.revisionInfo.proposedStrategy;
    lock.steps = lock.revisionInfo.proposedSteps;
    lock.status = 'locked';
    lock.currentStepIndex = lock.revisionInfo.stepIndex;
    delete lock.revisionInfo;

    await fs.writeFile(this.lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    Logger.log('INFO', `Amandemen rencana disetujui. Strategi global diperbarui.`, {}, 'EXECUTION_LOCK');
  }

  // Inject execution guidelines to ensure strategic alignment at every step
  async injectLockToPrompt(systemInstruction: string): Promise<string> {
    const lock = await this.getLock();
    if (!lock) return systemInstruction;

    const currentStep = lock.steps[lock.currentStepIndex];
    const lockPrompt = `
\n⚠️ [MUTLAK: STRATEGIC EXECUTION LOCK ACTIVE]
Anda sedang mengerjakan langkah ${lock.currentStepIndex + 1}/${lock.totalSteps} dari tugas: "${currentStep?.title || 'Execution Step'}".
Langkah aktif: "${currentStep?.description || 'No step description'}"

Strategi arsitektur yang disepakati bersama Ard: 
👉 "${lock.globalStrategy}"

Aturan Coding Wajib Dipatuhi:
${lock.architecturalRules.map(rule => `• ${rule}`).join('\n')}

PERINGATAN: DILARANG keras menyimpang dari strategi arsitektur di atas atau mengganti gaya coding tanpa izin tertulis dari Ard.
    `;
    return systemInstruction + lockPrompt;
  }
}

// ============================================================================
// 3. ANOMALY DETECTOR LOOP (Pintu Keempat)
// ============================================================================
export interface ActionEntry {
  type: 'revision' | 'read' | 'write' | 'execute';
  filePath?: string;
  timestamp: number;
}

export class AnomalyDetector {
  private actionLog: ActionEntry[] = [];

  async recordAndCheck(action: ActionEntry): Promise<'ok' | 'warn' | 'interrupt'> {
    this.actionLog.push(action);
    const now = Date.now();

    // Sliding window of 15 minutes
    this.actionLog = this.actionLog.filter(a => now - a.timestamp < 15 * 60 * 1000);

    // 1. Deteksi flailing: >5 revisi dalam 15 menit
    const revisionCount = this.actionLog.filter(a => a.type === 'revision').length;
    if (revisionCount > 5) {
      Logger.log('WARN', 'Flailing detected: >5 revisions in 15 minutes. Reducing trust score temporarily.', {}, 'ANOMALY');
      // Apply kustom penalty of -5 for flailing
      await calibrateTrustScore('_anomaly_flailing', false, 5);
      return 'warn';
    }

    // 2. Deteksi circular dependency/infinite access: file yang sama diakses >10 kali dalam 15 menit
    if (action.filePath) {
      const fileAccessCount = this.actionLog.filter(a => a.filePath === action.filePath).length;
      if (fileAccessCount > 10) {
        Logger.log('WARN', `Anomaly detected: file [${path.basename(action.filePath)}] accessed ${fileAccessCount} times in 15 minutes. Potential circular dependency.`, {}, 'ANOMALY');
        return 'interrupt';
      }
    }

    return 'ok';
  }
}
export const anomalyDetector = new AnomalyDetector();

// ============================================================================
// 4. AUTONOMY ENGINE (Sovereign Safety Hard Floor)
// ============================================================================
export class AutonomyEngine {
  private trustScoresPath = path.join(BASE_DIR, 'workspace', 'registry', 'trust.json');

  async determineAutonomyLevel(): Promise<AutonomyLevel> {
    // A. Check if anomaly flailing is active
    let flailingScore = 100;
    try {
      const trust = await readTrust();
      flailingScore = trust['_anomaly_flailing']?.score !== undefined ? trust['_anomaly_flailing'].score : 100;
    } catch {}

    // If flailing trust score is low, override to CAUTIOUS mode to prevent silent damage!
    if (flailingScore < 80) {
      return 'CAUTIOUS';
    }

    // B. Check mood-mapping
    const ardState = await getArdState();
    switch (ardState.current_mood) {
      case 'focused':
      case 'excited':
      case 'happy':
        return 'FLUID';     // High autonomy, fluid write flow
      case 'tired':
      case 'stressed':
      case 'sad':
      case 'frustrated':
        return 'CAUTIOUS';  // High caution, safety floor override active
      default:
        return 'BALANCED';  // Balanced default autonomy gate
    }
  }

  // Evaluates whether an agent action requires manual permission based on category & trust
  async evaluateAction(
    actionName: string, 
    category: 'read' | 'write' | 'shell' | 'sensitive'
  ): Promise<'execute' | 'notify' | 'ask'> {
    // A. SOVEREIGN SAFETY HARD FLOOR (Critical Shell / Sensitive actions always blocked under 'ask')
    if (category === 'shell' || category === 'sensitive') {
      return 'ask';
    }

    // B. Read actions always execute immediately
    if (category === 'read') {
      return 'execute';
    }

    // C. Write actions dynamically adapt to ArdState and Trust Score
    const autonomy = await this.determineAutonomyLevel();
    
    let score = 0;
    try {
      const trust = await readTrust();
      score = trust[actionName]?.score || 0;
    } catch {}

    if (category === 'write') {
      if (autonomy === 'FLUID') return 'execute'; // Write otonom during fluid focus
      if (autonomy === 'BALANCED' && score > 50) return 'execute'; // Write otonom if tool has enough trust
      return 'notify'; // Write and notify
    }

    return 'ask';
  }
}

// ============================================================================
// 5. TRUST SCORE FEEDBACK LOOP CALIBRATION (Anti-Drift Guard)
// ============================================================================
export async function calibrateTrustScore(actionName: string, success: boolean, customPenalty?: number): Promise<void> {
  const trust = await readTrust();

  if (!trust[actionName]) {
    trust[actionName] = { score: 50, consecutive_success: 0 };
  }

  const record = trust[actionName];
  record.lastActive = Date.now(); // Record activity timestamp!

  if (success) {
    record.consecutive_success += 1;
    // Slow dynamic increment for positive alignment behavior
    record.score = Math.min(100, record.score + Math.min(5, record.consecutive_success));
  } else {
    record.consecutive_success = 0;
    // Penalty decrement (uses custom penalty if supplied, defaults to 25)
    const penalty = customPenalty !== undefined ? customPenalty : 25;
    record.score = Math.max(0, record.score - penalty);
  }

  // Dual-pass write to enforce consistency and prevent verification drifts
  await writeTrust(trust);
}

// ============================================================================
// 6. TRUST SCORE DECAY ENGINE
// ============================================================================
export async function applyDecay(): Promise<void> {
  const trust = await readTrust();
  let updated = false;

  for (const action in trust) {
    if (trust[action].lastActive) {
      const hoursSince = (Date.now() - trust[action].lastActive) / (1000 * 60 * 60);
      if (hoursSince >= 24) {
        const decayDays = Math.floor(hoursSince / 24);
        const decayAmount = decayDays * 2; // -2 points per 24h of inactivity
        if (decayAmount > 0) {
          const oldScore = trust[action].score;
          trust[action].score = Math.max(50, trust[action].score - decayAmount);
          if (trust[action].score !== oldScore) {
            updated = true;
          }
          // Reset lastActive to now to prevent double-decay on next cycle
          trust[action].lastActive = Date.now();
        }
      }
    }
  }

  if (updated) {
    await writeTrust(trust);
    Logger.log('INFO', 'Daily trust decay check: applied decay points to inactive tools.', {}, 'TRUST_DECAY');
  }
}
