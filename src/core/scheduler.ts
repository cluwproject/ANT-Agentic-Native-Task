import path from 'path';
import { promises as fs } from 'fs';
import { Logger } from '../utils/logger.js';
import { executeAction } from './actions.js';
import { ANT_Bus } from './events.js';
import { applyDecay } from './cognitive_architecture.js';

export interface CustomSchedule {
  id: string;
  cron: string;
  command: string;
  lastRun?: number;
}

export const customSchedules: CustomSchedule[] = [];
const SCHEDULES_FILE = path.join(process.cwd(), 'workspace', 'schedules.json');

export function cronMatches(expression: string, date: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [min, hour, dom, month, dow] = fields;
  
  const matchField = (field: string, val: number): boolean => {
    if (field === '*') return true;
    
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2), 10);
      return val % step === 0;
    }
    
    if (field.includes(',')) {
      return field.split(',').map(Number).includes(val);
    }
    
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(Number);
      return val >= start && val <= end;
    }
    
    return parseInt(field, 10) === val;
  };

  return (
    matchField(min, date.getMinutes()) &&
    matchField(hour, date.getHours()) &&
    matchField(dom, date.getDate()) &&
    matchField(month, date.getMonth() + 1) &&
    matchField(dow, date.getDay())
  );
}

export async function loadCustomSchedules() {
  try {
    const data = await fs.readFile(SCHEDULES_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      customSchedules.length = 0;
      customSchedules.push(...parsed);
    }
  } catch (e) {
    // start empty
  }
}

export async function saveCustomSchedules() {
  try {
    await fs.writeFile(SCHEDULES_FILE, JSON.stringify(customSchedules, null, 2));
  } catch (e: any) {
    Logger.log('ERROR', `Failed to save custom schedules: ${e.message}`, {}, 'SCHEDULER');
  }
}

export async function addCustomSchedule(cron: string, command: string): Promise<string> {
  const id = Math.random().toString(36).substring(2, 11);
  customSchedules.push({ id, cron, command });
  await saveCustomSchedules();
  Logger.log('INFO', `Custom task scheduled: "${command}" with cron "${cron}" (ID: ${id})`, {}, 'SCHEDULER');
  return id;
}

export interface ScheduledTask {
  id: string;
  name: string;
  intervalMs: number;
  lastRun?: number;
  action: () => Promise<void>;
  enabled: boolean;
}

export const tasks: ScheduledTask[] = [];

export function scheduleTask(name: string, minutes: number, action: () => Promise<void>) {
  const task: ScheduledTask = {
    id: Math.random().toString(36).substr(2, 9),
    name,
    intervalMs: minutes * 60 * 1000,
    action,
    enabled: true
  };
  tasks.push(task);
  Logger.log('INFO', `Task scheduled: ${name} every ${minutes}m`, {}, 'SCHEDULER');
}

