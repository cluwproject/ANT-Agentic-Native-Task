import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { ANT_Bus } from './events.js';

const BASE_DIR = process.cwd();

export interface GraphNode {
  id: string; // File path or module name (e.g. "server/routes.ts")
  type: 'middleware' | 'controller' | 'route' | 'database' | 'test' | 'library' | 'utils';
  dependsOn: string[]; // Node IDs imported by this node
  usedBy: string[];    // Node IDs importing this node
}

export interface DecisionRecord {
  id: string;
  timestamp: string;
  decision: string;           // e.g., "Menggunakan Express daripada Fastify"
  alternativesConsidered: string[];
  rationale: string;          // Rationale/reasoning for decision
  outcome: 'satisfied' | 'refactored' | 'stale';
  associatedSubGoalId?: string;
}

export interface PESVersion {
  versionId: number;
  timestamp: string;
  changedFiles: string[];
  snapshotPath: string; // Backup file path task_XXX_vN.json
}

export interface PESState {
  taskId: string;
  goalDescription: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  
  // A. Core Kernel State
  currentStepIndex: number;
  globalStrategy: string;
  architecturalRules: string[];
  steps: Array<{ title: string; description: string; status: 'pending' | 'in_progress' | 'completed' }>;
  
  // B. Next-Gen: World State & Knowledge Graph
  worldState: {
    changedFiles: string[];
    lastTestResult?: { passed: boolean; output: string };
    activeErrors: string[];
  };
  knowledgeGraph: Record<string, GraphNode>;
  
  // C. Next-Gen: ADR & Reflection
  decisions: DecisionRecord[];
  reflections: Array<{
    stepIndex: number;
    observation: string;
    outcome: 'success' | 'failure';
    lesson?: string;
  }>;

  // D. Next-Gen: State Versioning
  versionHistory: PESVersion[];
  currentVersion: number;

  createdAt: string;
  updatedAt: string;
}

export class PESKernel {
  private runtimeDir = path.join(BASE_DIR, 'workspace', 'runtime');
  private historyDir = path.join(BASE_DIR, 'workspace', 'runtime', 'history');

  private async ensureDirs() {
    await fs.mkdir(this.runtimeDir, { recursive: true }).catch(() => {});
    await fs.mkdir(this.historyDir, { recursive: true }).catch(() => {});
  }

  // Creates a new, valid, empty PESState object (factory function)
  createInitialState(taskId: string, goalDescription: string, globalStrategy: string, steps: Array<{ title: string; description: string }>): PESState {
    return {
      taskId,
      goalDescription,
      status: 'active',
      currentStepIndex: 0,
      globalStrategy,
      architecturalRules: [],
      steps: steps.map(s => ({ ...s, status: 'pending' as const })),
      worldState: { changedFiles: [], activeErrors: [] },
      knowledgeGraph: {},
      decisions: [],
      reflections: [],
      versionHistory: [],
      currentVersion: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Saves a state snapshot version (Git-like commit)
  async commitState(state: PESState, changedFiles: string[]): Promise<void> {
    await this.ensureDirs();
    state.currentVersion += 1;
    state.updatedAt = new Date().toISOString();

    const versionSnapshotName = `task_${state.taskId}_v${state.currentVersion}.json`;
    const snapshotPath = path.join(this.historyDir, versionSnapshotName);
    
    // 1. Write the backup history file
    await fs.writeFile(snapshotPath, JSON.stringify(state, null, 2), 'utf-8');

    // 2. Add to version history array
    state.versionHistory.push({
      versionId: state.currentVersion,
      timestamp: new Date().toISOString(),
      changedFiles,
      snapshotPath
    });

    // 3. Save main head state file
    const headPath = path.join(this.runtimeDir, `task_${state.taskId}.json`);
    await fs.writeFile(headPath, JSON.stringify(state, null, 2), 'utf-8');

    // 4. Emit event to ANT Sovereign Bus
    ANT_Bus.emit('pes.committed', {
      taskId: state.taskId,
      version: state.currentVersion,
      changedFiles
    });

    Logger.log('INFO', `PES committed: task_${state.taskId} v${state.currentVersion}`, {}, 'PES_KERNEL');
  }

  // Restores a previous cognitive state version (Git-like rollback)
  async rollbackState(taskId: string, targetVersion: number): Promise<PESState> {
    await this.ensureDirs();
    const headPath = path.join(this.runtimeDir, `task_${taskId}.json`);
    
    const rawHead = await fs.readFile(headPath, 'utf-8');
    const headState: PESState = JSON.parse(rawHead);

    const targetSnapshot = headState.versionHistory.find(v => v.versionId === targetVersion);
    if (!targetSnapshot) {
      throw new Error(`Versi ${targetVersion} tidak ditemukan di sejarah versi.`);
    }

    const rawSnapshot = await fs.readFile(targetSnapshot.snapshotPath, 'utf-8');
    const rolledState: PESState = JSON.parse(rawSnapshot);

    // Save rolled state over current HEAD
    await fs.writeFile(headPath, JSON.stringify(rolledState, null, 2), 'utf-8');
    
    ANT_Bus.emit('pes.rolled_back', {
      taskId,
      fromVersion: headState.currentVersion,
      toVersion: targetVersion
    });

    Logger.log('WARN', `PES rolled back: task_${taskId} to v${targetVersion}`, {}, 'PES_KERNEL');
    return rolledState;
  }

  // Records an architectural design decision (ADR)
  async recordDecision(taskId: string, decision: string, alternatives: string[], rationale: string): Promise<PESState> {
    const headPath = path.join(this.runtimeDir, `task_${taskId}.json`);
    const raw = await fs.readFile(headPath, 'utf-8');
    const state: PESState = JSON.parse(raw);

    const newDecision: DecisionRecord = {
      id: `adr_${Date.now()}`,
      timestamp: new Date().toISOString(),
      decision,
      alternativesConsidered: alternatives,
      rationale,
      outcome: 'satisfied'
    };

    state.decisions.push(newDecision);
    await this.commitState(state, []);
    
    ANT_Bus.emit('pes.decision_recorded', { taskId, decision: newDecision });
    return state;
  }
}
