import os from 'os';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Logger } from '../../../utils/logger.js';
import { vaultDiagnose } from '../../memory/sqlite_vault.js';
import { DEFAULT_ALLOWED_PREFIXES, DENIED_PATTERNS } from '../../agent_loop/allowlist.js';

export async function runDoctor(args: string[] = []): Promise<boolean> {
  console.log(`\n🩺 \x1b[1mANT Doctor — Health Check v0.3.5\x1b[0m`);
  console.log(`══════════════════════════════════════\n`);

  let passed = 0;
  let total = 7;
  let hasCriticalFailure = false;

  const check = (status: boolean, msg: string, critical = false) => {
    if (status) {
      console.log(`✅ \x1b[32m${msg}\x1b[0m`);
      passed++;
    } else {
      console.log(`${critical ? '❌' : '⚠️'}  \x1b[${critical ? '31' : '33'}m${msg}\x1b[0m`);
      if (critical) hasCriticalFailure = true;
    }
  };

  // 1. Node.js Version Check
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
  check(major >= 22, `Node.js        : ${nodeVersion} (>= v22 required for node:sqlite)`, true);

  // 2. TypeScript Check
  try {
    const tscPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsc');
    const tscCmd = fs.existsSync(tscPath) ? tscPath : 'tsc';
    const tscOutput = execSync(`${tscCmd} --version`, { stdio: 'pipe' }).toString().trim();
    check(true, `TypeScript     : ${tscOutput}`);
  } catch {
    check(false, `TypeScript     : 'tsc' not found in path`, true);
  }

  // 3. .env Check
  try {
    dotenv.config();
    const envKeys = Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('AI_') || k.includes('MODEL'));
    const missingKeys = [];
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
       missingKeys.push('NO PRIMARY LLM API KEY FOUND');
    }
    if (missingKeys.length === 0) {
      check(true, `.env           : Loaded (${envKeys.length} relevant keys found)`);
    } else {
      check(false, `.env           : Missing keys - ${missingKeys.join(', ')}`, true);
    }
  } catch (e: any) {
    check(false, `.env           : Failed to load - ${e.message}`, true);
  }

  // 4. Provider Reachability (Simple Fetch)
  try {
    let url = '';
    let auth = '';
    let name = '';
    
    if (process.env.OPENROUTER_API_KEY || (process.env.AI_PROVIDER === 'openai' && process.env.OPENAI_BASE_URL?.includes('openrouter'))) {
      url = 'https://openrouter.ai/api/v1/models';
      auth = `Bearer ${process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY}`;
      name = 'OpenRouter';
    } else if (process.env.GEMINI_API_KEY) {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
      name = 'Gemini';
    } else if (process.env.OPENAI_API_KEY) {
       url = 'https://api.openai.com/v1/models';
       auth = `Bearer ${process.env.OPENAI_API_KEY}`;
       name = 'OpenAI';
    }

    if (url) {
       const headers: any = {};
       if (auth) headers['Authorization'] = auth;
       const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
       if (res.ok) {
           check(true, `API Access     : ${name} is reachable (HTTP 200)`);
       } else {
           check(false, `API Access     : ${name} returned HTTP ${res.status}`);
       }
    } else {
       check(false, `API Access     : No provider configured to ping`);
    }
  } catch (e: any) {
    check(false, `API Access     : Ping failed - ${e.message}`);
  }

  // 5. SQLite Vault Check
  try {
    const diag = await vaultDiagnose();
    check(diag.walMode, `SQLite Vault   : ${path.basename(diag.path)} — ${diag.totalRows} rows (${diag.dbSizeKb} KB)`, true);
  } catch (e: any) {
    check(false, `SQLite Vault   : Error - ${e.message}`, true);
  }

  // 6. Allowlist Check
  try {
    check(true, `Allowlist      : ${DEFAULT_ALLOWED_PREFIXES.length} safe prefixes, ${DENIED_PATTERNS.length} deny patterns`);
  } catch (e: any) {
    check(false, `Allowlist      : Failed to load - ${e.message}`, true);
  }

  // 7. Git Status Check
  try {
    const gitStatus = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
    if (gitStatus === '') {
      check(true, `Git            : clean (branch: ${gitBranch})`);
    } else {
      const changed = gitStatus.split('\\n').length;
      check(false, `Git            : ${changed} uncommitted changes (branch: ${gitBranch})`);
    }
  } catch {
    check(false, `Git            : Repository not found or git not installed`);
  }

  console.log(`\nScore: ${passed}/${total} passed.`);
  
  if (hasCriticalFailure) {
    console.log(`\x1b[31mStatus: OFFLINE. ANT requires critical fixes to boot safely.\x1b[0m\n`);
    return false;
  } else if (passed < total) {
    console.log(`\x1b[33mStatus: DEGRADED. ANT is ready but with warnings.\x1b[0m\n`);
    return true;
  } else {
    console.log(`\x1b[32mStatus: READY. All systems operational.\x1b[0m\n`);
    return true;
  }
}
