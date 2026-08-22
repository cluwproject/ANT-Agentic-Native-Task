import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface HealthcheckSpec {
  url: string;
  expectStatus: number;
}

export interface DeploySpec {
  type: 'vercel' | 'docker' | 'custom';
  steps: string[];
}

export interface ProjectProfile {
  id: string;
  scaffold: string[];
  install: string[];
  dev: string;
  test: string;
  healthcheck?: HealthcheckSpec;
  allowedShellPrefixes: string[];
  paths: Record<string, string>;
  deploy?: DeploySpec;
}

export function loadProfile(profileId: string, workspaceRoot: string = process.cwd()): ProjectProfile | null {
  const profilePath = join(workspaceRoot, 'src', 'core', 'agentic', 'profiles', `${profileId}.json`);
  if (!existsSync(profilePath)) {
    return null;
  }
  
  try {
    const raw = readFileSync(profilePath, 'utf8');
    const profile = JSON.parse(raw) as ProjectProfile;
    return profile;
  } catch (error) {
    console.error(`Gagal memuat profil ${profileId}:`, error);
    return null;
  }
}
