import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { Logger } from '../utils/logger.js';
import { verifySkillSafety } from './skills.js';
import { CLUW_Bus } from './events.js';

const execAsync = promisify(exec);
const BASE_DIR = process.cwd();
const CLUW_SKILLS_DIR = path.join(BASE_DIR, 'workspace', 'skills', 'cluw_skills');
const REGISTRY_DIR = path.join(BASE_DIR, 'workspace', 'registry');
const SKILLS_MANIFEST_FILE = path.join(REGISTRY_DIR, 'skills_manifest.json');

function bumpVersion(version: string): string {
  const parts = (version || '1.0.0').split('.').map(Number);
  parts[1] = (parts[1] || 0) + 1;
  return `${parts[0] || 1}.${parts[1]}.0`;
}

export async function ensureCluwSkillsDir() {
  await fs.mkdir(CLUW_SKILLS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(REGISTRY_DIR, { recursive: true }).catch(() => {});
}

export interface CluwSkillInfo {
  fileName: string;
  type: 'javascript' | 'python' | 'unknown';
  size: number;
  lastModified: string;
  status: 'Aman' | 'Under Audit';
  threats: string[];
  version: string;
  lifecycle: 'draft' | 'testing' | 'production';
  created_by: 'CLUW' | 'User';
  approved_by?: string;
  created_at: string;
}

async function readManifest(): Promise<any[]> {
  try {
    await fs.mkdir(REGISTRY_DIR, { recursive: true });
    const data = await fs.readFile(SKILLS_MANIFEST_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function writeManifest(manifest: any[]) {
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
  await fs.writeFile(SKILLS_MANIFEST_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
}

export async function listCluwSkills(): Promise<CluwSkillInfo[]> {
  try {
    await ensureCluwSkillsDir();
    const files = await fs.readdir(CLUW_SKILLS_DIR);
    const manifest = await readManifest();
    let manifestUpdated = false;
    const result: CluwSkillInfo[] = [];

    for (const file of files) {
      if (file.startsWith('.')) continue; // ignore hidden files
      const filePath = path.join(CLUW_SKILLS_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          const ext = path.extname(file).toLowerCase();
          const type = ext === '.js' ? 'javascript' : ext === '.py' ? 'python' : 'unknown';
          
          let manifestEntry = manifest.find((m: any) => m.fileName === file);
          
          if (!manifestEntry) {
            // Self-heal: dynamically audit existing scripts not in manifest
            const code = await fs.readFile(filePath, 'utf-8');
            const safety = verifySkillSafety(code);
            manifestEntry = {
              fileName: file,
              status: safety.safe ? 'Aman' : 'Under Audit',
              threats: safety.threats,
              lastUpdated: stats.mtime.toISOString()
            };
            manifest.push(manifestEntry);
            manifestUpdated = true;
          }
          
          result.push({
            fileName: file,
            type,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            status: manifestEntry.status,
            threats: manifestEntry.threats,
            version: manifestEntry.version || '1.0.0',
            lifecycle: manifestEntry.lifecycle || 'draft',
            created_by: manifestEntry.created_by || 'CLUW',
            approved_by: manifestEntry.approved_by,
            created_at: manifestEntry.created_at || stats.birthtime.toISOString()
          });
        }
      } catch (e) {}
    }
    
    if (manifestUpdated) {
      await writeManifest(manifest);
    }
    
    return result;
  } catch (e: any) {
    Logger.log('ERROR', `Gagal melist cluw_skills: ${e.message}`, {}, 'SYSTEM');
    return [];
  }
}

export async function createCluwSkill(fileName: string, code: string): Promise<{ success: boolean; filePath: string }> {
  await ensureCluwSkillsDir();
  
  // Prevent directory traversal
  const safeName = path.basename(fileName);
  if (!safeName || safeName.includes('..') || safeName.includes('/') || safeName.includes('\\')) {
    throw new Error('Nama file tidak valid (deteksi directory traversal).');
  }

  const filePath = path.join(CLUW_SKILLS_DIR, safeName);
  await fs.writeFile(filePath, code, 'utf-8');
  
  // Safety check
  const safety = verifySkillSafety(code);
  const status = safety.safe ? 'Aman' : 'Under Audit';

  // Update manifest with versioning
  const manifest = await readManifest();
  const index = manifest.findIndex((m: any) => m.fileName === safeName);
  const existingEntry = index > -1 ? manifest[index] : null;
  const newVersion = existingEntry ? bumpVersion(existingEntry.version || '1.0.0') : '1.0.0';

  const newEntry = {
    fileName: safeName,
    status,
    threats: safety.threats,
    lastUpdated: new Date().toISOString(),
    version: newVersion,
    lifecycle: existingEntry?.lifecycle || 'draft',
    created_by: 'CLUW',
    created_at: existingEntry?.created_at || new Date().toISOString(),
    approved_by: existingEntry?.approved_by
  };
  if (index > -1) {
    manifest[index] = newEntry;
  } else {
    manifest.push(newEntry);
  }
  await writeManifest(manifest);
  
  // Emit notifications
  const friendlyStatus = safety.safe ? 'Aman' : 'Perlu Review';
  CLUW_Bus.emit('system.notification', {
    title: 'Audit Trail',
    message: `🛡️ Skill baru [${safeName}] siap digunakan. Status: ${friendlyStatus}`,
    type: safety.safe ? 'success' : 'warning'
  });
  
  // Also log a system message in the chat
  CLUW_Bus.emit('system.message', {
    content: `🛡️ **[SYSTEM AUDIT]** Skill baru **${safeName}** telah terpasang. Status: **${friendlyStatus}**${!safety.safe ? ` (Ancaman terdeteksi: ${safety.threats.join(', ')})` : ''}`
  });
  
  Logger.log('INFO', `Custom execution skill dibuat & diaudit: ${safeName} (${status})`, { filePath }, 'SYSTEM');
  return { success: true, filePath };
}

export async function executeCluwSkill(fileName: string, args: string[] = []): Promise<{ success: boolean; stdout: string; stderr: string; cmd: string; evidence: { exit_code: number; duration_ms: number; timestamp: string; hash: string } }> {
  await ensureCluwSkillsDir();

  const safeName = path.basename(fileName);
  const filePath = path.join(CLUW_SKILLS_DIR, safeName);

  try {
    // Check if file exists
    await fs.access(filePath);
  } catch (e) {
    throw new Error(`Skrip [${safeName}] tidak ditemukan di /cluw_skills/`);
  }

  const ext = path.extname(safeName).toLowerCase();
  let cmd = '';

  const sanitizedArgs = args.map(arg => {
    // Escape single quotes for shell safety
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }).join(' ');

  if (ext === '.js') {
    cmd = `node ${filePath} ${sanitizedArgs}`;
  } else if (ext === '.py') {
    // Windows biasanya menggunakan `python`, Linux/macOS menggunakan `python3`.
    // Kita deteksi platform, atau fallback ke `python` yang berjalan di atas OS ini.
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    cmd = `${pyCmd} ${filePath} ${sanitizedArgs}`;
  } else {
    throw new Error('Ekstensi file skrip tidak didukung. Gunakan .js milik Node atau .py milik Python.');
  }

  const startTime = Date.now();
  const codeContent = await fs.readFile(filePath, 'utf-8').catch(() => '');
  const hash = createHash('sha256').update(codeContent).digest('hex').substring(0, 16);

  try {
    Logger.log('INFO', `Menjalankan custom skill: ${cmd}`, {}, 'SYSTEM');
    const { stdout, stderr } = await execAsync(cmd);
    return {
      success: true,
      stdout,
      stderr,
      cmd,
      evidence: {
        exit_code: 0,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        hash
      }
    };
  } catch (error: any) {
    Logger.log('WARN', `Gagal mengeksekusi custom skill: ${error.message}`, {}, 'SYSTEM');
    return {
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
      cmd,
      evidence: {
        exit_code: typeof error.code === 'number' ? error.code : 1,
        duration_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        hash
      }
    };
  }
}

export async function promoteCluwSkill(fileName: string): Promise<{ success: boolean; newLifecycle: string }> {
  await ensureCluwSkillsDir();
  const safeName = path.basename(fileName);
  const manifest = await readManifest();
  const index = manifest.findIndex((m: any) => m.fileName === safeName);

  if (index === -1) throw new Error(`Skill [${safeName}] tidak ditemukan di manifest.`);

  const current = manifest[index];
  const transitions: Record<string, string> = { draft: 'testing', testing: 'production' };
  const newLifecycle = transitions[current.lifecycle || 'draft'];

  if (!newLifecycle) throw new Error(`Skill [${safeName}] sudah berada di status 'production'.`);

  manifest[index] = { ...current, lifecycle: newLifecycle, approved_by: 'Ard' };
  await writeManifest(manifest);

  CLUW_Bus.emit('system.notification', {
    title: 'Skill Promoted',
    message: `🚀 Skill [${safeName}] dipromosikan → ${newLifecycle.toUpperCase()}`,
    type: 'success'
  });

  Logger.log('INFO', `Skill lifecycle promoted: ${safeName} → ${newLifecycle}`, {}, 'SYSTEM');
  return { success: true, newLifecycle };
}

export function registerCluwSkillsRoutes(app: any) {
  // List current skills
  app.get('/api/cluw-skills/list', async (_req: any, res: any) => {
    try {
      const list = await listCluwSkills();
      res.json({ success: true, skills: list });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Create or modify custom skill
  app.post('/api/cluw-skills/create', async (req: any, res: any) => {
    try {
      const { fileName, code } = req.body;
      if (!fileName || !code) {
        return res.status(400).json({ success: false, error: 'Nama file dan konten kode harus diisi.' });
      }
      const result = await createCluwSkill(fileName, code);
      res.json(Object.assign({ success: true }, result));
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Execute custom skill
  app.post('/api/cluw-skills/execute', async (req: any, res: any) => {
    try {
      const { fileName, args } = req.body;
      if (!fileName) {
        return res.status(400).json({ success: false, error: 'Nama file harus disertakan.' });
      }
      const result = await executeCluwSkill(fileName, args || []);
      res.json(Object.assign({ success: true }, result));
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Promote skill lifecycle: draft → testing → production
  app.post('/api/cluw-skills/promote/:fileName', async (req: any, res: any) => {
    try {
      const { fileName } = req.params;
      const result = await promoteCluwSkill(fileName);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Delete custom skill
  app.delete('/api/cluw-skills/:fileName', async (req: any, res: any) => {
    try {
      const { fileName } = req.params;
      const safeName = path.basename(fileName);
      const filePath = path.join(CLUW_SKILLS_DIR, safeName);
      
      await fs.unlink(filePath);
      
      // Remove from manifest
      const manifest = await readManifest();
      const filtered = manifest.filter((m: any) => m.fileName !== safeName);
      if (filtered.length !== manifest.length) {
        await writeManifest(filtered);
      }
      
      Logger.log('INFO', `Custom skill didelete: ${safeName}`, {}, 'SYSTEM');
      res.json({ success: true, message: `Skrip ${safeName} berhasil dihapus.` });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
}
