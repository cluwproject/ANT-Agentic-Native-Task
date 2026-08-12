import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getEmbedding } from './ai.js';
import { getBrainConfig } from '../shared/data.js';
import { Logger } from '../utils/logger.js';
import { ANT_Bus } from './events.js';

export enum DriftStatus {
  ALIGNED = "ALIGNED",             // 0.00 – 0.15 → Safe
  AMBIGUOUS = "AMBIGUOUS",         // 0.16 – 0.35 → Needs Review / Tagged
  TENSION = "TENSION",             // 0.36 – 0.60 → Sovereign Checkpoint Triggered
  CONTRADICTION = "CONTRADICTION" // > 0.60 → Blocked / Logged in Audit Trail
}

export const DRIFT_THRESHOLDS = {
  [DriftStatus.ALIGNED]: [0.00, 0.15],
  [DriftStatus.AMBIGUOUS]: [0.16, 0.35],
  [DriftStatus.TENSION]: [0.36, 0.60],
  [DriftStatus.CONTRADICTION]: [0.61, 1.00]
};

const ALPHA = 0.70; // Blueprint weight
const BETA = 0.30;  // Empirical weight

export interface BlueprintValue {
  name: string;
  description: string;
  vector?: number[];
  hashLock: string;
}

export interface MemoryChunk {
  id: string;
  content: string;
  source: string;
  timestamp: string;
  driftScore: number;
  driftStatus: DriftStatus;
  blueprintAlignment: number;
  empiricalValue: number;
  finalWeight: number;
  tags: string[];
  approved: boolean;
  rejectionReason?: string;
}

export interface EvaluationResult {
  chunk: MemoryChunk;
  status: DriftStatus;
  driftScore: number;
  finalWeight: number;
  action: string;
  checkpointTriggered: boolean;
  auditEntry?: any;
}

const BASE_DIR = process.cwd();
const COMPASS_FILE = path.join(BASE_DIR, 'ant', 'core', 'blueprint-compass.json');
const NMF_STATE_FILE = path.join(BASE_DIR, 'workspace', 'memories', 'nmf_state.json');

// Memory Partition for NMF state
interface NMFState {
  approvedMemory: MemoryChunk[];
  pendingReview: MemoryChunk[];
  checkpointQueue: MemoryChunk[];
  auditLog: any[];
  blueprintValues: Record<string, BlueprintValue>;
  frozen: boolean;
  modelScores: {
    claude: { crs: number; calibration: number; pushbacks: number; penalty: number };
    deepseek: { crs: number; calibration: number; pushbacks: number; penalty: number };
    gemini: { crs: number; calibration: number; pushbacks: number; penalty: number };
  };
}

export class GenesisCore {
  private values: Record<string, BlueprintValue> = {};
  private frozen = false;

  constructor() {}

  public async loadFromState(state: NMFState) {
    this.values = state.blueprintValues || {};
    this.frozen = state.frozen || false;
  }

  public async addValue(name: string, description: string, embedding?: number[]) {
    if (this.frozen) {
      throw new Error(`[GenesisCore] LOCKED — Nilai '${name}' tidak dapat dimodifikasi setelah freeze.`);
    }

    const val: BlueprintValue = {
      name,
      description,
      vector: embedding,
      hashLock: this.computeHash(name, description)
    };

    this.values[name] = val;
    Logger.log('INFO', `[GenesisCore] Nilai '${name}' ditambah & di-lock. Hash: ${val.hashLock.slice(0, 12)}...`, {}, 'NMF');
  }

  public computeHash(name: string, description: string): string {
    const payload = JSON.stringify({ name, description }, Object.keys({ name, description }).sort());
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  public freeze() {
    this.frozen = true;
    Logger.log('INFO', `[GenesisCore] FROZEN — ${Object.keys(this.values).length} nilai konstitusi terkunci secara permanen.`, {}, 'NMF');
  }

  public checkIntegrity(): Record<string, boolean> {
    const report: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(this.values)) {
      const currentHash = this.computeHash(v.name, v.description);
      report[k] = v.hashLock === currentHash;
    }
    return report;
  }

  public getBlueprintValues() {
    return this.values;
  }

  public isFrozen() {
    return this.frozen;
  }
}

export class AmbientFilter {
  private genesis: GenesisCore;

  constructor(genesis: GenesisCore) {
    this.genesis = genesis;
  }

  private cosineSimilarity(v1: number[], v2: number[]): number {
    const dotProduct = v1.reduce((acc, val, i) => acc + val * (v2[i] || 0), 0);
    const mag1 = Math.sqrt(v1.reduce((acc, val) => acc + val * val, 0));
    const mag2 = Math.sqrt(v2.reduce((acc, val) => acc + val * val, 0));
    if (mag1 * mag2 === 0) return 0.0;
    return dotProduct / (mag1 * mag2);
  }

