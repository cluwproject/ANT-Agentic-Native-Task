import { ProjectProfile } from './profile.js';
import { executeAction } from '../actions/index.js';
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
    
    // Skeleton State Machine
    while (this.state !== 'DONE') {
      switch (this.state) {
        case 'INIT':
          console.log(chalk.blue('[Milestone] INIT: Validasi lingkungan'));
          // Validasi direktori kosong, dll
          this.state = 'SCAFFOLD';
          break;
          
        case 'SCAFFOLD':
          console.log(chalk.blue('[Milestone] SCAFFOLD: Menjalankan skrip inisialisasi'));
          for (const cmd of this.context.profile.scaffold) {
            console.log(chalk.dim(`> ${cmd}`));
            const result = await executeAction('shell_exec', { command: cmd, cwd: this.context.targetDir }, 1, { cwd: this.context.targetDir });
            if (result && result.status === 'error') {
               console.error(chalk.red(`[Milestone] Error saat SCAFFOLD: ${result.stderr || result.error}`));
               throw new Error(`Scaffold gagal pada perintah: ${cmd}`);
            }
          }
          this.state = 'IMPLEMENT';
          break;
          
        case 'IMPLEMENT':
          console.log(chalk.blue('[Milestone] IMPLEMENT: Menjalankan agent loop untuk implementasi fitur'));
          // Placeholder for real agent loop
          this.state = 'VERIFY';
          break;
          
        case 'VERIFY':
          console.log('[Milestone] VERIFY: Mengevaluasi kriteria kelulusan (Tests & Healthcheck)');
          // 1. npm test
          // 2. healthcheck (http check)
          // Jika gagal, state bisa kembali ke IMPLEMENT (patch loop) dengan decrement maxPatchAttempts
          this.state = 'SECURE';
          break;
          
        case 'SECURE':
          console.log('[Milestone] SECURE: Menjalankan Swarm Audit (Gray Units)');
          // Memanggil Swarm orchestrator, jika CRITICAL > 0, lempar error atau minta approval
          this.state = 'DONE';
          break;
      }
    }
    
    console.log('[Milestone] DONE: Pipeline selesai.');
    return true;
  }
}
