/**
 * ════════════════════════════════════════════════════════════════════
 * ANT-CYBER-CORPS — SOVEREIGN SWARM ORCHESTRATOR
 * ════════════════════════════════════════════════════════════════════
 * Mengkoordinasikan 5 pasukan Gray Unit (0.5B sub-agents) secara
 * paralel untuk mengaudit sistem. Setiap unit bekerja terisolasi
 * pada domain spesialisasinya dan melaporkan Finding Cards ke
 * CockroachDB Evidence Ledger.
 * ════════════════════════════════════════════════════════════════════
 */

import chalk from 'chalk';
import path from 'path';
import ora from 'ora';
import { Logger } from '../../utils/logger.js';
import { chat } from '../ai/index.js';
import { GRAY_UNIT_PROMPTS } from './gray_prompts.js';

export function parseFindingCardText(text: string, unit: GrayUnit, mission_id: string, target_file: string): FindingCard[] {
    const findings: FindingCard[] = [];
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let currentCard: Partial<FindingCard> & { currentKey?: string } = {};
    
    for (const line of lines) {
        if (line.startsWith('TEMUAN:')) {
            if (currentCard.threat_type) {
                // Save previous card before starting new one
                findings.push(currentCard as FindingCard);
            }
            currentCard = {
                unit: unit.id,
                mission_id,
                target_file,
                threat_type: line.replace('TEMUAN:', '').trim(),
                risk_level: 'MEDIUM', // default
            };
            currentCard.currentKey = 'TEMUAN';
        } else if (line.startsWith('SEVERITY:')) {
            const sev = line.replace('SEVERITY:', '').trim().toUpperCase();
            if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(sev)) {
                currentCard.risk_level = sev as any;
            }
            currentCard.currentKey = 'SEVERITY';
        } else if (line.startsWith('FIX:') || line.startsWith('ACTION:')) {
            currentCard.suggested_patch = line.replace(/^(FIX|ACTION):/, '').trim();
            currentCard.action_decision = '[PERBAIKI]';
            currentCard.currentKey = 'FIX';
        } else if (line.startsWith('LOCATION:') || line.startsWith('PAYLOAD:') || line.startsWith('ATTACK:') || line.startsWith('PACKAGE:')) {
            // Kita bisa map detail ini ke ujung threat_type atau simpan di field tambahan kalau ada
            // Untuk v1, kita append ke threat_type agar terlihat di UI CLI
            currentCard.threat_type += ' | ' + line;
            currentCard.currentKey = 'DETAIL';
        } else if (line.startsWith('EVIDENCE:')) {
            currentCard.currentKey = 'EVIDENCE';
        } else if (currentCard.currentKey) {
            // Append multi-line values
            if (currentCard.currentKey === 'FIX' && currentCard.suggested_patch) {
                currentCard.suggested_patch += '\n' + line;
            } else if (currentCard.currentKey === 'TEMUAN' && currentCard.threat_type) {
                currentCard.threat_type += '\n' + line;
            }
        }
    }
    
    // Save the last card
    if (currentCard.threat_type) {
        if (!currentCard.action_decision) currentCard.action_decision = '[PERBAIKI]';
        findings.push(currentCard as FindingCard);
    }
    
    return findings;
}

export interface GrayUnit {
    id: 'gray-1' | 'gray-2' | 'gray-3' | 'gray-4' | 'gray-5';
    name: string;
    domain: string;
    model: string;
    threatTypes: string[];
}

export interface FindingCard {
    unit: string;
    mission_id: string;
    target_file: string;
    threat_type: string;
    evidence_sha256?: string;
    risk_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';
    action_decision: '[PERBAIKI]' | '[ABAIKAN]' | '[PANTAU]';
    suggested_patch?: string;
    timestamp: string;
}

export interface SwarmMissionResult {
    mission_id: string;
    completed_units: number;
    total_units: number;
    findings: FindingCard[];
    duration_ms: number;
}

