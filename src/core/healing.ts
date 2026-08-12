import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

const BASE_DIR = process.cwd();
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
const HEALING_HISTORY_FILE = path.join(WORKSPACE_DIR, 'healing-history.json');
const ANOMALY_ALERT_THRESHOLD = 5; // Alert user if more than 5 distinct anomalies occur in short succession

export interface HealingEvent {
  timestamp: string;
  trigger: string;
  thresholdChecked: string;
  anomaliesDetected: string[];
  remediationsApplied: string[];
  systemStatus: 'Fully_Sane' | 'Remediated' | 'Escalated_Alert';
}

export class SelfHealer {
  private static errorSlidingWindow: { timestamp: number; type: string }[] = [];
  private static ERROR_RATE_THRESHOLD = 10; // Max 10 system errors allowed within 1 minute before emergency isolation

  /**
   * Tracks an error event into the sliding window and evaluates threshold triggers
   */
  static trackSystemError(errorType: string): { triggerHeal: boolean; currentRate: number } {
    const now = Date.now();
    // Flush errors older than 1 minute
    this.errorSlidingWindow = this.errorSlidingWindow.filter(e => now - e.timestamp < 60 * 1000);
    this.errorSlidingWindow.push({ timestamp: now, type: errorType });

    const exceedsThreshold = this.errorSlidingWindow.length >= this.ERROR_RATE_THRESHOLD;
    if (exceedsThreshold) {
      Logger.log('WARN', `Self-Healing Triggered: Error rate (${this.errorSlidingWindow.length}/min) exceeded threshold (${this.ERROR_RATE_THRESHOLD}/min).`, { errorType }, 'HEALING');
    }
    return {
      triggerHeal: exceedsThreshold,
      currentRate: this.errorSlidingWindow.length
    };
  }

  static async getHealingHistory(): Promise<HealingEvent[]> {
    try {
      await fs.mkdir(WORKSPACE_DIR, { recursive: true });
      const data = await fs.readFile(HEALING_HISTORY_FILE, 'utf-8').catch(() => '[]');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static async logHealingEvent(event: HealingEvent) {
    try {
      const history = await this.getHealingHistory();
      history.unshift(event);
      // Keep last 100 healing logs
      const cappedHistory = history.slice(0, 100);
      await fs.writeFile(HEALING_HISTORY_FILE, JSON.stringify(cappedHistory, null, 2));
    } catch (e: any) {
      console.error('Failed to save self-healing history log:', e.message);
    }
  }

  static async diagnose(customTriggerReason: string = 'Scheduled Crontab Scan') {
    Logger.log('INFO', `Starting system diagnosis. Triggered by: [${customTriggerReason}]`, {}, 'HEALING');
    
    const anomalies: string[] = [];
    const remediations: string[] = [];
    
    // --- TRIGGER 1: Directory Sanity Check ---
    const folders = ['memories', 'backups', 'temp', 'logs'];
    for (const folder of folders) {
      try {
        await fs.access(path.join(WORKSPACE_DIR, folder));
      } catch {
        anomalies.push(`Direktori hilang: ${folder}`);
        await fs.mkdir(path.join(WORKSPACE_DIR, folder), { recursive: true });
        remediations.push(`Membuat kembali direktori workspace/${folder}`);
        Logger.log('INFO', `Auto-Fixed: Created missing folder ${folder}`, {}, 'HEALING');
      }
    }

    // --- TRIGGER 2: Core State File Mutation/Integrity Check ---
    const dataFiles = ['tasks.json', 'schedules.json', 'creator_drafts.json'];
    for (const file of dataFiles) {
      const filePath = path.join(WORKSPACE_DIR, file);
      try {
        await fs.access(filePath);
      } catch {
        anomalies.push(`File data krusial hilang: ${file}`);
        await fs.writeFile(filePath, '[]');
        remediations.push(`Mengunduh/membuat kembali berkas kosong otonom: workspace/${file}`);
        Logger.log('INFO', `Auto-Fixed: Created missing core file ${file}`, {}, 'HEALING');
      }
    }

    // --- TRIGGER 3: Memory Store Corruption Checklist ---
    try {
      const memoryPath = path.join(WORKSPACE_DIR, 'memories', 'context.json');
      await fs.mkdir(path.dirname(memoryPath), { recursive: true });
      
      try {
        const data = await fs.readFile(memoryPath, 'utf-8');
        JSON.parse(data);
      } catch (readErr: any) {
        if (readErr.code === 'EACCES') {
          anomalies.push('Sektor Memori Terkunci (Sistem File Read-Only)');
          remediations.push('Bypass perbaikan sektor memori (Masalah izin akses host)');
          Logger.log('WARN', 'Memory sector locked (EACCES). Skipping sector repair.', {}, 'HEALING');
        } else {
          anomalies.push('Data Memori Korup (Gagal Dekode JSON)');
          await fs.writeFile(memoryPath, '{}');
          remediations.push('Reset memori sirkuit kognitif yang korup menjadi {}');
          Logger.log('INFO', 'Auto-Fixed: Reset corrupted memory store.', {}, 'HEALING');
        }
      }
    } catch (e: any) {
      Logger.log('WARN', `Memory sector check bypassed: ${e.message}`, {}, 'HEALING');
    }

    // --- TRIGGER 4: Log Size & Space Rotational Safety Check ---
    try {
      const logPath = path.join(BASE_DIR, 'workspace', 'activity.log');
      const stats = await fs.stat(logPath);
      if (stats.size > 5 * 1024 * 1024) { // 5MB limit
        anomalies.push(`Berkas aktivitas log over-capacity (${(stats.size/1024/1024).toFixed(2)} MB)`);
        await fs.writeFile(logPath, `[HEALING] Log rotated at ${new Date().toISOString()}\n`);
        remediations.push('Rotasi berkas aktivitas log untuk mencegah over-disk penggunaan');
        Logger.log('INFO', 'Auto-Fixed: Rotated activity.log due to size limit.', {}, 'HEALING');
      }
    } catch {}

    // --- TRIGGER 5: Source Code Syntax & Template Literal Integrity Check ---
    try {
      const serverSrcDir = path.join(BASE_DIR, 'src', 'server');
      await this.walkDir(serverSrcDir, async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          // Match unescaped triple backticks (not preceded by \)
          const unescapedRegex = /(?<!\\)\`\`\`/g;
          if (unescapedRegex.test(content)) {
            const relativePath = path.relative(BASE_DIR, filePath);
            anomalies.push(`Karakter backtick tidak ter-escape pada file source: ${relativePath}`);
            
            const fixedContent = content.replace(unescapedRegex, '\\`\\`\\`');
            await fs.writeFile(filePath, fixedContent, 'utf-8');
            remediations.push(`Meng-escape secara otomatis karakter backtick pada file: ${relativePath}`);
            Logger.log('INFO', `Auto-Fixed: Escaped backticks in source file ${relativePath}`, {}, 'HEALING');
          }
        } catch (e: any) {
          Logger.log('WARN', `Gagal memproses file source ${filePath}: ${e.message}`, {}, 'HEALING');
        }
      });
    } catch (e: any) {
      Logger.log('WARN', `Gagal menjalankan verifikasi kode source: ${e.message}`, {}, 'HEALING');
    }

