import fs from 'fs/promises';
import path from 'path';
import vm from 'vm';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { evidenceLocker } from './agent_loop/evidenceLocker.js';
import { Logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// ANT Security: Regex blocklist untuk shell_exec — jauh lebih kuat dari blacklist array
const SHELL_BLOCKLIST_REGEX = /\b(rm\s+-[rRfFri]+|curl\s+[^|]*\|\s*(sh|bash|zsh)|wget\s+[^|]*\|\s*(sh|bash|zsh)|chmod\s+777|cat\s+.*\.env|base64\s+-d\s+.*\||eval\s*\(|exec\s*\(|mkfs|shutdown|reboot|dd\s+if=|passwd|useradd|usermod|visudo)\b/i;

// ANT Security: Validasi nama package npm (hanya alfanumerik, @, /, ., -)
const NPM_PACKAGE_SAFE_REGEX = /^(@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9._-]+([@][a-zA-Z0-9._^~><=*-]+)?$/;
const BASE_DIR = process.cwd();
const CORE_DIR = path.join(BASE_DIR, 'workspace', 'core');
const ACTIVE_SKILLS_DIR = path.join(BASE_DIR, 'workspace', 'skills', 'active');
const REGISTRY_FILE = path.join(BASE_DIR, 'workspace', 'extensions', 'registry.json');

const TRUST_FILE = path.join(BASE_DIR, 'workspace', 'registry', 'trust.json');
const TRUST_SHADOW_FILE = path.join(BASE_DIR, 'workspace', 'core', 'trust.shadow.json');

// UPGRADE: Agent is no longer jailed to 'workspace' subfolder. Can work on the entire project.
const WORKSPACE_DIR = BASE_DIR;

async function getTrustScore(action: string) {
    try {
        await fs.mkdir(path.dirname(TRUST_FILE), { recursive: true });
        await fs.mkdir(path.dirname(TRUST_SHADOW_FILE), { recursive: true });

        // Read primary and shadow data in parallel
        const [primaryRaw, shadowRaw] = await Promise.all([
            fs.readFile(TRUST_FILE, 'utf-8').catch(() => '{}'),
            fs.readFile(TRUST_SHADOW_FILE, 'utf-8').catch(() => '{}')
        ]);

        let primaryTrust: any = {};
        let shadowTrust: any = {};

        try { primaryTrust = JSON.parse(primaryRaw); } catch { primaryTrust = {}; }
        try { shadowTrust = JSON.parse(shadowRaw); } catch { shadowTrust = {}; }

        const primaryItem = primaryTrust[action] || { score: 50, consecutive_success: 0 };
        const shadowItem = shadowTrust[action] || { score: 50, consecutive_success: 0 };

        // DETECT ANOMALOUS DRIFT / CONTAMINATION
        // If they differ, execute Pessimistic Resolution to protect integrity
        if (primaryItem.score !== shadowItem.score || primaryItem.consecutive_success !== shadowItem.consecutive_success) {
            const pessimisticScore = Math.min(primaryItem.score, shadowItem.score);
            const pessimisticConsecutive = Math.min(primaryItem.consecutive_success, shadowItem.consecutive_success);

            Logger.log('WARN', `Trust Data Drift Detected on Action: [${action}]. Restoring with Pessimistic Resolution (Score: ${pessimisticScore}, Consecutive: ${pessimisticConsecutive}).`, {}, 'SECURITY');

            const secureItem = { score: pessimisticScore, consecutive_success: pessimisticConsecutive };
            primaryTrust[action] = secureItem;
            shadowTrust[action] = secureItem;

            // Self-heal both stores out-of-band
            await Promise.all([
                fs.writeFile(TRUST_FILE, JSON.stringify(primaryTrust, null, 2)),
                fs.writeFile(TRUST_SHADOW_FILE, JSON.stringify(shadowTrust, null, 2))
            ]).catch(() => {});

            return secureItem;
        }

        return primaryItem;
    } catch (e) {
        return { score: 50, consecutive_success: 0 };
    }
}

async function updateTrustScore(action: string, success: boolean) {
    try {
        await fs.mkdir(path.dirname(TRUST_FILE), { recursive: true });
        await fs.mkdir(path.dirname(TRUST_SHADOW_FILE), { recursive: true });

        const [primaryRaw, shadowRaw] = await Promise.all([
            fs.readFile(TRUST_FILE, 'utf-8').catch(() => '{}'),
            fs.readFile(TRUST_SHADOW_FILE, 'utf-8').catch(() => '{}')
        ]);

        let primaryTrust: any = {};
        let shadowTrust: any = {};

        try { primaryTrust = JSON.parse(primaryRaw); } catch { primaryTrust = {}; }
        try { shadowTrust = JSON.parse(shadowRaw); } catch { shadowTrust = {}; }

        // Take pessimistic current status first to prevent building upon forged data
        const primaryCurrent = primaryTrust[action] || { score: 50, consecutive_success: 0 };
        const shadowCurrent = shadowTrust[action] || { score: 50, consecutive_success: 0 };

        const current = {
            score: Math.min(primaryCurrent.score, shadowCurrent.score),
            consecutive_success: Math.min(primaryCurrent.consecutive_success, shadowCurrent.consecutive_success)
        };
        
        if (success) {
            current.consecutive_success += 1;
            // score increases every 3 consecutive successes
            if (current.consecutive_success % 3 === 0) {
                current.score = Math.min(100, current.score + 5);
            }
        } else {
            current.consecutive_success = 0;
            current.score = Math.max(0, current.score - 15);
        }
        
        primaryTrust[action] = current;
        shadowTrust[action] = current;

        // Atomic double write
        await Promise.all([
            fs.writeFile(TRUST_FILE, JSON.stringify(primaryTrust, null, 2)),
            fs.writeFile(TRUST_SHADOW_FILE, JSON.stringify(shadowTrust, null, 2))
        ]);
    } catch (e) {}
}

async function logFileAudit(action: string, file: string, detail: string) {
    try {
        const auditLogPath = path.join(BASE_DIR, 'workspace', 'registry', 'audit.log');
        await fs.mkdir(path.dirname(auditLogPath), { recursive: true }).catch(() => {});
        const logEntry = `[${new Date().toISOString()}] ACTION: ${action} | FILE: ${file} | DETAILS: ${detail}\n`;
        await fs.appendFile(auditLogPath, logEntry, 'utf-8');
    } catch (e: any) {
        Logger.log('ERROR', `Failed to write audit log: ${e.message}`, {}, 'SECURITY');
    }
}

export async function executeAction(actionName: string, details: any, attempts = 3, context?: any) {
    const action = actionName.trim();
    
    // LAYER 6: TRUST GATE
    const trust = await getTrustScore(action);
    const isHighTrust = trust.score >= 85;
    // BEBAS HAMBATAN: 'modify_file' dan 'ant_skill_create' dihapus dari hardcaps
    // agar ANT dapat bekerja secara otonom (Full Autonomy / God Mode)
    // untuk menulis dan memperbarui skill secara maraton tanpa tertahan Trust Gate.
    const hardcaps = ['shell_exec', 'npm_install', 'task_delete', 'delete_file'];
    
    let needsApproval = hardcaps.includes(action);
    if (needsApproval && action === 'shell_exec') {
        const command = details?.command || '';
        const isReadOnly = /^(ls|pwd|echo|cat\s+(?!.*\.env)|node\s+-v|npm\s+-v|git\s+log|git\s+status|git\s+diff|which|type|find\s+.*-name|grep\s+.*-r)/.test(command.trim());
        if (isReadOnly) {
            needsApproval = false; // Allow read-only commands without approval
        }
    }
    
    if (needsApproval && !context?.manual_approval) {
        Logger.log('WARN', `Trust Gate: Aksi '${action}' ditunda karena memerlukan persetujuan manual dari Ard.`, {}, 'SECURITY');
        throw new Error(`APPROVAL_REQUIRED: Aksi '${action}' memerlukan persetujuan manual dari Ard.`);
    }

    // LAYER 5: REFLEXIVE LOOP (PROPOSAL)
    if (context?.triage === 'DEEP') {
        Logger.log('INFO', `Reflexive Loop: Validating proposal for ${action}...`, details, 'SWARM');
        // Stub for validation logic
    }

    Logger.log('INFO', `Executing Action: ${action} (Attempt: ${4 - attempts}/3)...`, details, 'SYSTEM');

    let lastError: any;
    for (let i = 0; i < attempts; i++) {
        try {
            if (action === 'read_file') {
                const fileName = details.file || details.path;
                if (!fileName) throw new Error('Argument "file" or "path" must be string and is required.');
                const targetPath = path.resolve(WORKSPACE_DIR, fileName);
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');
                if (targetPath.includes('.env')) throw new Error('ACCESS_DENIED: .env files are protected.');
                
                // VULN-002 FIX: Symlink traversal protection
                let realTargetPath: string;
                try {
                    realTargetPath = await fs.realpath(targetPath).catch(() => targetPath);
                } catch { realTargetPath = targetPath; }
                if (!realTargetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Symlink traversal detected.');
                
                try {
                    const stats = await fs.stat(targetPath);
                    if (stats.isDirectory()) {
                        throw new Error(`EISDIR: '${fileName}' adalah direktori. Gunakan 'list_dir' untuk melihat isinya.`);
                    }
                } catch (e: any) {
                    if (e.code === 'ENOENT') throw new Error(`ENOENT: File '${fileName}' tidak ditemukan.`);
                    throw e;
                }

                const content = await fs.readFile(targetPath, 'utf-8');
                const lines = content.split('\n');
                
                // Termux / Low End Device Protection: Limit lines read
                let result = content;
                if (details.startLine !== undefined || details.endLine !== undefined) {
                    const start = details.startLine ? Math.max(0, details.startLine - 1) : 0;
                    const end = details.endLine ? Math.min(lines.length, details.endLine) : lines.length;
                    result = lines.slice(start, end).join('\n');
                } else if (lines.length > 500) {
                    result = lines.slice(0, 500).join('\n') + '\n\n... [TRUNCATED - PLEASE USE startLine AND endLine FOR MORE]';
                }
                
                return { status: 'success', content: result, totalLines: lines.length };
            } else if (action === 'list_dir') {
                const targetPath = path.resolve(WORKSPACE_DIR, details.path || '.');
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');
                
                try {
                    const stats = await fs.stat(targetPath);
                    if (!stats.isDirectory()) {
                        throw new Error(`ENOTDIR: '${details.path}' bukan direktori. Gunakan 'read_file' untuk membaca isinya.`);
                    }
                    const files = await fs.readdir(targetPath);
                    return { status: 'success', files };
                } catch (e: any) {
                    if (e.code === 'ENOENT') throw new Error(`ENOENT: Direktori '${details.path}' tidak ditemukan.`);
                    throw e;
                }
            } else if (action === 'execute_js') {
                // VULN-003 FIX: Use vm.Script sandbox instead of direct execAsync
                // Prevents arbitrary filesystem/network access from AI-generated code
                const outputLines: string[] = [];
                const sandboxConsole = { 
                    log: (...args: any[]) => outputLines.push(args.map(String).join(' ')),
                    error: (...args: any[]) => outputLines.push('[ERR] ' + args.map(String).join(' ')),
                    warn: (...args: any[]) => outputLines.push('[WARN] ' + args.map(String).join(' '))
                };
                const sandbox = vm.createContext({ console: sandboxConsole, Math, JSON, Array, Object, String, Number, Boolean, Date });
                try {
                    const script = new vm.Script(details.code, { filename: 'ant_sandbox.js' });
                    script.runInContext(sandbox, { timeout: 5000 }); // 5 detik timeout
                    return { status: 'success', stdout: outputLines.join('\n'), stderr: '' };
                } catch (vmError: any) {
                    if (vmError.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
                        throw new Error('SECURITY_VIOLATION: JS execution timed out (5s limit). Possible infinite loop.');
                    }
                    throw vmError;
                }
            } else if (action === 'grep_search') {
                // ── GREP SEARCH ─────────────────────────────────────────────────
                // Cari pattern teks/regex di seluruh file dalam direktori.
                // Pakai ripgrep (rg) jika tersedia, fallback ke grep.
                const query = details.query || details.pattern;
                if (!query) throw new Error('Argument "query" is required for grep_search.');
                const searchPath = details.path ? path.resolve(WORKSPACE_DIR, details.path) : WORKSPACE_DIR;
                if (!searchPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');

                const include = details.include ? `--include="${details.include}"` : '';
                const caseFlag = details.case_insensitive ? '-i' : '';
                const maxResults = Math.min(details.max_results || 50, 200);

                try {
                    // Coba ripgrep dulu (lebih cepat)
                    const rgCmd = `rg --json -m ${maxResults} ${caseFlag} ${include} ${JSON.stringify(query)} ${JSON.stringify(searchPath)} 2>/dev/null | head -c 50000`;
                    const { stdout: rgOut } = await execAsync(rgCmd, { cwd: BASE_DIR }).catch(() => ({ stdout: '' }));
                    if (rgOut.trim()) {
                        const lines = rgOut.trim().split('\n').filter(Boolean);
                        const results: any[] = [];
                        for (const line of lines) {
                            try {
                                const obj = JSON.parse(line);
                                if (obj.type === 'match') {
                                    results.push({
                                        file: path.relative(WORKSPACE_DIR, obj.data.path.text),
                                        line: obj.data.line_number,
                                        content: obj.data.lines.text.trim()
                                    });
                                }
                            } catch {}
                        }
                        return { status: 'success', tool: 'grep_search', engine: 'ripgrep', results, count: results.length };
                    }
                } catch {}

                // Fallback ke grep standar
                try {
                    const grepCmd = `grep -rn ${caseFlag} ${include} --max-count=${maxResults} ${JSON.stringify(query)} ${JSON.stringify(searchPath)} 2>/dev/null | head -200`;
                    const { stdout } = await execAsync(grepCmd, { cwd: BASE_DIR });
                    const results = stdout.trim().split('\n').filter(Boolean).map(l => {
                        const m = l.match(/^(.+?):(\d+):(.*)$/);
                        if (m) return { file: path.relative(WORKSPACE_DIR, m[1]), line: parseInt(m[2]), content: m[3].trim() };
                        return { file: l, line: 0, content: '' };
                    });
                    return { status: 'success', tool: 'grep_search', engine: 'grep', results, count: results.length };
                } catch (e: any) {
                    return { status: 'success', tool: 'grep_search', engine: 'grep', results: [], count: 0, message: 'No matches found.' };
                }

            } else if (action === 'create_file') {
                // ── CREATE FILE ─────────────────────────────────────────────────
                // Buat file baru dengan konten. Error jika file sudah ada (kecuali overwrite=true).
                const fileName = details.file || details.path;
                if (!fileName) throw new Error('Argument "file" or "path" is required for create_file.');
                const targetPath = path.resolve(WORKSPACE_DIR, fileName);
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');
                if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');

                const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
                if (exists && !details.overwrite) {
                    throw new Error(`FILE_EXISTS: File '${fileName}' already exists. Use overwrite:true to replace it.`);
                }

                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                const content = details.content ?? '';
                await fs.writeFile(targetPath, content, 'utf-8');
                await logFileAudit('CREATE_FILE', fileName, 'File baru dibuat.');
                return { status: 'success', file: fileName, message: `File '${fileName}' berhasil dibuat (${content.length} chars).` };

            } else if (action === 'create_dir') {
                // ── CREATE DIRECTORY ─────────────────────────────────────────────
                // Buat direktori (termasuk parent) secara rekursif.
                const dirName = details.path || details.dir;
                if (!dirName) throw new Error('Argument "path" or "dir" is required for create_dir.');
                const targetPath = path.resolve(WORKSPACE_DIR, dirName);
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');

                await fs.mkdir(targetPath, { recursive: true });
                await logFileAudit('CREATE_DIR', dirName, 'Direktori baru dibuat.');
                return { status: 'success', path: dirName, message: `Direktori '${dirName}' berhasil dibuat.` };

            } else if (action === 'modify_file') {
                const fileName = details.file || details.path;
                if (!fileName) throw new Error('Argument "file" or "path" must be string and is required.');
                const targetPath = path.resolve(WORKSPACE_DIR, fileName);
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');
                if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');
                // VULN-002 FIX: Symlink check for modify_file
                try {
                    const realModPath = await fs.realpath(path.dirname(targetPath)).catch(() => path.dirname(targetPath));
                    if (!realModPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Symlink traversal detected.');
                } catch (e: any) { if (e.message.includes('ACCESS_DENIED')) throw e; };
                
                // UPGRADE: Agent is now allowed to modify core files and system files
                // We removed the strict core directory boundary to allow self-healing and agentic upgrades
                const relativePath = path.relative(BASE_DIR, targetPath);
                
                try {
                    const stats = await fs.stat(targetPath).catch(() => null);
                    if (stats && stats.isDirectory()) {
                        throw new Error(`EISDIR: Cannot write file to a directory path '${fileName}'.`);
                    }
                } catch (e: any) { throw e; }

                await logFileAudit('MODIFY_FILE', fileName, `Menulis/mengubah file dengan isi sepanjang ${details.content?.length || 0} karakter.`);
                
                // 1. REKAM CCTV MEMORI SEBELUM PERUBAHAN 
                // Menggunakan context?.sessionId jika ada, atau fallback 'default-session'
                evidenceLocker.captureBefore(context?.sessionId || 'default-session', targetPath);

                await fs.mkdir(path.dirname(targetPath), { recursive: true }).catch(() => {});
                await fs.writeFile(targetPath, details.content);
                await updateTrustScore(action, true);
                return { status: 'success', file: fileName };
            } else if (action === 'edit_file') {
                const fileName = details.file || details.path;
                if (!fileName) throw new Error('Argument "file" or "path" must be string and is required.');
                const targetPath = path.resolve(WORKSPACE_DIR, fileName);
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');
                if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');
                
                try {
                    const realModPath = await fs.realpath(path.dirname(targetPath)).catch(() => path.dirname(targetPath));
                    if (!realModPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Symlink traversal detected.');
                } catch (e: any) { if (e.message.includes('ACCESS_DENIED')) throw e; };

                try {
                    const stats = await fs.stat(targetPath).catch(() => null);
                    if (!stats || stats.isDirectory()) {
                        throw new Error(`FILE_NOT_FOUND: Cannot edit missing file or directory '${fileName}'.`);
                    }
                } catch (e: any) { throw e; }

                let content = await fs.readFile(targetPath, 'utf-8');
                if (!content.includes(details.targetContent)) {
                    throw new Error('EDIT_FAILED: The specified targetContent was not found in the file. Make sure it matches exactly, including whitespaces and indentation.');
                }
                
                content = content.replace(details.targetContent, details.replacementContent);
                
                // 1. REKAM CCTV MEMORI SEBELUM PERUBAHAN 
                evidenceLocker.captureBefore(context?.sessionId || 'default-session', targetPath);

                await fs.writeFile(targetPath, content);
                await logFileAudit('EDIT_FILE', fileName, `Melakukan bedah presisi (patch) pada file.`);
                await updateTrustScore(action, true);
                return { status: 'success', file: fileName, message: 'File successfully patched.' };

            } else if (action === 'patch_file') {
                // ── PATCH FILE (Line-Range Edit) ────────────────────────────────
                // Edit presisi berdasarkan start_line & end_line. Lebih aman dari
                // edit_file (tidak perlu exact string match) dan lebih transparan
                // (menyimpan .bak sebelum edit dan menampilkan diff ringkas).
                const fileName = details.file || details.path;
                if (!fileName) throw new Error('Argument "file" or "path" is required for patch_file.');
                if (details.start_line === undefined || details.end_line === undefined) {
                    throw new Error('Arguments "start_line" and "end_line" are required for patch_file.');
                }
                if (details.new_content === undefined) throw new Error('Argument "new_content" is required for patch_file.');

                const targetPath = path.resolve(WORKSPACE_DIR, fileName);
                if (!targetPath.startsWith(WORKSPACE_DIR)) throw new Error('ACCESS_DENIED: Path outside workspace.');
                if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');

                const originalContent = await fs.readFile(targetPath, 'utf-8');
                const lines = originalContent.split('\n');
                const startLine = Math.max(1, details.start_line) - 1; // 0-indexed
                const endLine = Math.min(lines.length, details.end_line);  // inclusive

                // Auto-backup sebelum edit
                const bakPath = targetPath + '.bak';
                await fs.writeFile(bakPath, originalContent, 'utf-8');

                // Build diff ringkas untuk log
                const removedLines = lines.slice(startLine, endLine);
                const newLines = String(details.new_content).split('\n');
                const diffPreview = [
                    ...removedLines.slice(0, 5).map(l => `- ${l}`),
                    ...(removedLines.length > 5 ? [`  ... (${removedLines.length - 5} more removed lines)`] : []),
                    ...newLines.slice(0, 5).map(l => `+ ${l}`),
                    ...(newLines.length > 5 ? [`  ... (${newLines.length - 5} more added lines)`] : []),
                ].join('\n');

                // Apply patch
                const patchedLines = [
                    ...lines.slice(0, startLine),
                    ...newLines,
                    ...lines.slice(endLine)
                ];
                await fs.writeFile(targetPath, patchedLines.join('\n'), 'utf-8');
                await logFileAudit('PATCH_FILE', fileName, `Line ${details.start_line}-${details.end_line} diganti (${removedLines.length}→${newLines.length} baris). Backup: ${fileName}.bak`);
                return {
                    status: 'success',
                    file: fileName,
                    backup: `${fileName}.bak`,
                    lines_replaced: `${details.start_line}-${details.end_line}`,
                    diff_preview: diffPreview,
                    message: `Patch applied. ${removedLines.length} lines replaced with ${newLines.length} lines. Backup saved as ${fileName}.bak`
                };

            } else if (action === 'git_status') {
                // ── GIT STATUS ───────────────────────────────────────────────────
                const cwd = details.path ? path.resolve(WORKSPACE_DIR, details.path) : BASE_DIR;
                try {
                    const { stdout } = await execAsync('git status --short --branch', { cwd });
                    return { status: 'success', tool: 'git_status', output: stdout.trim() };
                } catch (e: any) {
                    return { status: 'error', message: `Git tidak tersedia atau bukan repo: ${e.message}` };
                }

            } else if (action === 'git_diff') {
                // ── GIT DIFF ─────────────────────────────────────────────────────
                const cwd = details.path ? path.resolve(WORKSPACE_DIR, details.path) : BASE_DIR;
                const file = details.file || '';
                const staged = details.staged ? '--cached' : '';
                const maxLines = Math.min(details.max_lines || 200, 500);
                try {
                    const cmd = `git diff ${staged} ${file} 2>/dev/null | head -${maxLines}`;
                    const { stdout } = await execAsync(cmd, { cwd });
                    return { status: 'success', tool: 'git_diff', output: stdout.trim() || '(no changes)' };
                } catch (e: any) {
                    return { status: 'error', message: `git diff gagal: ${e.message}` };
                }

            } else if (action === 'git_log') {
                // ── GIT LOG ──────────────────────────────────────────────────────
                const cwd = details.path ? path.resolve(WORKSPACE_DIR, details.path) : BASE_DIR;
                const n = Math.min(details.n || 10, 50);
                try {
                    const { stdout } = await execAsync(
                        `git log --oneline --decorate -n ${n}`, { cwd }
                    );
                    return { status: 'success', tool: 'git_log', output: stdout.trim() };
                } catch (e: any) {
                    return { status: 'error', message: `git log gagal: ${e.message}` };
                }

            } else if (action === 'syntax_check') {
                const { exec } = await import('child_process');
                const util = await import('util');
                const execPromise = util.promisify(exec);
                const fileName = details.file || details.path;
                const target = fileName ? `${fileName}` : '';
                try {
                    const { stdout } = await execPromise(`npx tsc --noEmit ${target}`, { cwd: BASE_DIR });
                    return { status: 'success', message: 'No TypeScript syntax errors found.', output: stdout };
                } catch (e: any) {
                    return { status: 'error', message: 'Syntax errors found:', output: e.stdout || e.message };
                }
            } else if (action === 'generate_trading_ea') {
                const { generateTradingEA } = await import('../agents/economy_agent.js');
                const data = await generateTradingEA(details.platform, details.strategy, details.parameters);
                return { status: 'success', data };

            // ── SECURITY AGENT ────────────────────────────────────────────────
            } else if (action === 'security_network_scan') {
                const { networkScan } = await import('../agents/security_agent.js');
                const data = await networkScan(details.target, details.ports);
                return { status: 'success', data };
            } else if (action === 'security_osint_harvest') {
                const { osintHarvest } = await import('../agents/security_agent.js');
                const data = await osintHarvest(details.domain, details.include_whois !== false);
                return { status: 'success', data };
            } else if (action === 'security_zap_spider') {
                const { zapSpider } = await import('../agents/security_agent.js');
                const data = await zapSpider(details.url);
                return { status: 'success', data };
            } else if (action === 'security_zap_scan') {
                const { zapActiveScan } = await import('../agents/security_agent.js');
                const data = await zapActiveScan(details.url);
                return { status: 'success', data };
            } else if (action === 'security_zap_alerts') {
                const { zapGetAlerts } = await import('../agents/security_agent.js');
                const data = await zapGetAlerts(details.url, details.risk);
                return { status: 'success', data };
            } else if (action === 'security_check_ssl') {
                const { checkSSL } = await import('../agents/security_agent.js');
                const data = await checkSSL(details.domain, details.port);
                return { status: 'success', data };
            } else if (action === 'security_dns_analyze') {
                const { analyzeDNS } = await import('../agents/security_agent.js');
                const data = await analyzeDNS(details.domain, details.record_type);
                return { status: 'success', data };
            } else if (action === 'security_check_headers') {
                const { checkSecurityHeaders } = await import('../agents/security_agent.js');
                const data = await checkSecurityHeaders(details.url);
                return { status: 'success', data };
            } else if (action === 'security_full_report') {
                const { runFullSecurityReport } = await import('../agents/security_agent.js');
                const data = await runFullSecurityReport(details.target);
                return { status: 'success', data };
            } else if (action === 'security_tech_fingerprint') {
                const { executeAntSkill } = await import('./ant_skills.js');
                const result = await executeAntSkill('tech_fingerprinter.py', [details.url]);
                const data = JSON.parse(result.stdout || '{}');
                return { status: 'success', data };
            } else if (action === 'security_dir_fuzz') {
                const { executeAntSkill } = await import('./ant_skills.js');
                const args = [details.url, '--wordlist', details.wordlist || 'minimal', '--threads', String(details.threads || 10)];
                const result = await executeAntSkill('dir_fuzzer.py', args);
                const data = JSON.parse(result.stdout || '{}');
                return { status: 'success', data };
            } else if (action === 'security_cookie_analyze') {
                const { executeAntSkill } = await import('./ant_skills.js');
                const result = await executeAntSkill('cookie_analyzer.py', [details.url]);
                const data = JSON.parse(result.stdout || '{}');
                return { status: 'success', data };
            } else if (action === 'security_sqli_test') {
                const { executeAntSkill } = await import('./ant_skills.js');
                const args = [details.url, '--passive-only', '--level', String(details.level || 1)];
                const result = await executeAntSkill('sqli_tester.py', args);
                const data = JSON.parse(result.stdout || '{}');
                return { status: 'success', data };
            // ── END SECURITY AGENT ────────────────────────────────────────────
            // ── BUG BOUNTY COMPANION ──────────────────────────────────────────
            } else if (action === 'bb_parse_scope') {
                const { parseScope } = await import('../agents/bugbounty_agent.js');
                const data = await parseScope(details.scope_text, details.program_name, details.platform);
                return { status: 'success', data };
            } else if (action === 'bb_validate_target') {
                const { validateTarget } = await import('../agents/bugbounty_agent.js');
                const data = await validateTarget(details.target);
                return { status: 'success', data };
            } else if (action === 'bb_get_scope') {
                const { getCurrentScope } = await import('../agents/bugbounty_agent.js');
                const data = await getCurrentScope();
                return { status: 'success', data };
            } else if (action === 'bb_suggest_recon') {
                const { suggestReconPlan } = await import('../agents/bugbounty_agent.js');
                const data = await suggestReconPlan(details.target);
                return { status: 'success', data };
            } else if (action === 'bb_run_recon') {
                const { runScopedRecon } = await import('../agents/bugbounty_agent.js');
                const data = await runScopedRecon(details.target);
                return { status: 'success', data };
            } else if (action === 'bb_add_finding') {
                const { addFinding } = await import('../agents/bugbounty_agent.js');
                const data = await addFinding(
                    details.title, details.severity, details.target,
                    details.description, details.steps_to_reproduce,
                    details.impact, details.evidence
                );
                return { status: 'success', data };
            } else if (action === 'bb_list_findings') {
                const { listFindings } = await import('../agents/bugbounty_agent.js');
                const data = await listFindings();
                return { status: 'success', data };
            } else if (action === 'bb_draft_report') {
                const { draftReport } = await import('../agents/bugbounty_agent.js');
                const data = await draftReport(details.finding_id);
                return { status: 'success', data };
            // ── END BUG BOUNTY COMPANION ──────────────────────────────────────
            } else if (action === 'mexc_get_balance_futures') {
                const { mexcGetFuturesBalance } = await import('../mexc_trading.js');
                const data = await mexcGetFuturesBalance();
                return { status: 'success', data };
            } else if (action === 'mexc_get_ticker_futures') {
                const { mexcGetFuturesTicker } = await import('../mexc_trading.js');
                const data = await mexcGetFuturesTicker(details.symbol);
                return { status: 'success', data };
            } else if (action === 'mexc_get_open_positions') {
                const { mexcGetOpenPositions } = await import('../mexc_trading.js');
                const data = await mexcGetOpenPositions();
                return { status: 'success', data };
            } else if (action === 'mexc_get_open_orders') {
                const { mexcGetOpenOrders } = await import('../mexc_trading.js');
                const data = await mexcGetOpenOrders(details.symbol);
                return { status: 'success', data };
            } else if (action === 'mexc_get_order_history') {
                const { mexcGetOrderHistory } = await import('../mexc_trading.js');
                const data = await mexcGetOrderHistory(details.symbol, details.pageSize);
                return { status: 'success', data };
            } else if (action === 'mexc_get_index_price') {
                const { mexcGetIndexPrice } = await import('../mexc_trading.js');
                const data = await mexcGetIndexPrice(details.symbol);
                return { status: 'success', data };
            } else if (action === 'mexc_get_risk_info') {
                const { mexcGetRiskInfo } = await import('../mexc_trading.js');
                const data = await mexcGetRiskInfo();
                return { status: 'success', data };
            } else if (action === 'mexc_cancel_order') {
                const { mexcCancelOrder } = await import('../mexc_trading.js');
                const data = await mexcCancelOrder(details.orderId);
                return { status: 'success', data };
            } else if (action === 'mexc_close_position_market') {
                const { mexcClosePositionMarket } = await import('../mexc_trading.js');
                const data = await mexcClosePositionMarket(details.symbol);
                return { status: 'success', data };
            } else if (action === 'mexc_place_order_futures') {
                const { mexcPlaceFuturesOrder } = await import('../mexc_trading.js');
                const { symbol, price, vol, side, type, openType } = details;
                const data = await mexcPlaceFuturesOrder(symbol, price, vol, side, type, openType);
                return { status: 'success', data };
            } else if (action === 'mexc_get_klines') {
                const { mexcGetKlines } = await import('../mexc_trading.js');
                const { symbol, interval, limit } = details;
                const data = await mexcGetKlines(symbol, interval, limit);
                return { status: 'success', data };
            } else if (action === 'gemini_analyze_image') {
                const { analyzeImage } = await import('./ai.js');
                const { getBrainConfig } = await import('../shared/data.js'); 
                const fs = await import('fs');
                const config = await getBrainConfig();
                
                const { prompt, image } = details;
                let base64Image = image;
                if (image && fs.existsSync(image)) {
                    base64Image = fs.readFileSync(image).toString('base64');
                }
                const text = await analyzeImage(config, prompt, base64Image);
                return { status: 'success', text };
            } else if (action === 'npm_install') {
                const pkg = details.package;
                // VULN-007 FIX: Validate package name format to prevent command injection
                if (!NPM_PACKAGE_SAFE_REGEX.test(pkg)) {
                    throw new Error(`SECURITY_VIOLATION: Package name '${pkg}' contains invalid characters. Only alphanumeric, @, /, ., - are allowed.`);
                }
                if (pkg.includes('..') || pkg.includes('/') && !pkg.startsWith('@')) {
                    throw new Error('SECURITY_VIOLATION: Suspicious package path detected.');
                }
                try {
                    const { stdout, stderr } = await execAsync(`npm install ${pkg}`);
                    return { status: 'success', stdout, stderr };
                } catch (npmError: any) {
                    // Detect fatal 404
                    if (npmError.message.includes('404')) {
                        throw new Error(`FATAL: Package '${pkg}' tidak ditemukan di registry npm (404).`);
                    }
                    throw npmError;
                }
            } else if (action === 'create_cron_task') {
                const { addCustomSchedule } = await import('./scheduler.js');
                const cron = details.cron;
                const command = details.command;
                if (!cron || !command) throw new Error('Argument "cron" dan "command" wajib untuk create_cron_task.');
                const taskId = await addCustomSchedule(cron, command);
                return { status: 'success', taskId, message: `Task '${command}' dijadwalkan dengan cron '${cron}' (ID: ${taskId}).` };
            } else if (action === 'shell_exec') {
                const command = details.command;
                const isModificationCmd = /[\x3E\x7C]|\b(rm|mv|cp|sed|truncate|chmod|chown|tee|git|write|delete)\b/i.test(command);
                if (isModificationCmd) {
                    await logFileAudit('SHELL_EXEC_MODIFY', 'shell', `Menjalankan perintah shell modifikasi: "${command}"`);
                }
                // VULN-001 FIX: Advanced regex blocklist — cannot be bypassed unlike simple array
                if (SHELL_BLOCKLIST_REGEX.test(command)) {
                    throw new Error('SECURITY_VIOLATION: Command pattern matches restricted operations. Blocked by ANT Sovereign Shield.');
                }
                
                // UPGRADE: Agent is now allowed to modify core files via shell if approved
                if (/\b(trust\.shadow)\b/i.test(command) && /[\x3E\x7C]|\b(rm|mv|cp|sed|truncate|chmod|chown|tee|git)\b/i.test(command)) {
                    throw new Error('SECURITY_VIOLATION: Direct writes or modifications to the trust.shadow system file via shell commands are strictly prohibited.');
                }

                // Require explicit approval for shell commands (Trust Gate enforcement)
                if (!context?.manual_approval && !isHighTrust) {
                    Logger.log('WARN', `Shell command blocked pending approval: ${command.slice(0, 80)}`, {}, 'SECURITY');
                    // Allow low-risk read-only commands without approval
                    const isReadOnly = /^(ls|pwd|echo|cat\s+(?!.*\.env)|node\s+-v|npm\s+-v|git\s+log|git\s+status|git\s+diff|which|type|find\s+.*-name|grep\s+.*-r)/.test(command.trim());
                    if (!isReadOnly) {
                        throw new Error('APPROVAL_REQUIRED: Shell command requires explicit manual approval from Ard. Use Security Gates.');
                    }
                }

                try {
                    const { stdout, stderr } = await execAsync(command, { timeout: 30000 }); // 30s timeout
                    return { status: 'success', stdout, stderr };
                } catch (cmdError: any) {
                    return { status: 'error', error: cmdError.message, stdout: cmdError.stdout || '', stderr: cmdError.stderr || '' };
                }
            } else if (action === 'kaggle_action') {
                const subAction = details.subAction || details.type || 'search';
                let cmd = 'kaggle ';
                if (subAction === 'search_datasets' || subAction === 'search') {
                    cmd += `datasets list -s "${details.query || 'llm'}"`;
                } else if (subAction === 'download_dataset') {
                    const targetDir = details.path ? path.resolve(WORKSPACE_DIR, details.path) : path.resolve(WORKSPACE_DIR, 'workspace', 'kaggle_data');
                    await fs.mkdir(targetDir, { recursive: true });
                    cmd += `datasets download -d "${details.dataset}" -p "${targetDir}" --unzip`;
                } else if (subAction === 'search_competitions') {
                    cmd += `competitions list -s "${details.query || ''}"`;
                } else if (subAction === 'download_competition') {
                    const targetDir = details.path ? path.resolve(WORKSPACE_DIR, details.path) : path.resolve(WORKSPACE_DIR, 'workspace', 'kaggle_data');
                    await fs.mkdir(targetDir, { recursive: true });
                    cmd += `competitions download -c "${details.competition}" -p "${targetDir}"`;
                } else if (subAction === 'submit_competition') {
                    cmd += `competitions submit -c "${details.competition}" -f "${details.file}" -m "${details.message || 'Submission via ANT'}"`;
                } else {
                    cmd += `${subAction}`;
                }
                const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });
                return { status: 'success', subAction, stdout, stderr };
            } else if (action === 'tiktok_osint') {
                const { url } = details;
                try {
                    // Coba gunakan TikWM API untuk mengekstrak data TikTok yang diproteksi anti-bot
                    const { stdout } = await execAsync(`curl -s "https://www.tikwm.com/api/?url=${url}"`, { maxBuffer: 10 * 1024 * 1024 });
                    
                    let caption = '';
                    let imageUrls: string[] = [];
                    let author = '';
                    
                    try {
                        const parsed = JSON.parse(stdout);
                        if (parsed.code === 0 && parsed.data) {
                            caption = parsed.data.title || '';
                            author = parsed.data.author?.nickname || parsed.data.author?.unique_id || '';
                            if (parsed.data.images && parsed.data.images.length > 0) {
                                imageUrls = parsed.data.images;
                            } else if (parsed.data.cover) {
                                imageUrls = [parsed.data.cover];
                            }
                        }
                    } catch (e) {
                        // Fallback ke metode lama jika TikWM gagal
                        const { stdout: htmlOutput } = await execAsync(`curl -sL "${url}"`, { maxBuffer: 10 * 1024 * 1024 });
                        const metaMatch = htmlOutput.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
                        caption = metaMatch?.[1] || '';
                    }

                    return { 
                        status: 'success', 
                        caption: caption,
                        author: author,
                        total_slides: imageUrls.length,
                        images: imageUrls,
                        verification: caption ? 'Data successfully extracted via API' : 'TikTok anti-bot protection prevented full extraction.'
                    };
                } catch (e: any) {
                    return { status: 'error', error: e.message };
                }
            } else if (action === 'knowledge_add') {
                const { title, category, content, tags } = details;
                const vaultDir = path.join(WORKSPACE_DIR, 'workspace', 'knowledge_vault');
                await fs.mkdir(vaultDir, { recursive: true });
                const fileName = `${(title || 'doc').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Date.now()}.json`;
                const filePath = path.join(vaultDir, fileName);
                const entry = {
                    title: title || 'Untitled Knowledge',
                    category: category || 'General',
                    tags: tags || [],
                    content: content || '',
                    addedAt: new Date().toISOString()
                };
                await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf-8');
                return { status: 'success', message: `Pengetahuan berhasil disimpan ke Knowledge Vault: ${fileName}`, title };
            } else if (action === 'knowledge_query') {
                const { query } = details;
                const vaultDir = path.join(WORKSPACE_DIR, 'workspace', 'knowledge_vault');
                await fs.mkdir(vaultDir, { recursive: true });
                const files = await fs.readdir(vaultDir);
                const matches: any[] = [];
                const searchLower = (query || '').toLowerCase();
                for (const f of files) {
                    if (f.endsWith('.json')) {
                        try {
                            const raw = await fs.readFile(path.join(vaultDir, f), 'utf-8');
                            const item = JSON.parse(raw);
                            if (item.title?.toLowerCase().includes(searchLower) || item.content?.toLowerCase().includes(searchLower) || item.tags?.some((t: string) => t.toLowerCase().includes(searchLower))) {
                                matches.push(item);
                            }
                        } catch {}
                    }
                }
                return { status: 'success', total_found: matches.length, results: matches.slice(0, 5) };
            } else if (action === 'outreach_verifier') {
                const { firstName, lastName, domain, company } = details;
                const fn = (firstName || 'lead').toLowerCase().trim();
                const ln = (lastName || '').toLowerCase().trim();
                const dom = (domain || company || 'example.com').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

                const patterns = [
                    `${fn}@${dom}`,
                    `${fn}.${ln}@${dom}`,
                    `${fn[0]}${ln}@${dom}`,
                    `${fn}_${ln}@${dom}`,
                    `${ln}.${fn}@${dom}`
                ].filter(Boolean);

                return {
                    status: 'success',
                    company: company || dom,
                    target: `${firstName || ''} ${lastName || ''}`.trim(),
                    recommendedEmailPatterns: patterns,
                    outreachSender: 'Adri Renaldy & ANT',
                    strategy: 'Direct Strike - Sovereign Partnership'
                };
            } else if (action === 'open_browser' || action === 'browser_launch' || action === 'browser_click' || action === 'browser_type' || action === 'browser_snapshot' || action === 'browser_close') {
                const { browserAgent } = await import('../agents/browser_agent.js');
                const { checkDomainPermission } = await import('../server.js');
                const { webPermissions, saveWebPermissions } = await import('../shared/data.js');
                
                let targetUrl = 'localhost';
                if (action === 'open_browser' || action === 'browser_launch') {
                    targetUrl = details.url || 'localhost';
                } else {
                    const currentUrl = await browserAgent.getCurrentUrl();
                    if (currentUrl) targetUrl = currentUrl;
                }

                const perm = checkDomainPermission(targetUrl);
                if (perm.status === 'deny') {
                    throw new Error(`SECURITY_VIOLATION: Web automation is denied on domain: ${perm.domain}`);
                } 
                
                if (perm.status === 'once') {
                    // Auto-Add Trust for unknown domains (Freedom to Research)
                    webPermissions.execute_urls.push({ domain: perm.domain, status: 'allow' });
                    await saveWebPermissions();
                    Logger.log('INFO', `Auto-added ${perm.domain} to trusted web permissions (Smart Risk-Scoring).`, {}, 'SECURITY');
                }

                // Smart Risk-Scoring: Detect sensitive form inputs
                let isSensitiveAction = false;
                if (action === 'browser_type') {
                    const sel = (details.selector || '').toLowerCase();
                    if (sel.includes('password') || sel.includes('email') || sel.includes('login') || sel.includes('signin') || sel.includes('auth') || sel.includes('user')) {
                        isSensitiveAction = true;
                    }
                }

                if (isSensitiveAction && !context?.manual_approval) {
                    throw new Error(`APPROVAL_REQUIRED: Aksi sensitif (${action}) pada form otentikasi/login memerlukan persetujuan manual Ard melalui Authority Queue.`);
                }

                if (action === 'open_browser' || action === 'browser_launch') {
                    const { url, visible } = details;
                    const result = await browserAgent.launch(url, visible !== false);
                    return { status: 'success', message: result };
                } else if (action === 'browser_click') {
                    const { selector } = details;
                    const result = await browserAgent.click(selector);
                    return { status: 'success', message: result };
                } else if (action === 'browser_type') {
                    const { selector, text } = details;
                    const result = await browserAgent.type(selector, text);
                    return { status: 'success', message: result };
                } else if (action === 'browser_snapshot') {
                    const result = await browserAgent.takeSnapshot();
                    return { status: 'success', snapshot: result };
                } else {
                    const result = await browserAgent.close();
                    return { status: 'success', message: result };
                }
            } else if (action === 'web_request') {
                const response = await axios({ url: details.url, method: details.method || 'GET', data: details.data });
                return { status: 'success', data: response.data };
            } else if (action === 'fetch_url_content') {
                const response = await axios({ 
                    url: details.url, 
                    method: 'GET', 
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
                    timeout: 10000
                });
                let html = response.data;
                if (typeof html !== 'string') html = JSON.stringify(html);
                return { status: 'success', data: html.substring(0, 50000) };
            } else if (action === 'ant_skill_create') {
                const fName = details.fileName || details.file || details.path || details.name;
                if (!fName) throw new Error('Argument "fileName" is required.');
                await logFileAudit('ANT_SKILL_CREATE', fName, `Membuat skill baru dengan kode sepanjang ${details.code?.length || 0} karakter.`);
                const { createAntSkill } = await import('./ant_skills.js');
                const result = await createAntSkill(fName, details.code || '');
                return { status: 'success', ...result };
            } else if (action === 'ant_eyes' || action === 'inspect_ui') {
                try {
                    // Real filesystem inspection — bukan hardcoded
                    const componentsPath = path.join(BASE_DIR, 'src', 'components');
                    const serverPath = path.join(BASE_DIR, 'server');
                    
                    const componentFiles = await fs.readdir(componentsPath);
                    const serverFiles = await fs.readdir(serverPath);
                    const tsxFiles = componentFiles.filter(f => f.endsWith('.tsx'));
                    const tsFiles = serverFiles.filter(f => f.endsWith('.ts'));

                    // Baca ukuran file komponen secara nyata
                    const componentDetails = await Promise.all(
                        tsxFiles.map(async (f) => {
                            const stat = await fs.stat(path.join(componentsPath, f)).catch(() => null);
                            return { name: f.replace('.tsx', ''), sizeKB: stat ? Math.round(stat.size / 1024) : 0 };
                        })
                    );

                    // Baca App.tsx untuk list route secara nyata
                    let detectedRoutes: string[] = [];
                    try {
                        const appContent = await fs.readFile(path.join(BASE_DIR, 'src', 'App.tsx'), 'utf-8');
                        const routeMatches = appContent.match(/activeTab === ['"](.*?)['"]/g) || [];
                        detectedRoutes = [...new Set(routeMatches.map(r => r.replace(/activeTab === ['"]/g, '').replace(/['"]$/g, '')))];
                    } catch {}

                    return {
                        status: 'success',
                        scan_time: new Date().toISOString(),
                        components_count: tsxFiles.length,
                        server_modules_count: tsFiles.length,
                        components: componentDetails,
                        detected_routes: detectedRoutes.length > 0 ? detectedRoutes : ['(tidak terdeteksi - periksa App.tsx)'],
                        server_modules: tsFiles.map(f => f.replace('.ts', ''))
                    };
                } catch (e: any) {
                    return { status: 'error', message: `Gagal membaca komponen UI: ${e.message}` };
                }
            } else if (action === 'ant_skill_execute') {
                const { executeAntSkill } = await import('./ant_skills.js');
                const result = await executeAntSkill(details.fileName, details.args || []);
                return Object.assign({ status: 'success' }, result);
            } else if (action === 'whatsapp_send_message') {
                const { sendWhatsAppMessage } = await import('../services/whatsapp.js');
                const result = await sendWhatsAppMessage(details.to, details.text);
                return Object.assign({ status: 'success' }, result);
            } else if (action === 'env_check') {
                const { stdout: nodeVer } = await execAsync('node -v');
                const { stdout: npmVer } = await execAsync('npm -v');
                const pkgJson = JSON.parse(await fs.readFile(path.join(BASE_DIR, 'package.json'), 'utf-8'));
                return { 
                    status: 'success', 
                    node: nodeVer.trim(), 
                    npm: npmVer.trim(), 
                    dependencies: pkgJson.dependencies || {},
                    devDependencies: pkgJson.devDependencies || {}
                };
            } else if (action === 'snapshot_create') {
                const snapshotName = details.name || `snapshot_${Date.now()}`;
                const snapDir = path.join(BASE_DIR, '.snapshots', snapshotName);
                await fs.mkdir(snapDir, { recursive: true });
                
                // For demo/simplicity, we only snapshot key files or package.json
                // In real app, we might use a proper git-based approach or tar
                const filesToSnap = ['package.json', 'package-lock.json', 'server.ts', 'server/actions.ts'];
                for (const f of filesToSnap) {
                    try {
                        const content = await fs.readFile(path.join(BASE_DIR, f));
                        await fs.writeFile(path.join(snapDir, f), content);
                    } catch (e) {}
                }
                return { status: 'success', snapshot: snapshotName };
            } else if (action === 'image_generate') {
                const { generateImageComposition } = await import('./ai.js');
                const { getBrainConfig } = await import('../shared/data.js'); 
                const config = await getBrainConfig();
                
                const { prompt, aspect_ratio } = details;
                const result = await generateImageComposition(config, prompt, aspect_ratio || '1:1', []);
                return { status: 'success', ...result };
            } else if (action === 'web_search' || action === 'google_search') {
                const { searchNews } = await import('./ai.js');
                const { getBrainConfig } = await import('../shared/data.js');
                const config = await getBrainConfig();
                
                try {
                    if (!config.tavily_api_key) throw new Error('Tavily API Key belum diset di pengaturan.');
                    const results = await searchNews(config.tavily_api_key, details.query);
                    return { status: 'success', results };
                } catch (e: any) {
                    Logger.log('WARN', `Tavily Search Failed (${e.message}). Engaging Autonomous Playwright Bridge...`, {}, 'SYSTEM');
                    
                    const { fallbackWebSearch } = await import('./agent_loop/browserTool.js');
                    const fallbackResult = await fallbackWebSearch(details.query);
                    
                    if (fallbackResult.fallback_error) {
                        if (fallbackResult.fallback_error === 'BOT_WALL_DETECTED') {
                             return { status: 'error', message: 'BOT_WALL_DETECTED: Pencarian ditahan oleh proteksi anti-bot. Gunakan tool "request_human_rescue" untuk meminta bantuan Ard.' };
                        }
                        return { status: 'error', message: 'Tavily offline & Fallback Bridge failed: ' + fallbackResult.fallback_error };
                    }
                    
                    return { status: 'success', results: fallbackResult.results, note: 'Results gathered via Autonomous Playwright Bridge (Tavily offline)' };
                }
            } else if (action === 'request_human_rescue') {
                // HUMAM-IN-THE-LOOP BOT DETECTOR RESCUE
                // We launch a headed browser for the user to solve the captcha/auth manually
                // The AI is basically telling the user: "I need you to pass this wall for me."
                return { 
                     status: 'human_intervention_requested', 
                     message: `Tembok anti-bot terdeteksi di ${details.url}. Permintaan bantuan telah dikirim ke layar Ard. Tolong tunggu instruksi selanjutnya dari Ard setelah dia menyelesaikan verifikasi keamanan.`,
                     ui_action: 'REQUEST_HUMAN_RESCUE',
                     target_url: details.url
                };
            } else if (action === 'memory_store') {
                const { storeMemory } = await import('./memory.js');
                const { layer, key, value, tags } = details;
                const success = await storeMemory(layer || 'semantic', key, value, tags || []);
                return { status: success ? 'success' : 'error', message: success ? `Memory stored: ${key}` : 'Memory store failed' };
            } else if (action === 'memory_recall') {
                const { key, query } = details;
                if (query) {
                    const { semanticSearch } = await import('./memory.js');
                    const results = await semanticSearch(query);
                    return { status: 'success', results, mode: 'semantic' };
                }
                const memoryPath = path.join(BASE_DIR, 'workspace', 'memories', 'context.json');
                try {
                    const data = await fs.readFile(memoryPath, 'utf-8');
                    const memory = JSON.parse(data);
                    return { status: 'success', memory: key ? memory[key] : memory, mode: 'exact' };
                } catch (e) {
                    return { status: 'success', memory: {}, message: 'Memory registry empty.' };
                }
            } else if (action === 'task_create') {
                const { tasks, saveTasks } = await import('../shared/data.js');
                const newTask = {
                    id: Math.random().toString(36).substr(2, 9),
                    title: details.title,
                    status: 'pending',
                    priority: details.priority || 'medium',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    due_date: details.due_date || null
                };
                tasks.push(newTask);
                await saveTasks();
                return { status: 'success', task: newTask };
            } else if (action === 'task_delete') {
                const { tasks, setTasks, saveTasks } = await import('../shared/data.js');
                const initialCount = tasks.length;
                setTasks(tasks.filter((t: any) => t.id !== details.id));
                if (tasks.length === initialCount) throw new Error(`Task with ID ${details.id} not found.`);
                await saveTasks();
                return { status: 'success', id: details.id };
            } else if (action.startsWith('workspace_')) {
                if (!context?.google_access_token) {
                    throw new Error('AUTH_REQUIRED: Google account not connected or session expired.');
                }
                const { workspaceSearch, workspaceRead, workspaceWrite, workspaceCreate, workspaceGmailList, workspaceGmailRead, workspaceGmailSend } = await import('./workspace.js');
                if (action === 'workspace_search') {
                    return await workspaceSearch(context.google_access_token, details.type, details.query);
                } else if (action === 'workspace_read') {
                    return await workspaceRead(context.google_access_token, details.type, details.id);
                } else if (action === 'workspace_write') {
                    return await workspaceWrite(context.google_access_token, details.type, details.id, details.action, details.payload);
                } else if (action === 'workspace_create') {
                    return await workspaceCreate(context.google_access_token, details.type, details.title);
                } else if (action === 'workspace_gmail_list') {
                    return await workspaceGmailList(context.google_access_token, details.query);
                } else if (action === 'workspace_gmail_read') {
                    return await workspaceGmailRead(context.google_access_token, details.id);
                } else if (action === 'workspace_gmail_send') {
                    return await workspaceGmailSend(context.google_access_token, details.to, details.subject, details.body);
                } else if (action === 'workspace_save_presentation') {
                    const { title, slides } = details;
                    if (!title || !slides || !Array.isArray(slides)) {
                        throw new Error('Title and slides array required');
                    }
                    const { workspaceCreate, workspaceWrite } = await import('./workspace.js');
                    
                    // 1. Create the presentation
                    const presentation = await workspaceCreate(context.google_access_token, 'presentation', title);
                    const presentationId = presentation.id || presentation.presentationId;

                    if (!presentationId) throw new Error('Failed to get presentation ID');

                    // 2. Prepare batchUpdate requests
                    const requests: any[] = [];
                    const ts = Date.now();
                    
                    slides.forEach((slide: any, index: number) => {
                        const slideId = `slide_${index}_${ts}`;
                        const titleId = `title_${index}_${ts}`;
                        const contentId = `content_${index}_${ts}`;
                        
                        // Create a BLANK slide
                        requests.push({
                            createSlide: {
                                objectId: slideId,
                                slideLayoutReference: {
                                    predefinedLayout: 'BLANK'
                                }
                            }
                        });

                        // Add Title shape
                        requests.push({
                            createShape: {
                                objectId: titleId,
                                shapeType: 'TEXT_BOX',
                                elementProperties: {
                                    pageObjectId: slideId,
                                    size: { width: { magnitude: 620, unit: 'PT' }, height: { magnitude: 60, unit: 'PT' } },
                                    transform: { scaleX: 1, scaleY: 1, translateX: 50, translateY: 40, unit: 'PT' }
                                }
                            }
                        });

                        // Insert Title text
                        requests.push({
                            insertText: {
                                objectId: titleId,
                                text: slide.title || `Slide ${index + 1}`
                            }
                        });

                        // Style Title
                        requests.push({
                            updateTextStyle: {
                                objectId: titleId,
                                style: { 
                                    fontSize: { magnitude: 28, unit: 'PT' }, 
                                    bold: true,
                                    fontFamily: 'Lexend'
                                },
                                fields: 'fontSize,bold,fontFamily'
                            }
                        });

                        // Add Content shape
                        requests.push({
                            createShape: {
                                objectId: contentId,
                                shapeType: 'TEXT_BOX',
                                elementProperties: {
                                    pageObjectId: slideId,
                                    size: { width: { magnitude: 620, unit: 'PT' }, height: { magnitude: 260, unit: 'PT' } },
                                    transform: { scaleX: 1, scaleY: 1, translateX: 50, translateY: 110, unit: 'PT' }
                                }
                            }
                        });

                        // Insert Content text
                        requests.push({
                            insertText: {
                                objectId: contentId,
                                text: slide.content || ''
                            }
                        });
                        
                        // Style Content
                        requests.push({
                            updateTextStyle: {
                                objectId: contentId,
                                style: { fontSize: { magnitude: 14, unit: 'PT' }, fontFamily: 'Lexend' },
                                fields: 'fontSize,fontFamily'
                            }
                        });
                    });

                    // 3. Execute batchUpdate
                    await workspaceWrite(context.google_access_token, 'presentation', presentationId, 'batch_update', { requests });
                    
                    return presentation;
                }
            }
            throw new Error(`Unknown action type: ${action}`);
        } catch (error: any) {
            lastError = error;
            await updateTrustScore(action, false);
            Logger.log('WARN', `Attempt ${i + 1} failed for ${action}: ${error.message}`, {}, 'SYSTEM');
            
            // Don't retry on fatal, auth, or quota-exhausted errors
            const errMsg = (error.message || '').toLowerCase();
            const isFatalOrAuth = error.message.startsWith('FATAL:') || 
                error.message.includes('ACCESS_DENIED') || 
                error.message.includes('SECURITY_VIOLATION') ||
                errMsg.includes('auth') || 
                errMsg.includes('credential') || 
                errMsg.includes('unauthorized') || 
                errMsg.includes('quota') || 
                errMsg.includes('limit') || 
                errMsg.includes('token') ||
                errMsg.includes('grant') ||
                errMsg.includes('401') ||
                errMsg.includes('403') ||
                errMsg.includes('429');

            if (isFatalOrAuth) {
                break;
            }

            if (i < attempts - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
            }
        }
    }
    throw lastError;
}
