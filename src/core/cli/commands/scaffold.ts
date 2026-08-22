import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { loadProfile } from '../../agentic/profile.js';
import { MilestoneRunner } from '../../agentic/milestone_runner.js';

export async function runScaffoldCommand(profileId: string, targetDir: string) {
  console.log(chalk.blue(`\nMemulai proses scaffolding dengan profil: ${profileId}`));
  
  const profile = loadProfile(profileId);
  if (!profile) {
    console.error(chalk.red(`\nError: Profil "${profileId}" tidak ditemukan di workspace/profiles atau src/core/agentic/profiles.`));
    process.exit(1);
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
    } else {
      console.log(chalk.yellow('\n⚠️ Pipeline scaffold selesai tetapi mungkin ada tahapan yang belum sempurna.'));
    }
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Pipeline gagal: ${error.message}`));
    process.exit(1);
  }
}
