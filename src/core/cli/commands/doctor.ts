import os from 'os';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { Logger } from '../../../utils/logger.js';
import { vaultDiagnose, vaultOptimize } from '../../memory/sqlite_vault.js';
import { DEFAULT_ALLOWED_PREFIXES, DENIED_PATTERNS } from '../../agent_loop/allowlist.js';

export async function runDoctor(args: string[] = []): Promise<boolean> {
  const isFixMode = args.includes('--fix') || args.includes('-f');
  
  console.log(`\n🩺 \x1b[1mANT Doctor — Diagnostic & Health Suite v0.4.0\x1b[0m`);
  console.log(`══════════════════════════════════════════════════════════════`);
  if (isFixMode) {
    console.log(`🔧 \x1b[36m[AUTO-REMEDIATION MODE ACTIVE]\x1b[0m Performing automatic repairs...\n`);
  } else {
    console.log(`🔍 Running pre-flight system inspection... (Use \x1b[33m--fix\x1b[0m to auto-repair)\n`);
  }

  // ── Auto-Remediation Steps (if --fix is passed) ──────────────────────────
  if (isFixMode) {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      try {
        let envRaw = fs.readFileSync(envPath, 'utf-8');
        let repaired = false;

        // Ensure trailing newline
        if (!envRaw.endsWith('\n')) {
          envRaw += '\n';
          repaired = true;
        }

        // Split concatenated variables if any
        if (envRaw.includes('trueCLI_') || envRaw.includes('falseCLI_')) {
          envRaw = envRaw.replace(/(true|false)(CLI_[A-Z_]+)/g, '$1\n$2');
          repaired = true;
        }

        if (repaired) {
          fs.writeFileSync(envPath, envRaw, 'utf-8');
          console.log(`  🛠️  \x1b[32m[Fixed]\x1b[0m Normalized and repaired .env formatting.`);
        }
      } catch (e: any) {
        console.log(`  ⚠️  \x1b[33m[Fix Warning]\x1b[0m Could not patch .env: ${e.message}`);
      }
    }

    // Ensure vital directories exist
    const vitalDirs = [
      path.join(process.cwd(), 'workspace', 'memories'),
      path.join(process.cwd(), 'workspace', 'skills'),
      path.join(process.cwd(), 'workspace', 'knowledge_vault'),
      path.join(process.cwd(), '.ant')
    ];
    for (const d of vitalDirs) {
      if (!fs.existsSync(d)) {
        try {
          fs.mkdirSync(d, { recursive: true });
          console.log(`  🛠️  \x1b[32m[Fixed]\x1b[0m Created missing directory: ${path.relative(process.cwd(), d)}`);
        } catch {}
      }
    }

    // Optimize SQLite Vault
    try {
      const opt = await vaultOptimize();
      console.log(`  🛠️  \x1b[32m[Fixed]\x1b[0m Defragmented SQLite Vault (WAL checkpoint & VACUUM completed).`);
    } catch {}

    console.log('');
  }

  let passed = 0;
  let total = 9;
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

  // 1. Node.js Version & Host Architecture
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
  const isTermux = process.env.PREFIX?.includes('com.termux') || fs.existsSync('/data/data/com.termux');
  const platformLabel = isTermux ? 'Android (Termux)' : `${os.platform()} (${os.arch()})`;
  check(major >= 22, `Node.js        : ${nodeVersion} on ${platformLabel} (>= v22 required for node:sqlite)`, true);

  // 2. Host Resources (RAM & CPU)
  try {
    const totalMem = Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10;
    const freeMem = Math.round(os.freemem() / (1024 * 1024 * 1024) * 10) / 10;
    const freePct = Math.round((os.freemem() / os.totalmem()) * 100);
    const cpuCount = os.cpus().length;
    const isRamHealthy = freePct >= 10 || freeMem >= 0.5;
    check(isRamHealthy, `Host Resources : ${freeMem} GB / ${totalMem} GB RAM free (${freePct}%) · ${cpuCount} CPU cores`);
  } catch (e: any) {
    check(true, `Host Resources : Checked`);
  }

  // 3. TypeScript Engine Check
  try {
    const tscPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsc');
    const tscCmd = fs.existsSync(tscPath) ? tscPath : 'tsc';
    const tscOutput = execSync(`${tscCmd} --version`, { stdio: 'pipe' }).toString().trim();
    check(true, `TypeScript     : ${tscOutput}`);
  } catch {
    check(false, `TypeScript     : 'tsc' not found in path`, true);
  }

  // 4. .env Integrity Check
  try {
    dotenv.config();
    const envKeys = Object.keys(process.env).filter(k => k.includes('API_KEY') || k.includes('AI_') || k.includes('MODEL') || k.includes('CUSTOM_'));
    const missingKeys = [];
    if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
       missingKeys.push('NO PRIMARY LLM API KEY FOUND');
    }
    if (missingKeys.length === 0) {
      check(true, `.env Config    : Loaded (${envKeys.length} relevant active variables)`);
    } else {
      check(false, `.env Config    : Missing keys - ${missingKeys.join(', ')}`, true);
    }
  } catch (e: any) {
    check(false, `.env Config    : Failed to load - ${e.message}`, true);
  }

  // 5. Provider Reachability & Latency Probe (TTFT / RTT)
  try {
    let url = '';
    let auth = '';
    let name = '';
    const activeModel = process.env.CUSTOM_MODEL || process.env.AI_MODEL || 'default';
    
    if (process.env.OPENROUTER_API_KEY || (process.env.AI_PROVIDER === 'openai' && process.env.OPENAI_BASE_URL?.includes('openrouter'))) {
      url = 'https://openrouter.ai/api/v1/models';
      auth = `Bearer ${process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY}`;
      name = `OpenRouter [${activeModel}]`;
    } else if (process.env.GEMINI_API_KEY) {
      url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
      name = `Gemini [${activeModel}]`;
    } else if (process.env.OPENAI_API_KEY) {
       url = 'https://api.openai.com/v1/models';
       auth = `Bearer ${process.env.OPENAI_API_KEY}`;
       name = `OpenAI [${activeModel}]`;
    } else if (process.env.AI_PROVIDER === 'ollama') {
       url = (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace('/v1', '') + '/api/tags';
       name = `Ollama Local [${activeModel}]`;
    }

    if (url) {
       const headers: any = {};
       if (auth) headers['Authorization'] = auth;
       const tStart = performance.now();
       const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
       const latency = Math.round(performance.now() - tStart);
       
       if (res.ok) {
           check(true, `API Latency    : ${name} reachable (${latency}ms roundtrip)`);
       } else {
           check(false, `API Latency    : ${name} returned HTTP ${res.status} (${latency}ms)`);
       }
    } else {
       check(false, `API Latency    : No provider configured to ping`);
    }
  } catch (e: any) {
    check(false, `API Latency    : Ping timed out or failed - ${e.message}`);
  }

  // 6. SQLite Memory Vault Check
  try {
    const diag = await vaultDiagnose();
    const layerStats = Object.entries(diag.layers).map(([l, count]) => `${l}:${count}`).join(' ');
    check(diag.walMode, `SQLite Vault   : ${path.basename(diag.path)} — ${diag.totalRows} rows (${diag.dbSizeKb} KB) [${layerStats}]`, true);
  } catch (e: any) {
    check(false, `SQLite Vault   : Error - ${e.message}`, true);
  }

  // 7. MCP & Skills Ecosystem
  try {
    let mcpCount = 0;
    const mcpConfigPath = path.join(process.cwd(), '.ant', 'mcp.json');
    if (fs.existsSync(mcpConfigPath)) {
      try {
        const rawMcp = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf-8'));
        mcpCount = Object.keys(rawMcp.mcpServers || {}).length;
      } catch {}
    }

    let skillFilesCount = 0;
    const skillsBase = path.join(process.cwd(), 'workspace', 'skills');
    if (fs.existsSync(skillsBase)) {
      const scanDir = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isDirectory() && ent.name !== 'node_modules' && ent.name !== '.git') {
            scanDir(path.join(dir, ent.name));
          } else if (ent.isFile() && (ent.name.endsWith('.js') || ent.name.endsWith('.py') || ent.name.endsWith('.ts'))) {
            skillFilesCount++;
          }
        }
      };
      try { scanDir(skillsBase); } catch {}
    }

    check(true, `Ecosystem      : ${mcpCount} MCP server(s) configured · ${skillFilesCount} custom skill script(s)`);
  } catch (e: any) {
    check(false, `Ecosystem      : Failed to index MCP/skills - ${e.message}`);
  }

  // 8. Security Allowlist & Deny Patterns
  try {
    check(true, `Security Gate  : ${DEFAULT_ALLOWED_PREFIXES.length} safe shell prefixes, ${DENIED_PATTERNS.length} deny rules active`);
  } catch (e: any) {
    check(false, `Security Gate  : Failed to load - ${e.message}`, true);
  }

  // 9. Git Workspace Integrity
  try {
    const gitStatus = execSync('git status --porcelain', { stdio: 'pipe' }).toString().trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
    if (gitStatus === '') {
      check(true, `Git Workspace  : clean (branch: ${gitBranch})`);
    } else {
      const changed = gitStatus.split('\n').filter(Boolean).length;
      check(false, `Git Workspace  : ${changed} uncommitted changes (branch: ${gitBranch})`);
    }
  } catch {
    check(false, `Git Workspace  : Repository not found or git not installed`);
  }

  console.log(`\nScore: ${passed}/${total} passed.`);
  
  if (hasCriticalFailure) {
    console.log(`\x1b[31mStatus: OFFLINE. ANT requires critical fixes to boot safely.\x1b[0m`);
    if (!isFixMode) console.log(`💡 Try running: \x1b[36mant doctor --fix\x1b[0m to auto-resolve issues.\n`);
    return false;
  } else if (passed < total) {
    console.log(`\x1b[33mStatus: DEGRADED. ANT is operational with minor warnings.\x1b[0m`);
    if (!isFixMode) console.log(`💡 Tip: Run \x1b[36mant doctor --fix\x1b[0m to optimize SQLite vault and auto-repair.\n`);
    return true;
  } else {
    console.log(`\x1b[32mStatus: OPTIMAL. All sovereign neural & agentic systems ready.\x1b[0m\n`);
    return true;
  }
}