export function getGrayUnits(): GrayUnit[] {
    return [
        {
            id: 'gray-1',
            name: 'ANT-GRAY-1 (Memory & Logic Guardian)',
            domain: 'Buffer Overflow, Memory Leaks, Race Conditions, ReDoS',
            model: process.env.ANT_GRAY_1_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:1.5b',
            threatTypes: ['BUFFER_OVERFLOW', 'MEMORY_LEAK', 'RACE_CONDITION', 'REDOS']
        },
        {
            id: 'gray-2',
            name: 'ANT-GRAY-2 (Injection Sifter)',
            domain: 'SQLi, XSS, Command Injection, Path Traversal',
            model: process.env.ANT_GRAY_2_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:1.5b',
            threatTypes: ['SQL_INJECTION', 'XSS', 'COMMAND_INJECTION', 'PATH_TRAVERSAL']
        },
        {
            id: 'gray-3',
            name: 'ANT-GRAY-3 (Auth & Identity Architect)',
            domain: 'IDOR, JWT Flaws, Broken Auth, Privilege Escalation',
            model: process.env.ANT_GRAY_3_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:1.5b',
            threatTypes: ['IDOR', 'JWT_FLAW', 'BROKEN_AUTH']
        },
        {
            id: 'gray-4',
            name: 'ANT-GRAY-4 (Supply Chain Sentinel)',
            domain: 'CVE Dependencies, Typosquatting, Malicious Scripts',
            model: process.env.ANT_GRAY_4_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:1.5b',
            threatTypes: ['VULN_DEPENDENCY', 'SUSPICIOUS_SCRIPT']
        },
        {
            id: 'gray-5',
            name: 'ANT-GRAY-5 (Cloud & Config Auditor)',
            domain: 'Exposed Secrets, IAM Misconfig, Cloud Leaks',
            model: process.env.ANT_GRAY_5_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:1.5b',
            threatTypes: ['HARDCODED_SECRET', 'IAM_MISCONFIG', 'CLOUD_MISCONFIG']
        }
    ];
}

// ── File Size Guard (Lindungi SLM dari file raksasa) ───────────────
// Nilai dapat dikonfigurasi via .env: ANT_SLM_MAX_FILE_KB dan ANT_SLM_MAX_FILES_PER_UNIT
const SLM_MAX_FILE_BYTES = Math.min(
    parseInt(process.env.ANT_SLM_MAX_FILE_KB || '24', 10) * 1024,
    64 * 1024  // Hard ceiling: tidak boleh > 64KB apapun yang di-.env untuk keamanan Termux
);
const SLM_MAX_FILES_PER_UNIT = Math.min(
    parseInt(process.env.ANT_SLM_MAX_FILES_PER_UNIT || '8', 10),
    15  // Hard ceiling: maks 15 file per unit
);

export function guardFileForSLM(filePath: string, fileSizeBytes: number): {
    allowed: boolean;
    reason?: string;
} {
    if (fileSizeBytes > SLM_MAX_FILE_BYTES) {
        return {
            allowed: false,
            reason: `File terlalu besar untuk SLM (${Math.round(fileSizeBytes / 1024)}KB > ${SLM_MAX_FILE_BYTES / 1024}KB). Delegasi ke Commander (LLM) diperlukan.`
        };
    }
    const ext = path.extname(filePath).toLowerCase();
    const blockedExtensions = ['.min.js', '.bundle.js', '.map', '.lock', '.jsonl'];
    if (blockedExtensions.some(b => filePath.endsWith(b))) {
        return {
            allowed: false,
            reason: `Tipe file tidak cocok untuk analisis SLM (${ext}).`
        };
    }
    return { allowed: true };
}

// ── Blackboard / Mission State (file-based, lock-free) ─────────────
export interface MissionBlackboard {
    mission_id: string;
    goal: string;
    target_paths: string[];
    assigned_units: Record<string, 'pending' | 'running' | 'done' | 'failed'>;
    findings: FindingCard[];
    created_at: string;
    completed_at?: string;
}

