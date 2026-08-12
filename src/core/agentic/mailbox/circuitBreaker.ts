// circuitBreaker.ts
// v1.1 — patch: messageTimestamps dipersist ke circuit-state.json, tidak lagi
// disimpan di Map in-memory. Sebelumnya kalau CLI dipanggil sebagai proses baru
// tiap command (pola umum untuk CLI tool), pattern breaker jadi dekoratif —
// state reset tiap invocation dan tidak pernah benar-benar trip.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { withLock } from './fileLock.js';

export interface CircuitBreakerConfig {
  mailboxEnabled: boolean;
  maxMessagesPerSessionWithoutAck: number;
  patternBreaker: {
    maxMessagesPerModelPair: number;
    windowSeconds: number;
  };
}

type TimestampState = Record<string, number[]>;

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private statePath: string;
  private lockPath: string;

  constructor(configPath: string) {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(raw);
    } else {
      this.config = {
        mailboxEnabled: true,
        maxMessagesPerSessionWithoutAck: 20,
        patternBreaker: {
          maxMessagesPerModelPair: 10,
          windowSeconds: 60
        }
      };
    }
    this.statePath = path.join(path.dirname(configPath), 'circuit-state.json');
    this.lockPath = this.statePath + '.lock';
  }

  private loadState(): TimestampState {
    if (!fs.existsSync(this.statePath)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.statePath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveState(state: TimestampState): void {
    const dir = path.dirname(this.statePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = this.statePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf-8');
    fs.renameSync(tmp, this.statePath);
  }

  public validateWritePermission(
    fromModel: string,
    toModel: string,
    unacknowledgedCount: number
  ): { allowed: boolean; reason?: string } {
    if (!this.config.mailboxEnabled) {
      return { allowed: false, reason: 'HARD_STOP: Mailbox disabled by operator config.' };
    }

    if (unacknowledgedCount >= this.config.maxMessagesPerSessionWithoutAck) {
      return {
        allowed: false,
        reason: `CIRCUIT_BREAKER_TRIPPED: Unacknowledged limit reached (${unacknowledgedCount}).`,
      };
    }

    return withLock(this.lockPath, () => {
      const pairKey = `${fromModel}->${toModel}`;
      const now = Date.now();
      const windowMs = this.config.patternBreaker.windowSeconds * 1000;

      const state = this.loadState();
      const timestamps = (state[pairKey] || []).filter(ts => now - ts <= windowMs);

      if (timestamps.length >= this.config.patternBreaker.maxMessagesPerModelPair) {
        return {
          allowed: false,
          reason: `RATE_LIMIT_EXCEEDED: Model pair ${pairKey} exceeded rate limit within ${this.config.patternBreaker.windowSeconds}s.`,
        };
      }

      timestamps.push(now);
      state[pairKey] = timestamps;
      this.saveState(state);

      return { allowed: true };
    });
  }
}
