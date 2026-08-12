import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { CLUW_Bus } from './events.js';

const BASE_DIR = process.cwd();
const WATCH_DIR = path.join(BASE_DIR, 'workspace');

// ─────────────────────────────────────────────────────────────
//  PROACTIVE ENGINE v1.0 — "CLUW yang Berdenyut"
//  Direkonstruksi dari stub menjadi sistem saraf aktif
//  yang bereaksi terhadap perubahan konteks secara nyata.
// ─────────────────────────────────────────────────────────────

let lastNotifiedFile = '';
let lastFileChangeTime = 0;
const FILE_CHANGE_COOLDOWN_MS = 10000; // 10 detik debounce

/**
 * CONTEXT WATCHER — Mendeteksi perubahan penting di workspace
 * Bukan lagi stub: sekarang melakukan relevance scoring sungguhan
 */
export function startProactiveEngine() {
  Logger.log('INFO', 'Proactive Engine v1.0: Context-Aware Watching aktif...', {}, 'AUTONOMY');

  if (!fs.existsSync(WATCH_DIR)) {
    fs.mkdirSync(WATCH_DIR, { recursive: true });
  }

  fs.watch(WATCH_DIR, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;

    // Filter: abaikan perubahan internal yang tidak relevan (termasuk instalasi pustaka)
    const ignoredPatterns = ['.json', '.log', 'healing-history', 'shared_session', 'ard_state', 'reasoning_log', 'node_modules', '.git'];
    if (ignoredPatterns.some(p => filename.includes(p))) return;

    const now = Date.now();
    // Debounce: jangan spam event untuk file yang sama dalam 10 detik
    if (filename === lastNotifiedFile && now - lastFileChangeTime < FILE_CHANGE_COOLDOWN_MS) return;
    lastNotifiedFile = filename;
    lastFileChangeTime = now;

    // Relevance Scoring: hanya beritahu jika file penting berubah
    const isHighRelevance = /\.(ts|tsx|js|py|md|yaml|env)$/.test(filename);
    if (!isHighRelevance) return;

    Logger.log('INFO', `[Proactive] Context shift detected: ${filename} (${eventType})`, {}, 'AUTONOMY');

    CLUW_Bus.emit('system.autonomous_event', {
      title: 'Perubahan Konteks Terdeteksi',
      content: `📂 File \`${filename}\` berubah. CLUW siap membantu menganalisis dampaknya jika perlu.`,
      type: 'info',
      timestamp: new Date().toISOString()
    });
  });

  // ─── AUTONOMOUS CLUW_Bus Listener: Pusat Saraf Proaktif ───
  // Ini adalah komponen yang sebelumnya hilang — consumer dari event bus
  CLUW_Bus.on('system.healing_alert', async (data: any) => {
    Logger.log('WARN', `[Proactive] Healing alert received: ${data.message}`, {}, 'AUTONOMY');
    CLUW_Bus.emit('system.autonomous_event', {
      title: '⚕️ Auto-Healing Aktif',
      content: `Sistem mendeteksi anomali dan melakukan perbaikan mandiri: ${data.message}`,
      type: 'warning',
      timestamp: new Date().toISOString()
    });
  });

  CLUW_Bus.on('system.heartbeat', (data: any) => {
    // Setiap heartbeat, cek jika ada tugas yang perlu dilakukan proaktif
    const uptimeMinutes = Math.floor((data.uptime || 0) / 60);
    if (uptimeMinutes > 0 && uptimeMinutes % 60 === 0) {
      Logger.log('INFO', `[Proactive] System uptime: ${uptimeMinutes} menit. Sistem stabil.`, {}, 'AUTONOMY');
    }
  });
}

/**
 * HEARTBEAT — Sekarang benar-benar melakukan pengecekan sistem
 */
export function startHeartbeat() {
  setInterval(async () => {
    Logger.log('INFO', 'Heartbeat: System operational.', {}, 'SYSTEM');

    // Cek kapasitas memori workspace (self-monitoring)
    try {
      const memDir = path.join(BASE_DIR, 'workspace', 'memories');
      const files = fs.readdirSync(memDir);
      const totalSize = files.reduce((acc, f) => {
        try { return acc + fs.statSync(path.join(memDir, f)).size; } catch { return acc; }
      }, 0);
      const sizeMB = (totalSize / (1024 * 1024)).toFixed(2);

      if (parseFloat(sizeMB) > 50) { // Alert jika memori > 50MB
        CLUW_Bus.emit('system.autonomous_event', {
          title: '⚠️ Memory Warning',
          content: `Neural memory telah mencapai ${sizeMB}MB. Pertimbangkan untuk menjalankan konsolidasi memori.`,
          type: 'warning',
          timestamp: new Date().toISOString()
        });
      }
    } catch {}

  }, 30 * 60 * 1000); // Setiap 30 menit
}

