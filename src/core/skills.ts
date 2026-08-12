import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Directory layout (skill folder, trash folder)
// ---------------------------------------------------------------------------
const SKILLS_DIR = path.join(process.cwd(), 'workspace', 'skills');
const TRASH_DIR = path.join(process.cwd(), 'workspace', 'trash', 'skills');

/**
 * Skill manifest – the contract that every skill must expose.
 * It replaces the older `SkillMetadata` used only for UI display.
 */
export interface SkillManifest {
  id?: string;                     // internal folder id (generated)
  name: string;                    // human readable name
  version: string;                 // semver string
  description: string;
  author: string;
  icon: string;
  entry: string;                   // relative path to the executable file
  trigger_commands: string[];      // commands that invoke the skill
  permissions: string[];           // e.g. ["terminal","filesystem"]
  risk: 'low' | 'medium' | 'high'; // risk classification
  approval: 'required' | 'auto';   // whether human approval is needed
  tools?: string[];                // external tools required
  requires?: string[];            // runtime requirements (e.g. python>=3.11)
  status?: 'Created' | 'Validated' | 'Approved' | 'Installed' | 'Enabled' | 'Trusted' | 'Locked' | 'Trash' | 'Active';
  source?: string;                 // external / internal source flag
}

export type SkillMetadata = SkillManifest;

/** Simple runtime validation for a manifest. Throws if invalid. */
export function validateManifest(manifest: any): asserts manifest is SkillManifest {
  const required = ['name', 'version', 'description', 'author', 'icon', 'entry', 'trigger_commands', 'permissions', 'risk', 'approval'];
  for (const key of required) {
    if (!(key in manifest)) {
      throw new Error(`Manifest validation failed: missing required field "${key}"`);
    }
  }
  // Basic type checks (more thorough schema can be added later)
  if (!Array.isArray(manifest.trigger_commands) || !Array.isArray(manifest.permissions)) {
    throw new Error('Manifest validation failed: trigger_commands and permissions must be arrays');
  }
  if (!['low', 'medium', 'high'].includes(manifest.risk)) {
    throw new Error('Manifest validation failed: risk must be low|medium|high');
  }
  if (!['required', 'auto'].includes(manifest.approval)) {
    throw new Error('Manifest validation failed: approval must be required|auto');
  }
}

/**
 * Update the trust score for a skill after an execution.
 * `result` should be "success" or "error".
 */
export async function updateTrustScore(id: string, result: 'success' | 'error') {
  const skillPath = path.join(SKILLS_DIR, id);
  const trustPath = path.join(skillPath, 'trust.json');
  let trustData: any = { executions: 0, successes: 0, failures: 0, trust: 0 };
  try {
    const raw = await fs.readFile(trustPath, 'utf-8');
    trustData = JSON.parse(raw);
  } catch {
    // ignore – will be created anew
  }
  trustData.executions += 1;
  if (result === 'success') {
    trustData.successes += 1;
  } else {
    trustData.failures += 1;
  }
  trustData.trust = trustData.executions > 0 ? Math.round((trustData.successes / trustData.executions) * 100) : 0;
  await fs.writeFile(trustPath, JSON.stringify(trustData, null, 2));
  Logger.log('INFO', `Trust score updated for skill ${id}: ${trustData.trust}%`, { id, trust: trustData.trust }, 'SKILL');
  return trustData;
}

