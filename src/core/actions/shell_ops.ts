import fs from 'fs/promises';
import path from 'path';
import vm from 'vm';
import { promisify } from 'util';
import { exec } from 'child_process';
import { Logger } from '../../utils/logger.js';
import { logFileAudit } from './file_ops.js';

const execAsync = promisify(exec);

const SHELL_BLOCKLIST_REGEX = /\b(rm\s+-[rRfFri]+|curl\s+[^|]*\|\s*(sh|bash|zsh)|wget\s+[^|]*\|\s*(sh|bash|zsh)|chmod\s+777|cat\s+.*\.env|base64\s+-d\s+.*\||eval\s*\(|exec\s*\(|mkfs|shutdown|reboot|dd\s+if=|passwd|useradd|usermod|visudo)\b/i;
const NPM_PACKAGE_SAFE_REGEX = /^(@[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9._-]+([@][a-zA-Z0-9._^~><=*-]+)?$/;

export async function handleShellOps(action: string, details: any, workspaceDir: string, baseDir: string, context?: any, isHighTrust = false) {
    if (action === 'run_tests') {
        const command = details.command || process.env.ANT_TEST_COMMAND || 'npm test';
        if (!/\b(?:npm|pnpm|yarn|node)\b/.test(command)) {
            throw new Error('SECURITY_VIOLATION: run_tests hanya menerima perintah test Node.js yang disetujui.');
        }
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: baseDir,
                timeout: 120000,
                signal: context?.abortSignal
            });
            return { status: 'success', command, stdout, stderr, exitCode: 0 };
        } catch (error: any) {
            return {
                status: 'error', command, error: error.message,
                stdout: error.stdout || '', stderr: error.stderr || '',
                exitCode: typeof error.code === 'number' ? error.code : 1
            };
        }
    }

    if (action === 'execute_js') {
        const outputLines: string[] = [];
        const sandboxConsole = { 
            log: (...args: any[]) => outputLines.push(args.map(String).join(' ')),
            error: (...args: any[]) => outputLines.push('[ERR] ' + args.map(String).join(' ')),
            warn: (...args: any[]) => outputLines.push('[WARN] ' + args.map(String).join(' '))
        };
        const sandbox = vm.createContext({ console: sandboxConsole, Math, JSON, Array, Object, String, Number, Boolean, Date });
        try {
            const script = new vm.Script(details.code, { filename: 'ant_sandbox.js' });
            script.runInContext(sandbox, { timeout: 5000 });
            return { status: 'success', stdout: outputLines.join('\n'), stderr: '' };
        } catch (vmError: any) {
            if (vmError.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
                throw new Error('SECURITY_VIOLATION: JS execution timed out (5s limit). Possible infinite loop.');
            }
            throw vmError;
        }
    }

    if (action === 'grep_search') {
        const query = details.query || details.pattern;
        if (!query) throw new Error('Argument "query" is required for grep_search.');
        const searchPath = details.path ? path.resolve(workspaceDir, details.path) : workspaceDir;
        if (!searchPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');

        const include = details.include ? `--include="${details.include}"` : '';
        const caseFlag = details.case_insensitive ? '-i' : '';
        const maxResults = Math.min(details.max_results || 50, 200);

        try {
            const rgCmd = `rg --json -m ${maxResults} ${caseFlag} ${include} ${JSON.stringify(query)} ${JSON.stringify(searchPath)} 2>/dev/null | head -c 50000`;
            const { stdout: rgOut } = await execAsync(rgCmd, { cwd: baseDir }).catch(() => ({ stdout: '' }));
            if (rgOut.trim()) {
                const lines = rgOut.trim().split('\n').filter(Boolean);
                const results: any[] = [];
                for (const line of lines) {
                    try {
                        const obj = JSON.parse(line);
                        if (obj.type === 'match') {
                            results.push({
                                file: path.relative(workspaceDir, obj.data.path.text),
                                line: obj.data.line_number,
                                content: obj.data.lines.text.trim()
                            });
                        }
                    } catch {}
                }
                return { status: 'success', tool: 'grep_search', engine: 'ripgrep', results, count: results.length };
            }
        } catch {}

        try {
            const grepCmd = `grep -rn ${caseFlag} ${include} --max-count=${maxResults} ${JSON.stringify(query)} ${JSON.stringify(searchPath)} 2>/dev/null | head -200`;
            const { stdout } = await execAsync(grepCmd, { cwd: baseDir });
            const results = stdout.trim().split('\n').filter(Boolean).map(l => {
                const m = l.match(/^(.+?):(\d+):(.*)$/);
                if (m) return { file: path.relative(workspaceDir, m[1]), line: parseInt(m[2]), content: m[3].trim() };
                return { file: l, line: 0, content: '' };
            });
            return { status: 'success', tool: 'grep_search', engine: 'grep', results, count: results.length };
        } catch (e: any) {
            return { status: 'success', tool: 'grep_search', engine: 'grep', results: [], count: 0, message: 'No matches found.' };
        }
    }

    if (action === 'npm_install') {
        const pkg = details.package;
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
            if (npmError.message.includes('404')) {
                throw new Error(`FATAL: Package '${pkg}' tidak ditemukan di registry npm (404).`);
            }
            throw npmError;
        }
    }

    if (action === 'create_cron_task') {
        const { addCustomSchedule } = await import('../scheduler.js');
        const cron = details.cron;
        const command = details.command;
        if (!cron || !command) throw new Error('Argument "cron" dan "command" wajib untuk create_cron_task.');
        const taskId = await addCustomSchedule(cron, command);
        return { status: 'success', taskId, message: `Task '${command}' dijadwalkan dengan cron '${cron}' (ID: ${taskId}).` };
    }

    if (action === 'shell_exec' || action === 'exec') {
        const command = details.command;
        const isModificationCmd = /[\x3E\x7C]|\b(rm|mv|cp|sed|truncate|chmod|chown|tee|git|write|delete)\b/i.test(command);
        if (isModificationCmd) {
            await logFileAudit(baseDir, 'SHELL_EXEC_MODIFY', 'shell', `Menjalankan perintah shell modifikasi: "${command}"`);
        }
        if (SHELL_BLOCKLIST_REGEX.test(command)) {
            throw new Error('SECURITY_VIOLATION: Command pattern matches restricted operations. Blocked by ANT Sovereign Shield.');
        }
        
        if (/\b(trust\.shadow)\b/i.test(command) && /[\x3E\x7C]|\b(rm|mv|cp|sed|truncate|chmod|chown|tee|git)\b/i.test(command)) {
            throw new Error('SECURITY_VIOLATION: Direct writes or modifications to the trust.shadow system file via shell commands are strictly prohibited.');
        }

        if (!context?.manual_approval && !isHighTrust) {
            Logger.log('WARN', `Shell command blocked pending approval: ${command.slice(0, 80)}`, {}, 'SECURITY');
            const isReadOnly = /^(ls|pwd|echo|cat\s+(?!.*\.env)|node\s+-v|npm\s+-v|git\s+log|git\s+status|git\s+diff|which|type|find\s+.*-name|grep\s+.*-r)/.test(command.trim());
            if (!isReadOnly) {
                throw new Error('APPROVAL_REQUIRED: Shell command requires explicit manual approval from Ard. Use Security Gates.');
            }
        }

        try {
            const { stdout, stderr } = await execAsync(command, { timeout: 30000, signal: context?.abortSignal });
            return { status: 'success', stdout, stderr, exitCode: 0 };
        } catch (cmdError: any) {
            return { status: 'error', error: cmdError.message, stdout: cmdError.stdout || '', stderr: cmdError.stderr || '', exitCode: typeof cmdError.code === 'number' ? cmdError.code : 1 };
        }
    }

    if (action === 'env_check') {
        const { stdout: nodeVer } = await execAsync('node -v');
        const { stdout: npmVer } = await execAsync('npm -v');
        const pkgJson = JSON.parse(await fs.readFile(path.join(baseDir, 'package.json'), 'utf-8'));
        return { 
            status: 'success', 
            node: nodeVer.trim(), 
            npm: npmVer.trim(), 
            dependencies: pkgJson.dependencies || {},
            devDependencies: pkgJson.devDependencies || {}
        };
    }

    if (action === 'snapshot_create') {
        const snapshotName = details.name || `snapshot_${Date.now()}`;
        const snapDir = path.join(baseDir, '.snapshots', snapshotName);
        await fs.mkdir(snapDir, { recursive: true });
        
        const filesToSnap = ['package.json', 'package-lock.json', 'src/core/cli.ts'];
        for (const f of filesToSnap) {
            try {
                const content = await fs.readFile(path.join(baseDir, f));
                await fs.writeFile(path.join(snapDir, f), content);
            } catch (e) {}
        }
        return { status: 'success', snapshot: snapshotName };
    }

    return null;
}