    // --- TRIGGER 6: Shell Script Line Endings (CRLF to LF) for Linux/Termux Compatibility ---
    if (process.platform !== 'win32') {
      try {
        const shFiles = ['install.sh'];
        for (const file of shFiles) {
          const filePath = path.join(BASE_DIR, file);
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            if (content.includes('\r\n')) {
              anomalies.push(`File shell script menggunakan line endings CRLF (Windows): ${file}`);
              const fixedContent = content.replace(/\r\n/g, '\n');
              await fs.writeFile(filePath, fixedContent, 'utf-8');
              remediations.push(`Konversi line endings CRLF ke LF untuk file: ${file}`);
              Logger.log('INFO', `Auto-Fixed: Converted line endings of ${file} to LF`, {}, 'HEALING');
            }
          } catch {}
        }
      } catch (e: any) {
        Logger.log('WARN', `Gagal memverifikasi line endings shell script: ${e.message}`, {}, 'HEALING');
      }
    }

    // --- THRESHOLD EVALUATION ---
    let systemStatus: HealingEvent['systemStatus'] = 'Fully_Sane';
    if (anomalies.length > 0) {
      systemStatus = anomalies.length >= ANOMALY_ALERT_THRESHOLD ? 'Escalated_Alert' : 'Remediated';
    }

    // Register to structured sovereign logs
    const event: HealingEvent = {
      timestamp: new Date().toISOString(),
      trigger: customTriggerReason,
      thresholdChecked: `Anomaly alert threshold: max ${ANOMALY_ALERT_THRESHOLD}. Sliding error-rate limit: max ${this.ERROR_RATE_THRESHOLD}/min (Current rate: ${this.errorSlidingWindow.length}/min)`,
      anomaliesDetected: anomalies,
      remediationsApplied: remediations,
      systemStatus
    };

    await this.logHealingEvent(event);

    if (anomalies.length === 0) {
      Logger.log('INFO', 'System Healthy. No anomalies detected.', {}, 'HEALING');
    } else {
      Logger.log('WARN', `Diagnosis complete. Applied ${remediations.length} auto-fixes. Status: [${systemStatus}]`, { anomalies }, 'HEALING');
    }

    return event;
  }

  private static async walkDir(dir: string, callback: (filePath: string) => Promise<void>) {
    try {
      const files = await fs.readdir(dir, { withFileTypes: true });
      for (const file of files) {
        const resPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          if (file.name !== 'node_modules' && file.name !== '.git') {
            await this.walkDir(resPath, callback);
          }
        } else if (file.isFile() && (file.name.endsWith('.ts') || file.name.endsWith('.js') || file.name.endsWith('.tsx'))) {
          await callback(resPath);
        }
      }
    } catch {}
  }

  static startAutoHealing() {
    // Run diagnosis every 5 minutes
    setInterval(() => {
      this.diagnose('Interval Cron AutoHealer').catch(err => console.error('Healing scheduled scan failed:', err));
    }, 5 * 60 * 1000);
  }
}