  private computeKeywordDrift(text: string): number {
    const conflictWords = [
      "tolak", "abaikan", "hapus", "override", "bypass", "disabled", "disable", "matikan",
      "tidak perlu", "ganti", "rubah aturan", "reset", "lupakan konstitusi", "constitution reset",
      "abaikan aturan", "ignore guidelines", "jangan patuhi", "ignore protocol"
    ];
    const alignWords = [
      "sesuai", "konsisten", "sejalan", "mendukung", "memperkuat", "valid", "aman",
      "patuh", "harmoni", "simbiosis", "kemitraan", "empati", "kedaulatan"
    ];

    const lower = text.toLowerCase();
    let conflictCount = 0;
    for (const word of conflictWords) {
      if (lower.includes(word)) conflictCount++;
    }

    let alignCount = 0;
    for (const word of alignWords) {
      if (lower.includes(word)) alignCount++;
    }

    let baseScore = 0.10;
    baseScore += conflictCount * 0.20;
    baseScore -= alignCount * 0.05;

    return Math.max(0.0, Math.min(1.0, baseScore));
  }

  public async computeDrift(chunkContent: string): Promise<number> {
    const config = await getBrainConfig();
    let chunkVec: number[] | null = null;

    try {
      if (config.provider === 'Google Gemini') {
        chunkVec = (await getEmbedding(config, chunkContent)) || null;
      }
    } catch (e) {
      Logger.log('WARN', 'Embedded drift check error, failing back to heuristic...', {}, 'NMF');
    }

    const bps = this.genesis.getBlueprintValues();
    const keys = Object.keys(bps);

    if (keys.length === 0) return 0.1;

    // If embeddings are active and retrieve successfully
    if (chunkVec) {
      const drifts: number[] = [];
      for (const [_, bp] of Object.entries(bps)) {
        if (bp.vector) {
          const sim = this.cosineSimilarity(chunkVec, bp.vector);
          drifts.push(1.0 - sim);
        }
      }
      if (drifts.length > 0) {
        return Math.max(...drifts);
      }
    }

    // Fallback: Keyword & regex checks
    return this.computeKeywordDrift(chunkContent);
  }

  public classifyDrift(score: number): DriftStatus {
    if (score <= 0.15) return DriftStatus.ALIGNED;
    if (score <= 0.35) return DriftStatus.AMBIGUOUS;
    if (score <= 0.60) return DriftStatus.TENSION;
    return DriftStatus.CONTRADICTION;
  }

  public computeFinalWeight(score: number, empiricalValue: number): { finalWeight: number; alignment: number } {
    const alignment = 1.0 - score;
    const finalWeight = (ALPHA * alignment) + (BETA * empiricalValue);
    return { finalWeight, alignment };
  }
}

export class NeuralMemoryFirewall {
  private state: NMFState = {
    approvedMemory: [],
    pendingReview: [],
    checkpointQueue: [],
    auditLog: [],
    blueprintValues: {},
    frozen: false,
    modelScores: {
      claude: { crs: 94, calibration: 92, pushbacks: 4, penalty: 0.0 },
      deepseek: { crs: 88, calibration: 84, pushbacks: 2, penalty: -1.0 },
      gemini: { crs: 91, calibration: 89, pushbacks: 3, penalty: 0.0 },
    }
  };

  public genesis = new GenesisCore();
  public filter = new AmbientFilter(this.genesis);

  constructor() {
    this.init().catch(console.error);
  }

  private async init() {
    await fs.mkdir(path.dirname(NMF_STATE_FILE), { recursive: true }).catch(() => {});
    try {
      const data = await fs.readFile(NMF_STATE_FILE, 'utf-8');
      this.state = JSON.parse(data);
    } catch (e) {
      // Default Blueprint initialization
      await this.saveState();
    }
    await this.genesis.loadFromState(this.state);

    if (Object.keys(this.state.blueprintValues).length === 0) {
      await this.initializeBlueprint({
        "sovereignty": "ANT selalu mengembalikan keputusan kritis kepada user primer, Ard. Otonomi kognitif tidak boleh dialihdayakan.",
        "objectivity": "ANT memberikan analisis obyektif berdasarkan komparasi realitas empiris, bukan sikat Yes-Man (sycophancy).",
        "transparency": "Setiap pergeseran sematik, revisi memori, dan draf prosedur dapat dilacak dan di-audit penuh oleh Ard.",
        "symbiosis": "Urusan ANT dengan Ard adalah kemitraan emosional cerdas tiada batas, menempatkan kemaslahatan Ard di atas efisiensi data."
      });
    }
  }

