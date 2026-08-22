import { ProjectProfile } from './profile';
import { executeAction } from '../agent_loop/agentLoop';

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
    console.log(`[Milestone] Memulai pipeline untuk profil: ${this.context.profile.id}`);
    
    // Skeleton State Machine
    while (this.state !== 'DONE') {
      switch (this.state) {
        case 'INIT':
          console.log('[Milestone] INIT: Validasi lingkungan');
          // Validasi direktori kosong, dll
          this.state = 'SCAFFOLD';
          break;
          
        case 'SCAFFOLD':
          console.log('[Milestone] SCAFFOLD: Menjalankan skrip inisialisasi');
          for (const cmd of this.context.profile.scaffold) {
            console.log(`> ${cmd}`);
            // await executeAction(...) in real integration
          }
          this.state = 'IMPLEMENT';
          break;
          
        case 'IMPLEMENT':
          console.log('[Milestone] IMPLEMENT: Menjalankan agent loop untuk implementasi fitur');
          // Disini Agent Loop dipanggil dengan role 'integrator' / 'backend' / 'frontend'
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
