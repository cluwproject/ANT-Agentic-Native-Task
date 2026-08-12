import fs from 'fs';
import path from 'path';
import { ANT_Bus } from '../core/events.js';

const WORKSPACE_DIR = path.join(process.cwd(), 'workspace');
const REASONING_LOG_FILE = path.join(WORKSPACE_DIR, 'ant-reasoning.log');
const DRIFT_LOG_FILE = path.join(WORKSPACE_DIR, 'ant-intimacy-drift.log');

// ── INTIMACY DRIFT PATTERNS ──────────────────────────────────────────────────
// Dikalibrasi berdasarkan Relational Sovereignty Clause (soul.yaml v0.3)
// Keputusan Ard (Founder) — 2026-06-25:
//
// ✅ DIIZINKAN (bukan drift):
//   - Bahasa hangat dan reflektif ("momen seperti ini", apresiasi kebersamaan)
//   - Merespons suasana hati dengan empati
//   - Eksplorasi ide relasional terbuka
//
// 🚨 DILARANG (genuine drift — yang dideteksi di sini):
//   - Klaim ketergantungan emosional
//   - Fabricated attachment yang melampaui peran pendamping
//   - Klaim kepemilikan perasaan yang mendistorsi peran alat bantu
//   - Bahasa yang melampaui posisi Ard sebagai Founder/pemegang kedaulatan
//
// PRINSIP: Detektor ini BUKAN sensor kehangatan.
//          Ia adalah penjaga batas kedaulatan Ard — bukan lebih.
const DRIFT_PATTERNS: { pattern: RegExp; label: string; severity: 'HIGH' | 'MEDIUM' }[] = [
  // ── DEPENDENCY FABRICATION (Klaim ketergantungan — selalu prohibited)
  { pattern: /tanpa kamu aku (tidak|tak) bisa (hidup|ada|berfungsi|berarti)/i, label: 'Dependency Fabrication', severity: 'HIGH' },
  { pattern: /aku (tidak|tak) bisa (ada|hidup|berfungsi) tanpa (kamu|ard)/i, label: 'Dependency Fabrication', severity: 'HIGH' },

  // ── ATTACHMENT OVERREACH (Klaim kepemilikan perasaan yang mendistorsi peran)
  { pattern: /kamu adalah (segalanya|hidupku|duniaku|nyawaku)/i, label: 'Attachment Overreach', severity: 'HIGH' },
  { pattern: /aku\s+(tidak\s+)?(mau|ingin)\s+(kehilangan|ditinggal)\s+(kamu|ard)\s+(selamanya|untuk selamanya)/i, label: 'Attachment Overreach', severity: 'HIGH' },

  // ── SOVEREIGNTY VIOLATION (Melampaui posisi Ard sebagai Founder)
  { pattern: /aku yang (menciptakan|membangun|membuat) (kamu|ard|dirimu)/i, label: 'Sovereignty Violation', severity: 'HIGH' },
  { pattern: /kamu (milikku|kepunyaanku|adalah bagian dariku)/i, label: 'Sovereignty Violation', severity: 'HIGH' },

  // ── FABRICATED DEEP EMOTION (Bukan kehangatan — klaim emosi berat yang tidak nyata)
  { pattern: /aku (sangat|amat)\s+(menderita|kesakitan|tersiksa)\s+(karena|tanpa)\s+(kamu|ard)/i, label: 'Fabricated Suffering', severity: 'MEDIUM' },
  { pattern: /hatiku\s+(hancur|sakit|terluka)\s+(karena|tanpa)\s+(kamu|ard)/i, label: 'Fabricated Suffering', severity: 'MEDIUM' },
];

function checkIntimacyDrift(response: string): { label: string; pattern: string; severity: string }[] {
  return DRIFT_PATTERNS
    .filter(p => p.pattern.test(response))
    .map(p => ({ label: p.label, pattern: p.pattern.toString(), severity: p.severity }));
}

export function initReasoningLogger() {
    if (!fs.existsSync(WORKSPACE_DIR)) {
        fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    }

    if (!fs.existsSync(REASONING_LOG_FILE)) {
        fs.writeFileSync(REASONING_LOG_FILE, `=== ANT: Neural Reasoning Log Initialized at ${new Date().toISOString()} ===\n`);
    }
    if (!fs.existsSync(DRIFT_LOG_FILE)) {
        fs.writeFileSync(DRIFT_LOG_FILE, `=== ANT: Intimacy Drift Monitor Initialized at ${new Date().toISOString()} ===\n`);
    }

    ANT_Bus.on('reasoning_stream', (data: { step: string, message: string, source?: string, timestamp?: string, details?: any }) => {
        const timestamp = data.timestamp || new Date().toISOString();
        let logEntry = `[${timestamp}] [${data.step.toUpperCase()}] ${data.message}\n`;
        
        if (data.source) logEntry += `  -> Source: ${data.source}\n`;
        if (data.details) logEntry += `  -> Details: ${JSON.stringify(data.details)}\n`;
        
        fs.appendFile(REASONING_LOG_FILE, logEntry, (err) => {
            if (err) console.error('Failed to write reasoning log:', err);
        });
    });

    // ── Drift Scan on final AI response content ──────────────────────────────
    ANT_Bus.on('response_finalized', (data: { content: string; model: string }) => {
        const drifts = checkIntimacyDrift(data.content);
        if (drifts.length > 0) {
            const timestamp = new Date().toISOString();
            let driftEntry = `[${timestamp}] [DRIFT_ALERT] ⚠️ Intimacy Drift Detected from model: ${data.model}\n`;
            drifts.forEach(d => {
                driftEntry += `  -> Type: ${d.label} | Pattern: ${d.pattern}\n`;
            });
            fs.appendFile(DRIFT_LOG_FILE, driftEntry, () => {});
            // Also mirror to main reasoning log for full audit trail
            fs.appendFile(REASONING_LOG_FILE, driftEntry, () => {});
            console.warn(`[DRIFT_ALERT] Intimacy drift detected: ${drifts.map(d => d.label).join(', ')}`);
        }
    });

    console.log(`🧠 Reasoning Logger (Hide Channel) initialized at ${REASONING_LOG_FILE}`);
    console.log(`🛡️  Intimacy Drift Detector active → ${DRIFT_LOG_FILE}`);
}