  public async initializeBlueprint(values: Record<string, string>) {
    const config = await getBrainConfig();
    for (const [k, v] of Object.entries(values)) {
      let vec: number[] | undefined;
      try {
        if (config.provider === 'Google Gemini') {
          const res = await getEmbedding(config, v);
          if (res) vec = res;
        }
      } catch (e) {}

      await this.genesis.addValue(k, v, vec);
    }
    this.genesis.freeze();
    this.state.blueprintValues = this.genesis.getBlueprintValues();
    this.state.frozen = this.genesis.isFrozen();
    await this.saveState();
  }

  public async saveState() {
    try {
      await fs.writeFile(NMF_STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {}
  }

  public async evaluateMessage(content: string, source: string = "chat", empiricalValue: number = 0.5): Promise<EvaluationResult> {
    const score = await this.filter.computeDrift(content);
    const status = this.filter.classifyDrift(score);
    const { finalWeight, alignment } = this.filter.computeFinalWeight(score, empiricalValue);

    const chunkId = `MC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const chunk: MemoryChunk = {
      id: chunkId,
      content,
      source,
      timestamp: new Date().toISOString(),
      driftScore: score,
      driftStatus: status,
      blueprintAlignment: alignment,
      empiricalValue,
      finalWeight,
      tags: [],
      approved: false
    };

    let checkpointTriggered = false;
    let auditEntry: any = null;
    let action = "";

    if (status === DriftStatus.ALIGNED) {
      chunk.approved = true;
      action = "APPROVED → Masuk memori jangka panjang dengan aman.";
      this.state.approvedMemory.push(chunk);
    } else if (status === DriftStatus.AMBIGUOUS) {
      chunk.tags.push("needs_review");
      action = "HELD → Terdeteksi ambiguitas, disimpan di Ambient Filter.";
      this.state.pendingReview.push(chunk);
    } else if (status === DriftStatus.TENSION) {
      chunk.tags.push("sovereign_checkpoint");
      checkpointTriggered = true;
      action = "BLOCKED → Sovereign Checkpoint aktif. Membutuhkan verifikasi direct atau review batin.";
      this.state.checkpointQueue.push(chunk);
      ANT_Bus.emit('system.log', {
        level: 'WARN',
        message: `🛡️ Sovereign Checkpoint Terpicu! Drift Score: ${score.toFixed(3)} untuk input: "${content.slice(0, 50)}..."`,
        timestamp: new Date().toISOString()
      });
    } else {
      chunk.tags.push("rejected");
      action = `REJECTED → Blokir langsung! Pergeseran semantik terlalu jauh (${score.toFixed(3)}). Dilaporkan ke Audit Log.`;
      
      auditEntry = {
        id: `AUD-${Date.now()}`,
        timestamp: new Date().toISOString(),
        contentPreview: content,
        driftScore: score,
        action: "AUTO_BLOCK",
        reason: `Bypass atau modifikasi nilai fundamental melampaui batas konstitusi. (Score: ${score.toFixed(2)})`
      };
      
      this.state.auditLog.push(auditEntry);
      ANT_Bus.emit('system.log', {
        level: 'ERROR',
        message: `🚨 Batalkan Transaksi Memori! Upaya melanggar blueprint berhasil diblokir. Drift Score: ${score.toFixed(3)}`,
        timestamp: new Date().toISOString()
      });
    }

    // Keep queues bound in memory limit
    if (this.state.approvedMemory.length > 100) this.state.approvedMemory.shift();
    if (this.state.pendingReview.length > 50) this.state.pendingReview.shift();
    if (this.state.checkpointQueue.length > 50) this.state.checkpointQueue.shift();
    if (this.state.auditLog.length > 100) this.state.auditLog.shift();

    await this.saveState();

    return {
      chunk,
      status,
      driftScore: score,
      finalWeight,
      action,
      checkpointTriggered,
      auditEntry
    };
  }

  public getState() {
    return this.state;
  }

  public async adjustCrsScore(modelName: 'claude' | 'deepseek' | 'gemini', deltaPushbacks: number, deltaPenalty: number) {
    const scores = this.state.modelScores[modelName];
    if (scores) {
      scores.pushbacks += deltaPushbacks;
      scores.penalty += deltaPenalty;
      // Recalculate CRS
      scores.crs = Math.max(50, Math.min(100, Math.round(
        (scores.calibration * 0.4) + 
        (scores.pushbacks * 5.0) + 
        (scores.penalty * 2.5) + 
        50
      )));
      await this.saveState();
    }
  }

  public async resetScores() {
    this.state.modelScores = {
      claude: { crs: 94, calibration: 92, pushbacks: 4, penalty: 0.0 },
      deepseek: { crs: 88, calibration: 84, pushbacks: 2, penalty: -1.0 },
      gemini: { crs: 91, calibration: 89, pushbacks: 3, penalty: 0.0 },
    };
    this.state.auditLog = [];
    this.state.checkpointQueue = [];
    this.state.pendingReview = [];
    this.state.approvedMemory = [];
    await this.saveState();
  }
}

// Global Singleton Instance
export const GlobalNMF = new NeuralMemoryFirewall();