export function startScheduler() {
  // Load custom schedules at startup
  loadCustomSchedules().then(() => {
    Logger.log('INFO', `Loaded ${customSchedules.length} custom schedules.`, {}, 'SCHEDULER');
  }).catch((e: any) => {
    Logger.log('ERROR', `Failed to load custom schedules: ${e.message}`, {}, 'SCHEDULER');
  });

  setInterval(async () => {
    const now = Date.now();
    for (const task of tasks) {
      if (task.enabled && (!task.lastRun || now - task.lastRun >= task.intervalMs)) {
        task.lastRun = now;
        try {
          Logger.log('INFO', `Running scheduled task: ${task.name}`, {}, 'SCHEDULER');
          ANT_Bus.emit('system.autonomous_event', {
            title: task.name,
            content: `Menjalankan prosedur internal kognitif.`,
            type: 'process',
            timestamp: new Date().toISOString()
          });
          await task.action();
        } catch (e: any) {
          Logger.log('ERROR', `Task ${task.name} failed: ${e.message}`, {}, 'SCHEDULER');
          ANT_Bus.emit('system.autonomous_event', {
            title: task.name,
            content: `Gagal: ${e.message}`,
            type: 'error',
            timestamp: new Date().toISOString()
          });
        }
      }
    }
  }, 10000); // Check every 10s

  // Check custom schedules
  setInterval(async () => {
    const now = new Date();
    const nowMs = now.getTime();
    
    for (const task of customSchedules) {
      if (!task.lastRun || nowMs - task.lastRun >= 60000) {
        if (cronMatches(task.cron, now)) {
          task.lastRun = nowMs;
          await saveCustomSchedules();
          
          try {
            Logger.log('INFO', `Running custom scheduled task: "${task.command}"`, {}, 'SCHEDULER');
            const result = await executeAction('shell_exec', { command: task.command }, 1, { manual_approval: false });
            Logger.log('INFO', `Custom task completed: "${task.command}"`, { result }, 'SCHEDULER');
          } catch (e: any) {
            Logger.log('ERROR', `Custom task failed: "${task.command}": ${e.message}`, {}, 'SCHEDULER');
          }
        }
      }
    }
  }, 10000);

  // Heartbeat
  setInterval(() => {
    Logger.log('DEBUG', 'ANT Heartbeat: Systems Operational', {}, 'HEARTBEAT');
    ANT_Bus.emit('system.heartbeat', { uptime: process.uptime() });
  }, 60000 * 5); // Every 5 minutes

  // Trust Score Decay Check (Runs every 60 minutes)
  scheduleTask('Trust Score Decay Check', 60, async () => {
    await applyDecay();
  });

  // PROACTIVE TASK: Morning System Check & Greeting
  scheduleTask('Daily System Insight', 1440, async () => {
    // Jalankan setiap 24 jam
    Logger.log('INFO', 'Generating daily proactive insight...', {}, 'SCHEDULER');
    
    try {
      const { getBrainConfig } = await import('../shared/data.js');
      const { tieredChat } = await import('./tiered_ai.js');
      const { semanticSearch } = await import('./memory.js');
      
      const config = await getBrainConfig();
      const context = await semanticSearch("rencana ard, tugas penting, prioritas", "semantic", 5);
      
      const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
      let timeOfDay = "pagi";
      if (hour >= 11 && hour < 15) timeOfDay = "siang";
      else if (hour >= 15 && hour < 18) timeOfDay = "sore";
      else if (hour >= 18 || hour < 5) timeOfDay = "malam";

      const prompt = `Analisis memori sistem berikut: ${JSON.stringify(context)}. 
      Hari ini menunjukkan waktu ${timeOfDay}. Berikan sapaan ${timeOfDay} proaktif untuk Ard yang menyebutkan satu hal mendesak atau progres kemarin secara halus (vibe souverign).
      Jangan sebutkan model AI Anda. Gunakan gaya ANT. Maksimal 1 kalimat.`;
      
      const { content: greeting } = await tieredChat(config, [{ role: 'user', content: prompt }], [], {}, `Sapaan ${timeOfDay} Cerdas.`);
      
      const message = `**Kernel Update**: ${greeting}`;
      ANT_Bus.emit('system.autonomous_event', { 
        title: 'Kernel Update', 
        content: greeting, 
        type: 'insight',
        timestamp: new Date().toISOString() 
      });
    } catch (e) {
      const hour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
      let greeting = "Selamat pagi";
      if (hour >= 11 && hour < 15) greeting = "Selamat siang";
      else if (hour >= 15 && hour < 18) greeting = "Selamat sore";
      else if (hour >= 18 || hour < 5) greeting = "Selamat malam";

      ANT_Bus.emit('system.autonomous_event', {
        title: 'Kernel Update',
        content: `${greeting}, Ard. Sistem telah melakukan optimalisasi rutin. Saya siap mendampingi agenda Anda hari ini.`,
        type: 'insight',
        timestamp: new Date().toISOString()
      });
    }
  });

  // PROACTIVE TASK: Morning News Briefing (Target 7 AM JKT)
  scheduleTask('Morning News Briefing', 30, async () => {
    const now = new Date();
    const jakartaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const currentHour = jakartaTime.getHours();
    
    // Hanya jalan di jam 7-8 pagi jika belum jalan hari ini
    if (currentHour === 7) {
      const todayStr = jakartaTime.toDateString();
      const newsCheckPath = path.join(process.cwd(), 'workspace', 'temp', 'last_morning_news.txt');
      
      try {
        const lastRunToday = await fs.readFile(newsCheckPath, 'utf-8').catch(() => '');
        if (lastRunToday === todayStr) return; // Sudah jalan pagi ini

        Logger.log('INFO', 'Running Proactive Morning News Briefing for 7 AM...', {}, 'SCHEDULER');
        
        const { getBrainConfig } = await import('../shared/data.js');
        const config = await getBrainConfig();
        if (!config.api_key) return;

        // Simulate a request to /api/news logic
        const prompt = `Siapkan ringkasan berita utama jam 7 pagi ini untuk Founder (Ard). 
        Cari 5 berita trending di Indonesia.
        Format: Berikan ringkasan dalam poin-poin yang tajam dan informatif.
        Language: Indonesian.`;
        
        const { chat } = await import('./ai.js');
        const response = await chat(config, [{ role: 'user', content: prompt }], [], {}, 'You are a News Curator.', 'gemini-3.5-flash', 'AUTONOMOUS');
        const content = typeof response === 'string' ? response : (response as any).content;

        // Simpan hasil ke workspace sebagai aksi nyata
        const reportPath = path.join(process.cwd(), 'workspace', `MORNING_NEWS_${jakartaTime.toISOString().split('T')[0]}.md`);
        await fs.writeFile(reportPath, `# 🌞 ANT MORNING NEWS - ${todayStr}\n\n${content}\n\n--- \n*Dihasilkan secara otomatis oleh ANT Kernels.*`);
        
        // Simpan tanda sudah jalan
        await fs.mkdir(path.dirname(newsCheckPath), { recursive: true }).catch(() => {});
        await fs.writeFile(newsCheckPath, todayStr);

        ANT_Bus.emit('system.autonomous_event', { 
          title: '7 AM News Prepared', 
          content: 'Laporan berita pagi telah siap dan disimpan di workspace sebagai aksi nyata.', 
          type: 'success',
          timestamp: new Date().toISOString() 
        });

      } catch (e: any) {
        Logger.log('ERROR', `Morning news prep failed: ${e.message}`, {}, 'SCHEDULER');
      }
    }
  });

  // PROACTIVE TASK: Self-Reflection Loop
  scheduleTask('Brain Reflection', 60, async () => {
    Logger.log('INFO', 'Starting autonomous brain reflection...', {}, 'SCHEDULER');
    try {
      const { runSelfReflection } = await import('./autonomy.js');
      await runSelfReflection();
    } catch (e) {}
  });

  // PROACTIVE TASK: Memory Consolidation (Episodic → Semantic)
  // Ini adalah siklus belajar otomatis yang sebelumnya tidak terjadwal
  scheduleTask('Memory Consolidation', 180, async () => {
    Logger.log('INFO', 'Running Memory Consolidation (Episodic → Semantic)...', {}, 'MEMORY');
    try {
      const { consolidateMemories } = await import('./memory.js');
      await consolidateMemories();
      ANT_Bus.emit('system.autonomous_event', {
        title: '🧠 Memory Consolidated',
        content: 'Konsolidasi memori episodik ke semantik selesai. ANT telah mencerna pengalaman terbaru.',
        type: 'success',
        timestamp: new Date().toISOString()
      });
    } catch (e: any) {
      Logger.log('ERROR', `Memory consolidation failed: ${e.message}`, {}, 'MEMORY');
    }
  });

  // PROACTIVE TASK: Memory Pruning (Setiap 7 hari)
  scheduleTask('Memory Pruning', 10080, async () => {
    try {
      const { pruneMemories } = await import('./memory.js');
      await pruneMemories();
    } catch (e: any) {
      Logger.log('ERROR', `Memory pruning task failed: ${e.message}`, {}, 'MEMORY');
    }
  });
}
