import path from 'path';
import fs from 'fs/promises';
import { Logger } from '../utils/logger.js';
import { SkillManifest } from './skills.js';

/**
 * SkillLifecycleManager handles the full lifecycle of a skill:
 *   Created → Validated → Approved → Installed → Enabled → Trusted → …
 * The state is persisted in JSON files under `workspace/lifecycle/`.
 */
export class SkillLifecycleManager {
  private readonly lifecycleDir: string;
  private readonly enabledPath: string;
  private readonly pendingPath: string;

  constructor() {
    const base = path.join(process.cwd(), 'workspace', 'lifecycle');
    this.lifecycleDir = base;
    this.enabledPath = path.join(base, 'enabled.json');
    this.pendingPath = path.join(base, 'pending.json');
  }

  /** Ensure lifecycle directory exists */
  async ensureDirs() {
    await fs.mkdir(this.lifecycleDir, { recursive: true });
  }

  /** Create a new skill entry (raw files are placed in a temporary folder by the planner) */
  async createSkill(tempFolder: string, manifest: SkillManifest) {
    await this.ensureDirs();
    // Validate manifest first
    // (imported validation function lives in skills.ts)
    const { validateManifest } = await import('./skills.js');
    (validateManifest as any)(manifest);

    // Assign an id if not present
    const id = manifest.id ?? `skill_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    manifest.id = id;
    manifest.status = 'Created';

    // Move temporary folder to final location under workspace/skills/<id>
    const dest = path.join(process.cwd(), 'workspace', 'skills', id);
    await fs.mkdir(dest, { recursive: true });
    // Simple copy (recursive) – Node 16+ supports fs.cp, fallback to manual copy if unavailable
    await this.copyRecursive(tempFolder, dest);

    // Write manifest (as manifest.json) and initial trust file
    await fs.writeFile(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await fs.writeFile(path.join(dest, 'trust.json'), JSON.stringify({ executions: 0, successes: 0, failures: 0, trust: 0 }, null, 2));

    Logger.log('INFO', `Skill created with id=${id}`, { id }, 'SKILL');
    return manifest;
  }

  /** Simple recursive copy helper */
  private async copyRecursive(src: string, dest: string) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /** Move a skill to pending approval */
  async requestApproval(manifest: SkillManifest) {
    await this.ensureDirs();
    const pending = await this.readJson(this.pendingPath);
    pending[manifest.id!] = manifest;
    await fs.writeFile(this.pendingPath, JSON.stringify(pending, null, 2));
    Logger.log('INFO', `Skill ${manifest.id} awaiting human approval`, { id: manifest.id }, 'SKILL');
  }

  /** Approve a pending skill and install it */
  async approveSkill(id: string) {
    await this.ensureDirs();
    const pending = await this.readJson(this.pendingPath);
    const manifest = pending[id] as SkillManifest;
    if (!manifest) throw new Error(`Skill ${id} not found in pending list`);
    // Update status and move to enabled list
    manifest.status = 'Enabled';
    const enabled = await this.readJson(this.enabledPath);
    enabled[id] = manifest;
    await fs.writeFile(this.enabledPath, JSON.stringify(enabled, null, 2));
    // Remove from pending
    delete pending[id];
    await fs.writeFile(this.pendingPath, JSON.stringify(pending, null, 2));
    Logger.log('INFO', `Skill ${id} approved and enabled`, { id }, 'SKILL');
    return manifest;
  }

  /** Helper to read a JSON file, returns {} if file does not exist */
  private async readJson(filePath: string) {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
}