import fs from 'fs/promises';

const BLACKBOARD_DIR = path.join(process.cwd(), 'workspace', 'missions');

export async function createMission(goal: string, targetPaths: string[]): Promise<MissionBlackboard> {
    await fs.mkdir(BLACKBOARD_DIR, { recursive: true });
    const mission_id = `mission-${Date.now()}`;
    const blackboard: MissionBlackboard = {
        mission_id,
        goal,
        target_paths: targetPaths,
        assigned_units: {
            'gray-1': 'pending',
            'gray-2': 'pending',
            'gray-3': 'pending',
            'gray-4': 'pending',
            'gray-5': 'pending'
        },
        findings: [],
        created_at: new Date().toISOString()
    };
    await fs.writeFile(
        path.join(BLACKBOARD_DIR, `${mission_id}.json`),
        JSON.stringify(blackboard, null, 2)
    );
    Logger.log('INFO', `Mission created: ${mission_id} — ${goal}`, { targetPaths }, 'SWARM');
    return blackboard;
}

export async function updateMissionUnit(
    mission_id: string,
    unit_id: string,
    status: 'running' | 'done' | 'failed',
    findings: FindingCard[] = []
): Promise<void> {
    const filePath = path.join(BLACKBOARD_DIR, `${mission_id}.json`);
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const board: MissionBlackboard = JSON.parse(raw);
        board.assigned_units[unit_id] = status;
        if (findings.length > 0) {
            board.findings.push(...findings);
        }
        const allDone = Object.values(board.assigned_units).every(s => s === 'done' || s === 'failed');
        if (allDone) board.completed_at = new Date().toISOString();
        await fs.writeFile(filePath, JSON.stringify(board, null, 2));
    } catch (e: any) {
        Logger.log('ERROR', `Failed to update mission blackboard: ${e.message}`, { mission_id, unit_id }, 'SWARM');
    }
}

// ── Model Audit Runner (memanggil LLM/SLM) ───────────────────────────────────
// ── Model Audit Runner (memanggil LLM/SLM) ───────────────────────────────────
async function runModelAudit(
    unit: GrayUnit,
    targetPaths: string[],
    mission_id: string,
    brain: any,
    spinner?: any
): Promise<FindingCard[]> {
    const findings: FindingCard[] = [];
    const importedPath = await import('path');
    const importedFs = await import('fs/promises');
    
    let filesInspected = 0;
    
    for (const targetPath of targetPaths) {
        if (filesInspected >= SLM_MAX_FILES_PER_UNIT) break;
        try {
            const stat = await importedFs.default.stat(targetPath).catch(() => null);
            if (!stat) continue;
            
            let filesToScan: string[] = [];
            if (stat.isDirectory()) {
                const files = await importedFs.default.readdir(targetPath);
                filesToScan = files
                    .filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json') || f.endsWith('.yml'))
                    .map(f => importedPath.default.join(targetPath, f))
                    .slice(0, SLM_MAX_FILES_PER_UNIT);
            } else {
                filesToScan = [targetPath];
            }
            
            for (const filePath of filesToScan) {
                if (filesInspected >= SLM_MAX_FILES_PER_UNIT) break;
                const fileStat = await importedFs.default.stat(filePath).catch(() => null);
                if (!fileStat) continue;
                
                // SLM File Size Guard
                const guard = guardFileForSLM(filePath, fileStat.size);
                if (!guard.allowed) {
                    Logger.log('WARN', `[${unit.id}] Skipping large file: ${filePath}. ${guard.reason}`, {}, 'SWARM');
                    continue;
                }
                
                const content = await importedFs.default.readFile(filePath, 'utf-8');
                filesInspected++;
                
                if (spinner) {
                    spinner.text = `[${unit.id.toUpperCase()}] ${unit.name} — Mengaudit file ${filesInspected}/${SLM_MAX_FILES_PER_UNIT} (${importedPath.default.basename(filePath)})...`;
                }
                
                try {
                    const systemPrompt = GRAY_UNIT_PROMPTS[unit.id] || "Tugasmu mencari celah keamanan.";
                    const messages = [{ role: 'user', content: `Periksa file ini:\n\n${content}` }];
                    
                    const responseText = await chat(
                        brain,
                        messages,
                        [],
                        {},
                        systemPrompt,
                        unit.model,
                        `Swarm:${unit.id}`
                    );
                    
                    const parsedFindings = parseFindingCardText(responseText.content, unit, mission_id, filePath);
                    findings.push(...parsedFindings);
                    
                } catch (e: any) {
                    Logger.log('WARN', `[${unit.id}] Model inference failed for ${filePath}, falling back to static regex. Error: ${e.message}`, {}, 'SWARM');
                    throw e; // Lemparkan error agar trigger fallback unit-level di orchestrator
                }
            }
        } catch (e: any) {
            // Ignore file read errors
        }
    }
    
    return findings;
}

