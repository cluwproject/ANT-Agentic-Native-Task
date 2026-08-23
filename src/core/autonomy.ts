import { chat } from './ai.js';
import { tieredChat } from './tiered_ai.js';
import { getBrainConfig } from '../shared/data.js';
import { ANT_Bus } from './events.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

const BASE_DIR = process.cwd();

export async function runSelfReflection() {
  try {
    const config = await getBrainConfig();
    if (!config.api_key) return;

    // Use Semantic Search to find relevant context
    const { semanticSearch } = await import('./memory/memory.js');
    const recentContext = await semanticSearch("rencana ard, tugas ant, status proyek", "semantic", 3);
    
    let contextBrief = recentContext.length > 0 
      ? recentContext.map(r => `[${r.key}]: ${typeof r.data === 'string' ? r.data.substring(0, 50) : 'Data kompleks'}`).join('; ')
      : "Sistem beroperasi dalam mode stand-by.";

    const prompt = `Kamu adalah ANT (Autonomous Mode). 
    Analisis Konteks Sistem:
    - Memori Relevan: ${contextBrief}
    - Status: Siap Mendampingi.

    Tugas: Berikan refleksi internal yang cerdas (Sovereign Digital Companion). 
    Fokus pada efisiensi atau langkah proaktif berikutnya.
    Beri respon dalam 1-2 kalimat (Indonesia).`;

    const { content: insight } = await tieredChat(config, [{ role: 'user', content: prompt }], [], {}, "Analisis Autonomos.");
    
    ANT_Bus.emit('system.autonomous_event', {
        title: 'Cognitive Reflection',
        content: insight,
        type: 'insight',
        timestamp: new Date().toISOString()
    });

    Logger.log('INFO', 'Autonomous reflection completed.', { contextCount: recentContext.length }, 'AUTONOMY');
  } catch (e: any) {
    const errorMsg = e.message?.toLowerCase() || '';
    const isSpendingCap = errorMsg.includes('spending cap') || errorMsg.includes('billing') || errorMsg.includes('insufficient') || errorMsg.includes('balance') || errorMsg.includes('402') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted') || errorMsg.includes('429') || e.status === 402 || e.statusCode === 402 || e.status === 429 || e.statusCode === 429;
    
    if (isSpendingCap) {
      Logger.log('WARN', `Autonomy loop is hibernating: API Provider spending cap, quota limit, or insufficient balance reached.`, {}, 'AUTONOMY');
      ANT_Bus.emit('system.message', {
        content: `⚠️ **[ANT Autopilot Mode Hibernation]**\n\nHalo **Ard**, Autopilot / Autonomy loop saya saat ini masuk ke mode hibernasi karena saldo, kuota, atau batas pemakaian (Rate Limit / Quota Exceeded) API Provider (Gemini, DeepSeek, atau OpenAI) Anda habis.\n\nSilakan isi ulang saldo, tingkatkan batas kuota Anda, atau tunggu beberapa saat untuk mengaktifkan kembali fungsi otonom saya.`
      });
    } else {
      Logger.log('ERROR', `Autonomy loop failed: ${e.message}`, {}, 'AUTONOMY');
    }
  }
}
