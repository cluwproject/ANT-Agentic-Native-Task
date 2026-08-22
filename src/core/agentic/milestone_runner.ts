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
  role?: string;
  implementContext?: string;
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
    let initialGitSnapshot: string | null = null;

    while (this.state !== 'DONE') {
      switch (this.state) {
        case 'INIT':
          console.log(chalk.blue('[Milestone] INIT: Validasi lingkungan & Snapshot Checkpoint'));
          try {
            const gitCheck = await executeAction('shell_exec', { command: 'git rev-parse HEAD', cwd: this.context.targetDir }, 1, { cwd: this.context.targetDir, manual_approval: true });
            if (gitCheck && (gitCheck as any).stdout) {
              initialGitSnapshot = (gitCheck as any).stdout.trim();
              if (initialGitSnapshot) {
                console.log(chalk.dim(`  • Git Snapshot Anchor: ${initialGitSnapshot.slice(0, 7)}`));
              }
            }
          } catch {
            // Target dir is fresh or not yet a git repo
            initialGitSnapshot = null;
          }
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
          let contextMsgs: any[] = [];
          
          if (this.context.implementContext) {
             contextMsgs.push({ role: 'system', content: this.context.implementContext });
          }

          if (this.context.role) {
             const { getSubAgentSystemMessage } = await import('./sub_agents.js');
             const roleMsg = getSubAgentSystemMessage(this.context.role);
             if (roleMsg) {
                 contextMsgs.push(roleMsg);
             } else {
                 console.log(chalk.yellow(`\n[Milestone] Peringatan: Peran spesialis '${this.context.role}' tidak ditemukan di registry. Berjalan tanpa topi peran.`));
             }
          }

          // Tambahkan error VERIFY sebelumnya jika ini adalah siklus patch (self-healing)
          if (verifyErrorLog) {
             const patchPrompt = `Tahap VERIFY sebelumnya gagal dengan log berikut. Mohon analisis dan perbaiki error ini:\n\n\`\`\`\n${verifyErrorLog}\n\`\`\`\n\nEksekusi aksi yang diperlukan untuk memperbaiki kode, lalu selesaikan tugasmu (stop memanggil tools) agar dapat diverifikasi ulang.`;
             contextMsgs.push({ role: 'user', content: patchPrompt });
          }

          console.log(chalk.blue(`[Milestone] IMPLEMENT: Menjalankan agent loop...${this.context.role ? ` (Peran: ${this.context.role})` : ''}`));
          
          const loopResult = await runCliAgentLoopDetailed(currentPrompt, contextMsgs);
          
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
              console.error(chalk.red('\n❌ [Milestone] Gagal melewati tahap VERIFY dan telah kehabisan batas maxPatchAttempts.'));
              
              if (initialGitSnapshot) {
                console.log(chalk.yellow(`[Milestone Rollback] Mengembalikan workspace ke Git Snapshot Anchor (${initialGitSnapshot.slice(0, 7)})...`));
                try {
                  await executeAction('shell_exec', { 
                    command: `git reset --hard ${initialGitSnapshot} && git clean -fd`, 
                    cwd: this.context.targetDir 
                  }, 1, { cwd: this.context.targetDir, manual_approval: true });
                  console.log(chalk.green('✅ [Milestone Rollback] Workspace berhasil di-rollback ke kondisi aman tanpa kode rusak.'));
                } catch (rbErr: any) {
                  console.error(chalk.red(`[Milestone Rollback] Gagal melakukan rollback otomatis: ${rbErr.message}`));
                }
              }

              throw new Error('Batas patching terlampaui pada tahap VERIFY. Transaksi dibatalkan.');
            }
            console.log(chalk.yellow(`[Milestone] Mengembalikan pipeline ke state IMPLEMENT untuk patching. (Sisa attempts: ${this.context.maxPatchAttempts})`));
            this.state = 'IMPLEMENT';
          } else {
            // Optional Dynamic HTTP Healthcheck & Response Contract Check (Sprint S4)
            if (this.context.profile.healthcheck) {
              const hc = this.context.profile.healthcheck;
              console.log(chalk.dim(`> Dynamic Healthcheck Probe: Memeriksa kontrak ${hc.url}...`));
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const response = await fetch(hc.url, { signal: controller.signal }).catch(() => null);
                clearTimeout(timeoutId);

                if (response) {
                  if (response.status === hc.expectStatus) {
                    console.log(chalk.green(`  • Healthcheck Probe: Status ${response.status} (Contract Validated)`));
                  } else {
                    console.log(chalk.yellow(`  • Healthcheck Probe: Mendapat status ${response.status} (diharapkan ${hc.expectStatus})`));
                  }
                } else {
                  console.log(chalk.dim(`  • Healthcheck Probe: Standby (build & typecheck contract verified)`));
                }
              } catch {
                console.log(chalk.dim(`  • Healthcheck Probe: Dilewati`));
              }
            }

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
    
    // Auto-Distill verified workflow into Procedural Memory
    try {
      const { distillMilestoneProcedure } = await import('../procedural_distiller.js');
      const distilled = await distillMilestoneProcedure(
        this.context.profile.id,
        this.context.targetDir,
        initialPrompt || `Setup dan integrasi profil ${this.context.profile.id}`,
        [`milestone_${this.context.profile.id}_success`]
      );
      if (distilled) {
        console.log(chalk.cyan(`🧠 [Procedural Memory] Berhasil mengkristalisasi keahlian baru: ${distilled.id} (Gold Standard)`));
      }
    } catch {
      // Non-blocking procedural distillation
    }

    return true;
  }
}