// ── Static Audit Runner (tanpa API model — analisis berbasis regex rules) ──
async function runStaticAudit(
    unit: GrayUnit,
    targetPaths: string[],
    mission_id: string
): Promise<FindingCard[]> {
    const findings: FindingCard[] = [];
    const importedPath = await import('path');
    const importedFs = await import('fs/promises');

    const OSINT_PATTERNS: Record<string, RegExp> = {
        // GRAY-2: OSINT Profiling (Looking for hardcoded emails or usernames)
        BLIND_USERNAME: /const\s+targetUser\s*=\s*|username\s*:\s*['"][^'"]+['"]/gi,
        SOSMED_LINKAGE: /(tiktok\.com|twitter\.com|instagram\.com|github\.com)\/[a-zA-Z0-9_]+/gi,
        
        // GRAY-3: Email Intel (Looking for leaked emails or gravatar links)
        BREACHED_EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        HIDDEN_GRAVATAR: /gravatar\.com\/avatar\/[a-f0-9]{32}/gi,
        
        // GRAY-4: Infra
        OPEN_PORTS: /port\s*:\s*[0-9]{2,5}|listen\([0-9]{2,5}\)/gi,
        EXPOSED_DNS: /(dns\.resolveMx|resolveTxt)/g,
        
        // GRAY-5: Dark Web
        TOR_LEAK: /[a-z2-7]{16,56}\.onion/gi,
        ONION_MARKET_MENTION: /darknet|silkroad|alphabay|hidden service/gi,
        
        // GRAY-1: Legacy Memory/Logic (Still checking code issues)
        BUFFER_OVERFLOW: /Buffer\.allocUnsafe|new Buffer\(/g,
        MEMORY_LEAK: /process\.env\.(API_KEY|SECRET|PASSWORD|TOKEN)/g
    };

    const RISK_MAP: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
        BLIND_USERNAME: 'MEDIUM',
        SOSMED_LINKAGE: 'HIGH',
        BREACHED_EMAIL: 'CRITICAL',
        HIDDEN_GRAVATAR: 'MEDIUM',
        OPEN_PORTS: 'HIGH',
        EXPOSED_DNS: 'LOW',
        TOR_LEAK: 'CRITICAL',
        ONION_MARKET_MENTION: 'CRITICAL',
        BUFFER_OVERFLOW: 'HIGH',
        MEMORY_LEAK: 'CRITICAL'
    };

    let filesInspected = 0;

    for (const targetPath of targetPaths) {
        if (filesInspected >= SLM_MAX_FILES_PER_UNIT) break;
        try {
            const stat = await importedFs.default.stat(targetPath).catch(() => null);
            if (!stat) continue;

            let filesToScan: string[] = [];
            if (stat.isDirectory()) {
                const files = await importedFs.default.readdir(targetPath);
                filesToScan = files
                    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
                    .map(f => importedPath.default.join(targetPath, f))
                    .slice(0, SLM_MAX_FILES_PER_UNIT);
            } else {
                filesToScan = [targetPath];
            }

            for (const filePath of filesToScan) {
                if (filesInspected >= SLM_MAX_FILES_PER_UNIT) break;
                const fileStat = await importedFs.default.stat(filePath).catch(() => null);
                if (!fileStat) continue;

                // SLM File Size Guard
                const guard = guardFileForSLM(filePath, fileStat.size);
                if (!guard.allowed) {
                    Logger.log('WARN', `[${unit.id}] Skipping large file: ${filePath}. ${guard.reason}`, {}, 'SWARM');
                    continue;
                }

                const content = await importedFs.default.readFile(filePath, 'utf-8');
                filesInspected++;

                for (const [threatType, pattern] of Object.entries(OSINT_PATTERNS)) {
                    // Only check relevant threats for this unit's domain
                    const isRelevant = unit.threatTypes.includes(threatType);
                    if (!isRelevant) continue;

                    const matchCheck = new RegExp(pattern.source, pattern.flags);
                    if (matchCheck.test(content)) {
                        findings.push({
                            unit: unit.id,
                            mission_id,
                            target_file: importedPath.default.relative(process.cwd(), filePath),
                            threat_type: threatType,
                            risk_level: RISK_MAP[threatType] || 'MEDIUM',
                            action_decision: (RISK_MAP[threatType] === 'CRITICAL' || RISK_MAP[threatType] === 'HIGH')
                                ? '[PERBAIKI]' : '[PANTAU]',
                            suggested_patch: getSuggestedPatch(threatType),
                            timestamp: new Date().toISOString()
                        });
                    }
                }

                // CLEAN logic removed; renderSwarmReport handles empty findings automatically.
            }
        } catch (e: any) {
            Logger.log('ERROR', `[${unit.id}] Scan error on ${targetPath}: ${e.message}`, {}, 'SWARM');
        }
    }
    return findings;
}

