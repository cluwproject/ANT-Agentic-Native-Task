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
import { Logger } from '../../utils/logger.js';

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

// ── Unit Registry (Model env-aware) ────────────────────────────────
export function getGrayUnits(): GrayUnit[] {
    return [
        {
            id: 'gray-1',
            name: 'ANT-GRAY-1 (Memory & Logic Guardian)',
            domain: 'Buffer Overflow, Memory Leaks, Race Conditions',
            model: process.env.ANT_GRAY_1_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:0.5b',
            threatTypes: ['BUFFER_OVERFLOW', 'MEMORY_LEAK', 'RACE_CONDITION', 'NULL_DEREF']
        },
        {
            id: 'gray-2',
            name: 'ANT-GRAY-2 (Injection Sifter)',
            domain: 'SQL Injection, XSS, Command Injection',
            model: process.env.ANT_GRAY_2_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:0.5b',
            threatTypes: ['SQL_INJECTION', 'XSS', 'COMMAND_INJECTION', 'PATH_TRAVERSAL']
        },
        {
            id: 'gray-3',
            name: 'ANT-GRAY-3 (Auth & Identity Architect)',
            domain: 'IDOR, Broken Access Control, JWT Bypass',
            model: process.env.ANT_GRAY_3_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:0.5b',
            threatTypes: ['IDOR', 'BROKEN_AUTH', 'JWT_BYPASS', 'PRIVILEGE_ESCALATION']
        },
        {
            id: 'gray-4',
            name: 'ANT-GRAY-4 (Supply Chain Sentinel)',
            domain: 'Vulnerable Dependencies, CVEs, NPM Audit',
            model: process.env.ANT_GRAY_4_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:0.5b',
            threatTypes: ['VULNERABLE_DEP', 'CVE_MATCH', 'OUTDATED_PACKAGE', 'MALICIOUS_PACKAGE']
        },
        {
            id: 'gray-5',
            name: 'ANT-GRAY-5 (Cloud & Config Auditor)',
            domain: 'Exposed .env, Public S3, IAM misconfiguration',
            model: process.env.ANT_GRAY_5_MODEL || process.env.ANT_SWARM_MODEL || 'qwen2.5:0.8b',
            threatTypes: ['EXPOSED_SECRETS', 'INSECURE_CONFIG', 'PUBLIC_BUCKET', 'IAM_MISCONFIG']
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

// ── Static Audit Runner (tanpa API model — analisis berbasis regex rules) ──
async function runStaticAudit(
    unit: GrayUnit,
    targetPaths: string[],
    mission_id: string
): Promise<FindingCard[]> {
    const findings: FindingCard[] = [];
    const importedPath = await import('path');
    const importedFs = await import('fs/promises');

    const INJECTION_PATTERNS: Record<string, RegExp> = {
        COMMAND_INJECTION: /child_process.*exec\s*\(.*\$\{|shell_exec.*\+|exec\(`[^)]*\${/g,
        SQL_INJECTION: /query\s*\(\s*`[^)]*\${|query\s*\(.*\+.*\)/g,
        EXPOSED_SECRETS: /process\.env\.(API_KEY|SECRET|PASSWORD|TOKEN)\s*(?!.*\|\|)/g,
        INSECURE_CONFIG: /rejectUnauthorized\s*:\s*false/g,
        BUFFER_OVERFLOW: /Buffer\.allocUnsafe|new Buffer\(/g,
        HARDCODED_CREDENTIAL: /(password|secret|api_key)\s*[:=]\s*["'][^"']{6,}["']/gi,
        JWT_BYPASS: /verify\s*\(\s*token.*none|algorithm.*none/gi,
        PATH_TRAVERSAL: /\.\.\/|path\.join.*req\.(params|query|body)/g
    };

    const RISK_MAP: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
        COMMAND_INJECTION: 'CRITICAL',
        SQL_INJECTION: 'HIGH',
        EXPOSED_SECRETS: 'HIGH',
        INSECURE_CONFIG: 'MEDIUM',
        BUFFER_OVERFLOW: 'HIGH',
        HARDCODED_CREDENTIAL: 'CRITICAL',
        JWT_BYPASS: 'CRITICAL',
        PATH_TRAVERSAL: 'HIGH'
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

                for (const [threatType, pattern] of Object.entries(INJECTION_PATTERNS)) {
                    // Only check relevant threats for this unit's domain
                    const isRelevant = unit.threatTypes.includes(threatType) ||
                        unit.id === 'gray-5'; // gray-5 audits config broadly
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

                if (findings.length === 0 && filesInspected === filesToScan.length) {
                    findings.push({
                        unit: unit.id,
                        mission_id,
                        target_file: importedPath.default.relative(process.cwd(), filePath),
                        threat_type: 'NONE',
                        risk_level: 'CLEAN',
                        action_decision: '[ABAIKAN]',
                        timestamp: new Date().toISOString()
                    });
                }
            }
        } catch (e: any) {
            Logger.log('ERROR', `[${unit.id}] Scan error on ${targetPath}: ${e.message}`, {}, 'SWARM');
        }
    }
    return findings;
}

function getSuggestedPatch(threatType: string): string {
    const patches: Record<string, string> = {
        COMMAND_INJECTION: 'Gunakan execFile() dengan args array — hindari template literal pada shell command.',
        SQL_INJECTION: 'Gunakan parameterized queries ($1, $2) atau ORM untuk setiap input user.',
        EXPOSED_SECRETS: 'Pastikan nilai .env tidak pernah di-log atau dikirim ke model sebagai teks biasa.',
        INSECURE_CONFIG: 'Set rejectUnauthorized: true — gunakan certificate valid untuk koneksi produksi.',
        BUFFER_OVERFLOW: 'Ganti Buffer.allocUnsafe dengan Buffer.alloc untuk inisialisasi buffer yang aman.',
        HARDCODED_CREDENTIAL: 'Pindahkan credential ke .env dan akses via process.env — JANGAN hardcode.',
        JWT_BYPASS: 'Tentukan algoritma secara eksplisit (RS256/HS256) — tolak token dengan algorithm: none.',
        PATH_TRAVERSAL: 'Validasi path dengan path.resolve() dan pastikan berada dalam direktori yang diizinkan.'
    };
    return patches[threatType] || 'Tinjau kode secara manual dan terapkan prinsip least privilege.';
}

// ── Main Swarm Launch (Paralel 5 Unit) ─────────────────────────────
export async function launchSwarmAudit(
    goal: string,
    targetPaths: string[]
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

    // Jalankan semua unit secara paralel (Promise.all)
    const unitResults = await Promise.all(
        units.map(async (unit) => {
            await updateMissionUnit(mission_id, unit.id, 'running');
            console.log(chalk.yellow(`  ▸ [${unit.id.toUpperCase()}] ${unit.name} — Starting scan...`));
            try {
                const findings = await runStaticAudit(unit, targetPaths, mission_id);
                await updateMissionUnit(mission_id, unit.id, 'done', findings);
                const status = findings.some(f => f.risk_level !== 'CLEAN')
                    ? chalk.red(`${findings.filter(f => f.risk_level !== 'CLEAN').length} issue(s) found`)
                    : chalk.green('Clean');
                console.log(chalk.dim(`  ✓ [${unit.id.toUpperCase()}] Done — ${status}`));
                return findings;
            } catch (e: any) {
                await updateMissionUnit(mission_id, unit.id, 'failed');
                Logger.log('ERROR', `Unit ${unit.id} failed: ${e.message}`, {}, 'SWARM');
                return [] as FindingCard[];
            }
        })
    );

    const allFindings = unitResults.flat();
    const duration_ms = Date.now() - startTime;

    // Simpan Finding Cards ke local blackboard
    await updateMissionUnit(mission_id, 'commander', 'done', allFindings).catch(() => {});

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
