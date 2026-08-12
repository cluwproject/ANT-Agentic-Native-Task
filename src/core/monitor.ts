import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Logger } from '../utils/logger.js';

export async function getSystemStats() {
  try {
    const uptime = os.uptime();
    const freeMem = os.freemem();
    const totalMem = os.totalmem();
    const loadAvg = os.loadavg();
    
    // Check disk usage: scan workspace directory size (works cross-platform)
    let diskUsage = "Unknown";
    try {
        const workspaceDir = path.join(process.cwd(), 'workspace');
        let totalBytes = 0;
        const scanDir = async (dir: string) => {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                await scanDir(fullPath);
              } else {
                const s = await fs.stat(fullPath);
                totalBytes += s.size;
              }
            }
          } catch {}
        };
        await scanDir(workspaceDir);
        diskUsage = `${(totalBytes / 1024 / 1024).toFixed(2)} MB (workspace/)`;
    } catch (e) {}

    return {
      status: 'HEARTBEAT_ACTIVE',
      uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      memory: `${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(2)}GB / ${(totalMem / 1024 / 1024 / 1024).toFixed(2)}GB`,
      load: loadAvg[0].toFixed(2),
      disk: diskUsage,
      platform: os.platform(),
      arch: os.arch()
    };
  } catch (e: any) {
    Logger.log('ERROR', `System Monitor failed: ${e.message}`, {}, 'MONITOR');
    return null;
  }
}