function getSuggestedPatch(threatType: string): string {
    const patches: Record<string, string> = {
        BLIND_USERNAME: 'Lakukan Identity Correlation via cross_platform_scanner.js. Jangan asumsikan identitas.',
        SOSMED_LINKAGE: 'Ekstrak bio dan avatar untuk reverse image search.',
        BREACHED_EMAIL: 'Jalankan email_analyzer.js untuk membedah MX, Gravatar, dan eksistensi Deep Web.',
        HIDDEN_GRAVATAR: 'Lakukan MD5 Hash pada email dan fetch id.gravatar.com/hash.json.',
        OPEN_PORTS: 'Pastikan port ini tidak terekspos ke Surface Web (Gunakan firewall/VPC).',
        EXPOSED_DNS: 'Periksa perlindungan Cloudflare/Proxy untuk menutupi IP asli.',
        TOR_LEAK: 'SANGAT KRITIS. Alamat .onion bocor ke Surface Web. Pantau akses via proxy SOCKS5 lokal.',
        ONION_MARKET_MENTION: 'Gunakan GRAY-5 (Deep Web Recon) untuk menyelidiki aktivitas forum ini.',
        BUFFER_OVERFLOW: 'Periksa alokasi memori yang tidak aman.',
        MEMORY_LEAK: 'Hapus hardcoded secret.'
    };
    return patches[threatType] || 'Delegasikan ke GRAY unit spesifik untuk penyelidikan mendalam.';
}