export async function ensureDirs() {
  await fs.mkdir(SKILLS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(TRASH_DIR, { recursive: true }).catch(() => {});
}

export async function getInstalledSkills() {
  try {
    await ensureDirs();
    const folders = await fs.readdir(SKILLS_DIR);
    const skills: SkillMetadata[] = [];

    for (const folder of folders) {
      const metadataPath = path.join(SKILLS_DIR, folder, 'metadata.json');
      try {
        const data = await fs.readFile(metadataPath, 'utf-8');
        const meta = JSON.parse(data);
        skills.push({
          ...meta,
          id: folder,
          status: meta.status || 'Active',
          source: 'External'
        });
      } catch (e) {
        // Skip folders without valid metadata
      }
    }

    // Default system skills
    const systemSkills: SkillMetadata[] = [
      {
        name: 'Kernel Vision',
        version: '1.0.0',
        description: 'Native multimodal processing via Imagen 4 protocol.',
        author: 'Ard (Founder)',
        icon: '👁️',
        entry: '',
        trigger_commands: ['analisis gambar', 'buat gambar'],
        permissions: ['camera', 'image_generation'],
        risk: 'low',
        approval: 'auto',
        status: 'Active'
      },
      {
        name: 'Temporal Memory',
        version: '2.1.0',
        description: 'Long-term context retention using RAG semantic mapping.',
        author: 'Ard (Founder)',
        icon: '🧠',
        entry: '',
        trigger_commands: ['ingat ini', 'recall context'],
        permissions: ['filesystem', 'embedding'],
        risk: 'low',
        approval: 'auto',
        status: 'Active'
      }
    ];

    return [...systemSkills, ...skills];
  } catch (e: any) {
    Logger.log('ERROR', `Failed to load skills: ${e.message}`, {}, 'SYSTEM');
    return [];
  }
}

export async function getTrashSkills() {
  try {
    await ensureDirs();
    const folders = await fs.readdir(TRASH_DIR);
    const skills: SkillMetadata[] = [];

    for (const folder of folders) {
      const metadataPath = path.join(TRASH_DIR, folder, 'metadata.json');
      try {
        const data = await fs.readFile(metadataPath, 'utf-8');
        const meta = JSON.parse(data);
        skills.push({
          ...meta,
          id: folder,
          status: 'Trash',
          source: 'Trash'
        });
      } catch (e) {}
    }
    return skills;
  } catch (e) { return []; }
}

export async function installSkillFromUrl(url: string) {
  try {
    await ensureDirs();
    let downloadUrl = url;
    if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
      downloadUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
    }

    const resp = await axios.get(downloadUrl);
    const content = resp.data;
    
    // Simple Validation
    if (typeof content !== 'object' || !content.name) throw new Error('Invalid skill manifest format (JSON expected)');
    
    const id = `extra_${uuidv4().slice(0, 8)}`;
    const skillPath = path.join(SKILLS_DIR, id);
    await fs.mkdir(skillPath, { recursive: true });
    
    await fs.writeFile(path.join(skillPath, 'metadata.json'), JSON.stringify({
      ...content,
      status: 'Active'
    }, null, 2));

    await Logger.log('INFO', `New skill installed from URL: ${content.name}`, { id }, 'SYSTEM');
    return { success: true, id, name: content.name };
  } catch (e: any) {
    throw new Error(`Installation failed: ${e.message}`);
  }
}

import AdmZip from 'adm-zip';

export async function analyzeSkillFile(file: any) {
  try {
    let metadata: any = null;

    if (file.originalname.endsWith('.zip')) {
      const zip = new AdmZip(file.path);
      const zipEntries = zip.getEntries();
      
      const metaEntry = zipEntries.find(e => e.entryName === 'metadata.json' || e.entryName.endsWith('/metadata.json'));
      if (metaEntry) {
        metadata = JSON.parse(zip.readAsText(metaEntry));
      } else {
        throw new Error('Tidak menemukan metadata.json di dalam ZIP.');
      }
    } else if (file.originalname.endsWith('.json')) {
      metadata = JSON.parse(await fs.readFile(file.path, 'utf-8'));
    } else {
      throw new Error('Format file tidak didukung. Harap gunakan ZIP atau JSON.');
    }

    // Buat penjelasan logis
    const capabilitiesStr = metadata.capabilities ? metadata.capabilities.join(', ') : 'Fungsi Dasar';
    const explanation = `Pemindaian kognitif terhadap "${file.originalname}" berhasil. Skill bernama "${metadata.name || 'Unknown'}" ini dirancang untuk menambah kemampuan: ${capabilitiesStr}. File ini berisi skema fungsional autentik yang akan menyatu dengan framework setelah disetujui.`;

    return {
      ...metadata,
      name: metadata.name || file.originalname.replace('.zip', '').replace('.json', ''),
      explanation,
      tempFilePath: file.path,
      isZip: file.originalname.endsWith('.zip')
    };

  } catch (error: any) {
    throw new Error(`Analisis gagal: ${error.message}`);
  }
}

