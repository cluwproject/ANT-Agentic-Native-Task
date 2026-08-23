import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadProfile } from '../../agentic/profile.js';
import { MilestoneRunner } from '../../agentic/milestone_runner.js';
import type { CliContext } from '../types.js';

export async function runScaffoldCommand(profileId: string, targetDir: string, exitOnError = true): Promise<boolean> {
  console.log(chalk.blue(`\nMemulai proses scaffolding dengan profil: ${profileId}`));
  
  const profile = loadProfile(profileId);
  if (!profile) {
    console.error(chalk.red(`\nError: Profil "${profileId}" tidak ditemukan di workspace/profiles atau src/core/agentic/profiles.`));
    if (exitOnError) process.exit(1);
    return false;
  }

  const absoluteTargetDir = path.resolve(process.cwd(), targetDir);
  
  if (!fs.existsSync(absoluteTargetDir)) {
    console.log(chalk.dim(`Membuat direktori target: ${absoluteTargetDir}`));
    fs.mkdirSync(absoluteTargetDir, { recursive: true });
  }

  const runner = new MilestoneRunner({
    profile,
    targetDir: absoluteTargetDir,
    maxPatchAttempts: 3
  });

  try {
    const success = await runner.run(`Scaffold project di ${absoluteTargetDir}`);
    if (success) {
      console.log(chalk.green('\n✅ Pipeline scaffold selesai dengan sukses!'));
      return true;
    } else {
      console.log(chalk.yellow('\n⚠️ Pipeline scaffold selesai tetapi mungkin ada tahapan yang belum sempurna.'));
      return false;
    }
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Pipeline gagal: ${error.message}`));
    if (exitOnError) process.exit(1);
    return false;
  }
}

export async function handleScaffoldCommands(text: string, ctx: CliContext): Promise<boolean> {
  if (text.startsWith('/scaffold')) {
    const parts = text.replace(/^\/scaffold\s*/, '').trim().split(/\s+/);
    const profileId = parts[0];
    const targetDir = parts[1];

    if (!profileId || !targetDir) {
      console.log(chalk.yellow('\n  Penggunaan: /scaffold <profileId> <targetDir>'));
      console.log(chalk.dim('  Contoh     : /scaffold next-prisma ./my-test-app\n'));
      return true;
    }

    await runScaffoldCommand(profileId, targetDir, false);
    console.log();
    return true;
  }
  return false;
}