// ── Main Swarm Launch (Paralel 5 Unit) ─────────────────────────────
export async function launchSwarmAudit(
    goal: string,
    targetPaths: string[],
    brain?: any
): Promise<SwarmMissionResult> {
    const startTime = Date.now();
    const units = getGrayUnits();
    const board = await createMission(goal, targetPaths);
    const { mission_id } = board;

    console.log(chalk.cyan.bold(`\n🐜 ANT-CYBER-CORPS SWARM LAUNCHING`));
    console.log(chalk.dim(`   Mission ID : ${mission_id}`));
    console.log(chalk.dim(`   Goal       : ${goal}`));
    console.log(chalk.dim(`   Targets    : ${targetPaths.join(', ')}`));
    console.log(chalk.dim(`   Units      : 5 Gray Units (Parallel)\n`));

    // Run units SEQUENTIALLY to preserve VRAM/RAM on local devices.
    // Concurrent execution of 5 models requires > 8GB RAM, which crashes Termux.
    const unitResults: { unit: GrayUnit; findings: FindingCard[]; status: 'done' | 'failed' }[] = [];
    const runMode = process.env.ANT_SWARM_MODE || 'sequential'; // Default to sequential

    if (runMode === 'concurrent') {
        console.log(chalk.yellow(`  [WARNING] Running in CONCURRENT mode. This may cause OOM on devices with < 16GB RAM.`));
        const concurrentResults = await Promise.all(
            units.map(async (unit) => {
                try {
                    console.log(chalk.yellow(`  ▸ [${unit.id.toUpperCase()}] ${unit.name} — Starting scan...`));
                    
                    let findings: FindingCard[];
                    const useModel = process.env.ANT_SWARM_USE_MODEL !== 'false' && brain && (brain.api_key || brain.provider === 'Ollama') && unit.model;
                    
                    if (useModel) {
                        try {
                            findings = await runModelAudit(unit, targetPaths, mission_id, brain);
                        } catch (e: any) {
                            findings = await runStaticAudit(unit, targetPaths, mission_id);
                        }
                    } else {
                        findings = await runStaticAudit(unit, targetPaths, mission_id);
                    }
                    
                    const status = findings.some(f => f.risk_level !== 'CLEAN')
                        ? chalk.red(`${findings.filter(f => f.risk_level !== 'CLEAN').length} issue(s) found`)
                        : chalk.green('Clean');
                    console.log(chalk.dim(`  ✓ [${unit.id.toUpperCase()}] Done — ${status}`));
                    return { unit, findings, status: 'done' as const };
                } catch (e: any) {
                    Logger.log('ERROR', `Unit ${unit.id} failed: ${e.message}`, {}, 'SWARM');
                    return { unit, findings: [] as FindingCard[], status: 'failed' as const };
                }
            })
        );
        unitResults.push(...concurrentResults);
    } else {
        // Sequential Mode (Safe for Termux/Ollama Hot-Swap)
        for (const unit of units) {
            const spinner = ora({
                text: chalk.yellow(`  ▸ [${unit.id.toUpperCase()}] ${unit.name} — Memulai pemindaian...`),
                spinner: 'dots'
            }).start();
            try {
                // Note: The underlying AI call should pass keep_alive: 0
                
                let findings: FindingCard[];
                const useModel = process.env.ANT_SWARM_USE_MODEL !== 'false' && brain && (brain.api_key || brain.provider === 'Ollama') && unit.model;
                
                if (useModel) {
                    try {
                        findings = await runModelAudit(unit, targetPaths, mission_id, brain, spinner);
                    } catch (e: any) {
                        Logger.log('WARN', `[${unit.id}] runModelAudit failed, falling back to runStaticAudit.`, {}, 'SWARM');
                        spinner.text = chalk.yellow(`  ▸ [${unit.id.toUpperCase()}] Model gagal, beralih ke Regex Audit...`);
                        findings = await runStaticAudit(unit, targetPaths, mission_id);
                    }
                } else {
                    findings = await runStaticAudit(unit, targetPaths, mission_id);
                }
                
                const status = findings.some(f => f.risk_level !== 'CLEAN')
                    ? chalk.red(`${findings.filter(f => f.risk_level !== 'CLEAN').length} masalah ditemukan`)
                    : chalk.green('Bersih (Clean)');
                
                spinner.succeed(chalk.dim(`  ✓ [${unit.id.toUpperCase()}] Selesai — ${status}`));
                unitResults.push({ unit, findings, status: 'done' as const });
            } catch (e: any) {
                Logger.log('ERROR', `Unit ${unit.id} failed: ${e.message}`, {}, 'SWARM');
                spinner.fail(chalk.red(`  ✗ [${unit.id.toUpperCase()}] Gagal: ${e.message}`));
                unitResults.push({ unit, findings: [] as FindingCard[], status: 'failed' as const });
            }
        }
    }

    // Flatten all findings (no duplicates — each unit only contributes its own findings)
    const allFindings = unitResults.flatMap(r => r.findings);
    const duration_ms = Date.now() - startTime;

    // Write the FINAL blackboard state ONCE — avoids race condition and duplicate entries
    const finalBlackboard: MissionBlackboard = {
        mission_id,
        goal,
        target_paths: targetPaths,
        assigned_units: Object.fromEntries(
            unitResults.map(r => [r.unit.id, r.status])
        ) as Record<string, 'pending' | 'running' | 'done' | 'failed'>,
        findings: allFindings,
        created_at: board.created_at,
        completed_at: new Date().toISOString()
    };

    try {
        await fs.writeFile(
            path.join(BLACKBOARD_DIR, `${mission_id}.json`),
            JSON.stringify(finalBlackboard, null, 2)
        );
    } catch (e: any) {
        Logger.log('ERROR', `Failed to write final mission blackboard: ${e.message}`, { mission_id }, 'SWARM');
    }

    return {
        mission_id,
        completed_units: units.length,
        total_units: units.length,
        findings: allFindings,
        duration_ms
    };
}