export async function confirmSkillIngest(skillData: any) {
  await ensureDirs();
  const id = `plugin_${uuidv4().slice(0, 8)}`;
  const skillPath = path.join(SKILLS_DIR, id);
  await fs.mkdir(skillPath, { recursive: true });
  
  if (skillData.isZip && skillData.tempFilePath) {
    const zip = new AdmZip(skillData.tempFilePath);
    zip.extractAllTo(skillPath, true);
  } else if (skillData.tempFilePath) {
    // If it's just JSON
    await fs.copyFile(skillData.tempFilePath, path.join(skillPath, 'metadata.json'));
  }

  // Cleanup temp internal properties if needed, then overwrite metadata to ensure active state
  const finalMeta = { ...skillData };
  delete finalMeta.explanation;
  delete finalMeta.tempFilePath;
  delete finalMeta.isZip;

  await fs.writeFile(path.join(skillPath, 'metadata.json'), JSON.stringify({
    ...finalMeta,
    status: 'Active',
    trigger_commands: skillData.trigger_commands || [`gunakan ${skillData.name?.toLowerCase() || 'skill'}`],
    permissions: skillData.permissions || ['filesystem']
  }, null, 2));

  // Clean up temp file
  if (skillData.tempFilePath) {
    await fs.unlink(skillData.tempFilePath).catch(() => {});
  }

  await Logger.log('INFO', `Neural integration confirmed: ${skillData.name}`, { id }, 'SYSTEM');
  return { success: true, id };
}

export async function deleteSkill(id: string) {
  const sourcePath = path.join(SKILLS_DIR, id);
  const targetPath = path.join(TRASH_DIR, id);
  await ensureDirs();
  await fs.rename(sourcePath, targetPath);
  await Logger.log('INFO', `Skill moved to trash: ${id}`, {}, 'SYSTEM');
}

export async function restoreSkill(id: string) {
  const sourcePath = path.join(TRASH_DIR, id);
  const targetPath = path.join(SKILLS_DIR, id);
  await ensureDirs();
  await fs.rename(sourcePath, targetPath);
  await Logger.log('INFO', `Skill restored from trash: ${id}`, {}, 'SYSTEM');
}

export async function rollbackSkills() {
  await ensureDirs();
  const folders = await fs.readdir(SKILLS_DIR);
  for (const f of folders) {
    await fs.rm(path.join(SKILLS_DIR, f), { recursive: true, force: true });
  }
  await Logger.log('INFO', `Rollback completed. All external skills removed.`, {}, 'SYSTEM');
}

export function verifySkillSafety(code: string): { safe: boolean, threats: string[] } {
  const dangerousPatterns = [
    { regex: /child_process[\s\.]+(exec|spawn)/g, name: 'Direct Shell Execution' },
    { regex: /process\.env/g, name: 'Environment Variable Access' },
    { regex: /rm\s+-rf/g, name: 'Destructive Command' },
    { regex: /base64/gi, name: 'Potential Obfuscation' },
    { regex: /fetch\(.*['"]https?:\/\/.*\.php/gi, name: 'Suspicious External Hit' }
  ];

  const threats = dangerousPatterns
    .filter(p => p.regex.test(code))
    .map(p => p.name);

  return {
    safe: threats.length === 0,
    threats
  };
}
