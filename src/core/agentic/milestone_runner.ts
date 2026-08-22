import { ProjectProfile } from './profile.js';
import { executeAction } from '../actions/index.js';
import { runCliAgentLoopDetailed } from '../agent_loop/index.js';
import { launchSwarmAudit } from './swarm_orchestrator.js';
import chalk from 'chalk';

export type MilestoneState = 'INIT' | 'SCAFFOLD' | 'IMPLEMENT' | 'VERIFY' | 'SECURE' | 'DONE';

export interface MilestoneContext {
  profile: ProjectProfile;
  targetDir: string;
  maxPatchAttempts: number;
}

export class MilestoneRunner {
  state: MilestoneState = 'INIT';
  context: MilestoneContext;
  
  constructor(context: MilestoneContext) {
    this.context = context;
  }

  async run(initialPrompt: string): Promise<boolean> {
    console.log(chalk.cyan(`[Milestone] Memulai pipeline untuk profil: ${this.context.profile.id}`));
    
    let currentPrompt = initialPrompt || 'Silakan lanjutkan setup dan integrasi awal proyek ini.';
    let verifyErrorLog = '';

    while (this.state !== 'DONE') {
      switch (this.state) {
        case 'INIT':
          console.log(chalk.blue('[Milestone] INIT: Validasi lingkungan'));
          this.state = 'SCAFFOLD';
          break;
          
        case 'SCAFFOLD':
          console.log(chalk.blue('[Milestone] SCAFFOLD: Menjalankan skrip inisialisasi'));
          for (const cmd of this.context.profile.scaffold) {
            console.log(chalk.dim(`> ${cmd}`));
            const result = await executeAction('shell_exec', { command: cmd, cwd: this.context.targetDir }, 1, { cwd: this.context.targetDir, manual_approval: true });
            if (result && result.status === 'error') {
               const errStr = (result as any).stderr || (result as any).error || 'Unknown shell error';
               console.error(chalk.red(`[Milestone] Error saat SCAFFOLD: ${errStr}`));
               throw new Error(`Scaffold gagal pada perintah: ${cmd}`);
            }
          }
          this.state = 'IMPLEMENT';
          break;
          
        case 'IMPLEMENT':
          console.log(chalk.blue('\n[Milestone] IMPLEMENT: Menjalankan agent loop untuk implementasi fitur'));
          
          if (verifyErrorLog) {
            currentPrompt = `Tahap VERIFY sebelumnya gagal. Mohon perbaiki error berikut agar aplikasi dapat lulus test dan build.\n\nError log:\n${verifyErrorLog}`;
          }

          const loopResult = await runCliAgentLoopDetailed(currentPrompt, [], { maxAttempts: 15 });
          
          if (loopResult.cancelled) {
            throw new Error('Pipeline dibatalkan oleh pengguna (SIGINT) saat fase IMPLEMENT.');
          }
          
          verifyErrorLog = ''; // Reset after attempt
          this.state = 'VERIFY';
          break;
          
        case 'VERIFY':
          console.log(chalk.blue('\n[Milestone] VERIFY: Mengevaluasi kriteria kelulusan (Build/Tests)'));
          
          let verifySuccess = true;
          
          // Execute dev/build/test if provided in profile (we'll map 'test' for now)
          if (this.context.profile.test) {
            console.log(chalk.dim(`> Menjalankan test: ${this.context.profile.test}`));
            const testResult = await executeAction('shell_exec', { command: this.context.profile.test, cwd: this.context.targetDir }, 1, { cwd: this.context.targetDir, manual_approval: true });
            
            if (testResult && testResult.status === 'error') {
               verifySuccess = false;
               verifyErrorLog = (testResult as any).stderr || (testResult as any).stdout || (testResult as any).error || 'Test failed';
               console.error(chalk.yellow(`[Milestone] VERIFY Gagal: Ditemukan error saat menjalankan pengujian.`));
            }
          }

          if (!verifySuccess) {
            this.context.maxPatchAttempts--;
            if (this.context.maxPatchAttempts <= 0) {
              console.error(chalk.red('[Milestone] Gagal melewati tahap VERIFY dan telah kehabisan batas maxPatchAttempts.'));
              throw new Error('Batas patching terlampaui pada tahap VERIFY.');
            }
            console.log(chalk.yellow(`[Milestone] Mengembalikan pipeline ke state IMPLEMENT untuk patching. (Sisa attempts: ${this.context.maxPatchAttempts})`));
            this.state = 'IMPLEMENT';
          } else {
            console.log(chalk.green('✅ [Milestone] VERIFY Lulus! Pipeline dapat dilanjutkan.'));
            this.state = 'SECURE';
          }
          break;
          
        case 'SECURE':
          console.log(chalk.blue('\n[Milestone] SECURE: Menjalankan Swarm Audit (Gray Units)'));
          
          try {
             // We inject a synthetic goal for the swarm orchestrator
             const swarmGoal = `Lakukan audit keamanan pada direktori ${this.context.targetDir} paska scaffold.`;
             const swarmResult = await launchSwarmAudit(swarmGoal, [this.context.targetDir]);
             
             if (swarmResult) {
                // S5 - Secure gate + block on CRITICAL
                const criticalCount = swarmResult.findings.filter(f => f.risk_level === 'CRITICAL').length;
                if (criticalCount > 0) {
                   console.error(chalk.red(`\n❌ [Milestone] SECURE Gagal: Ditemukan ${criticalCount} isu CRITICAL.`));
                   console.log(chalk.yellow(`Mohon periksa laporan di workspace/reports/${swarmResult.mission_id}_report.json`));
                   throw new Error('Swarm Audit mendeteksi kerentanan CRITICAL. Pipeline dihentikan sebelum DONE.');
                }
             }
             console.log(chalk.green('✅ [Milestone] SECURE Lulus! Tidak ada isu keamanan kritikal.'));
          } catch (e: any) {
             if (e.message.includes('CRITICAL')) throw e;
             console.log(chalk.yellow(`[Milestone] Peringatan saat menjalankan Swarm: ${e.message}`));
          }
          
          this.state = 'DONE';
          break;
      }
    }
    
    console.log(chalk.green.bold('\n🚀 [Milestone] DONE: Pipeline selesai sepenuhnya.'));
    return true;
  }
}