// ── Render Swarm Report (Terminal Output) ──────────────────────────
export function renderSwarmReport(result: SwarmMissionResult): void {
    const width = Math.min(process.stdout.columns || 80, 78);
    const line = '─'.repeat(width);
    const durationSec = (result.duration_ms / 1000).toFixed(1);

    console.log(chalk.cyan.bold(`\n╭${line}╮`));
    console.log(chalk.cyan.bold(`│  ANT-CYBER-CORPS AUDIT RESULT`).padEnd(width + 5) + chalk.cyan.bold('│'));
    console.log(chalk.cyan(`│  ${result.completed_units} Units Completed in ${durationSec}s  [Mission: ${result.mission_id}]`).padEnd(width + 5) + chalk.cyan('│'));
    console.log(chalk.cyan(`│${line}│`));

    const units = getGrayUnits();
    for (const unit of units) {
        const unitFindings = result.findings.filter(f => f.unit === unit.id && f.risk_level !== 'CLEAN');
        const label = unitFindings.length > 0
            ? chalk.red(`${unitFindings.length} issue(s) — ${unitFindings.map(f => f.threat_type).join(', ')}`)
            : chalk.green('Clean ✓');
        console.log(chalk.cyan(`│`) + ` ${chalk.bold(unit.id.toUpperCase())}: ${unit.name.split('(')[1]?.replace(')', '') || unit.domain.split(',')[0]} — ${label}`);
    }

    const patchable = result.findings.filter(f => f.action_decision === '[PERBAIKI]');
    const watchable = result.findings.filter(f => f.action_decision === '[PANTAU]');

    console.log(chalk.cyan(`│${line}│`));
    if (patchable.length > 0) {
        console.log(chalk.cyan(`│`) + chalk.red.bold(`  [PERBAIKI] ${patchable.length} critical/high issues require patching:`));
        patchable.forEach(f => {
            console.log(chalk.cyan(`│`) + chalk.red(`    • [${f.risk_level}] ${f.threat_type} in ${f.target_file}`));
            if (f.suggested_patch) {
                console.log(chalk.cyan(`│`) + chalk.dim(`      → ${f.suggested_patch}`));
            }
        });
    }
    if (watchable.length > 0) {
        console.log(chalk.cyan(`│`) + chalk.yellow.bold(`  [PANTAU]  ${watchable.length} medium issues to monitor`));
    }
    if (patchable.length === 0 && watchable.length === 0) {
        console.log(chalk.cyan(`│`) + chalk.green.bold(`  ✅ No critical issues detected. System looks clean.`));
    }
    console.log(chalk.cyan.bold(`╰${line}╯\n`));
}
