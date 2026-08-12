import * as fs from 'fs';
import { createHash } from 'crypto';

interface FileSnapshot {
  filePath: string;
  content: string;
  timestamp: number;
  sessionId: string;
  checksum: string; 
}

/**
 * EvidenceLocker
 * Menyimpan "foto" file sebelum agen menyentuhnya.
 * Ini adalah "cctv" in-memory untuk diffExtractor.ts sebagai fallback git.
 */
export class EvidenceLocker {
  private snapshots: Map<string, FileSnapshot[]> = new Map();
  private readonly MAX_SNAPSHOTS_PER_FILE = 10; 
  
  captureBefore(sessionId: string, filePath: string): void {
    let content = '';
    
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      // File belum ada — snapshot kosong adalah valid
      content = '';
    }
    
    const snapshot: FileSnapshot = {
      filePath,
      content,
      timestamp: Date.now(),
      sessionId,
      checksum: createHash('sha256').update(content).digest('hex')
    };
    
    if (!this.snapshots.has(sessionId)) {
      this.snapshots.set(sessionId, []);
    }
    
    const sessionSnapshots = this.snapshots.get(sessionId)!;
    sessionSnapshots.push(snapshot);
    
    // Cleanup: hanya simpan snapshot terakhir untuk setiap file
    const fileSnapshots = sessionSnapshots.filter(s => s.filePath === filePath);
    if (fileSnapshots.length > this.MAX_SNAPSHOTS_PER_FILE) {
      const oldest = fileSnapshots[0];
      const idx = sessionSnapshots.findIndex(s => s === oldest);
      if (idx > -1) sessionSnapshots.splice(idx, 1);
    }
  }
  
  getSnapshot(sessionId: string, filePath: string): FileSnapshot | null {
    const sessionSnapshots = this.snapshots.get(sessionId) || [];
    const fileSnapshots = sessionSnapshots.filter(s => s.filePath === filePath);
    return fileSnapshots.length > 0 ? fileSnapshots[fileSnapshots.length - 1] : null;
  }

  // Mengembalikan record key-value sederhana (filePath -> content) untuk diffExtractor
  getAllSnapshotsAsRecord(sessionId: string): Record<string, string> {
      const sessionSnapshots = this.snapshots.get(sessionId) || [];
      const record: Record<string, string> = {};
      sessionSnapshots.forEach(s => {
          record[s.filePath] = s.content;
      });
      return record;
  }
  
  clearSession(sessionId: string): void {
    this.snapshots.delete(sessionId);
  }
}

export const evidenceLocker = new EvidenceLocker();
