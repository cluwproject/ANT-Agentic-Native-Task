import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { evidenceLocker } from '../agent_loop/evidenceLocker.js';
import { Logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

export async function logFileAudit(baseDir: string, action: string, file: string, detail: string) {
    try {
        const auditLogPath = path.join(baseDir, 'workspace', 'registry', 'audit.log');
        await fs.mkdir(path.dirname(auditLogPath), { recursive: true }).catch(() => {});
        const logEntry = `[${new Date().toISOString()}] ACTION: ${action} | FILE: ${file} | DETAILS: ${detail}\n`;
        await fs.appendFile(auditLogPath, logEntry, 'utf-8');
    } catch (e: any) {
        Logger.log('ERROR', `Failed to write audit log: ${e.message}`, {}, 'SECURITY');
    }
}

export async function handleFileOps(action: string, details: any, workspaceDir: string, baseDir: string, context?: any) {
    if (action === 'read_file') {
        const fileName = details.file || details.path;
        if (!fileName) throw new Error('Argument "file" or "path" must be string and is required.');
        const targetPath = path.resolve(workspaceDir, fileName);
        if (!targetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');
        if (targetPath.includes('.env')) throw new Error('ACCESS_DENIED: .env files are protected.');
        
        let realTargetPath: string;
        try {
            realTargetPath = await fs.realpath(targetPath).catch(() => targetPath);
        } catch { realTargetPath = targetPath; }
        if (!realTargetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Symlink traversal detected.');
        
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
        
        let result = content;
        if (details.startLine !== undefined || details.endLine !== undefined) {
            const start = details.startLine ? Math.max(0, details.startLine - 1) : 0;
            const end = details.endLine ? Math.min(lines.length, details.endLine) : lines.length;
            result = lines.slice(start, end).join('\n');
        } else if (lines.length > 500) {
            result = lines.slice(0, 500).join('\n') + '\n\n... [TRUNCATED - PLEASE USE startLine AND endLine FOR MORE]';
        }
        
        return { status: 'success', content: result, totalLines: lines.length };
    } 
    
    if (action === 'list_dir') {
        // Resolve path: if absolute, use as-is; if relative, anchor to workspaceDir
        const rawPath = details.path || '.';
        const targetPath = path.isAbsolute(rawPath)
            ? path.resolve(rawPath)
            : path.resolve(workspaceDir, rawPath);

        // list_dir is READ-ONLY — allow absolute paths for directory exploration.
        // Only block sensitive system dirs that should never be enumerated.
        const blockedPaths = ['/proc', '/sys', '/dev'];
        if (blockedPaths.some(bp => targetPath.startsWith(bp))) {
            throw new Error(`ACCESS_DENIED: Path '${rawPath}' is a protected system directory.`);
        }
        
        try {
            const stats = await fs.stat(targetPath);
            if (!stats.isDirectory()) {
                throw new Error(`ENOTDIR: '${rawPath}' bukan direktori. Gunakan 'read_file' untuk membaca isinya.`);
            }
            const files = await fs.readdir(targetPath);
            return { status: 'success', files };
        } catch (e: any) {
            if (e.code === 'ENOENT') throw new Error(`ENOENT: Direktori '${rawPath}' tidak ditemukan.`);
            throw e;
        }
    } 

    if (action === 'create_file') {
        const fileName = details.file || details.path;
        if (!fileName) throw new Error('Argument "file" or "path" is required for create_file.');
        const targetPath = path.resolve(workspaceDir, fileName);
        if (!targetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');
        if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');

        const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
        if (exists && !details.overwrite) {
            throw new Error(`FILE_EXISTS: File '${fileName}' already exists. Use overwrite:true to replace it.`);
        }

        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        const content = details.content ?? '';
        await fs.writeFile(targetPath, content, 'utf-8');
        await logFileAudit(baseDir, 'CREATE_FILE', fileName, 'File baru dibuat.');
        return { status: 'success', file: fileName, message: `File '${fileName}' berhasil dibuat (${content.length} chars).` };
    } 

    if (action === 'create_dir') {
        const dirName = details.path || details.dir;
        if (!dirName) throw new Error('Argument "path" or "dir" is required for create_dir.');
        const targetPath = path.resolve(workspaceDir, dirName);
        if (!targetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');

        await fs.mkdir(targetPath, { recursive: true });
        await logFileAudit(baseDir, 'CREATE_DIR', dirName, 'Direktori baru dibuat.');
        return { status: 'success', path: dirName, message: `Direktori '${dirName}' berhasil dibuat.` };
    } 

    if (action === 'modify_file' || action === 'write_file') {
        const fileName = details.file || details.path;
        if (!fileName) throw new Error('Argument "file" or "path" must be string and is required.');
        const targetPath = path.resolve(workspaceDir, fileName);
        if (!targetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');
        if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');
        
        try {
            const realModPath = await fs.realpath(path.dirname(targetPath)).catch(() => path.dirname(targetPath));
            if (!realModPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Symlink traversal detected.');
        } catch (e: any) { if (e.message.includes('ACCESS_DENIED')) throw e; }

        try {
            const stats = await fs.stat(targetPath).catch(() => null);
            if (stats && stats.isDirectory()) {
                throw new Error(`EISDIR: Cannot write file to a directory path '${fileName}'.`);
            }
        } catch (e: any) { throw e; }

        await logFileAudit(baseDir, 'MODIFY_FILE', fileName, `Menulis/mengubah file dengan isi sepanjang ${details.content?.length || 0} karakter.`);
        evidenceLocker.captureBefore(context?.sessionId || 'default-session', targetPath);

        await fs.mkdir(path.dirname(targetPath), { recursive: true }).catch(() => {});
        await fs.writeFile(targetPath, details.content);
        return { status: 'success', file: fileName };
    } 

    if (action === 'edit_file') {
        const fileName = details.file || details.path;
        if (!fileName) throw new Error('Argument "file" or "path" must be string and is required.');
        const targetPath = path.resolve(workspaceDir, fileName);
        if (!targetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');
        if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');
        
        try {
            const realModPath = await fs.realpath(path.dirname(targetPath)).catch(() => path.dirname(targetPath));
            if (!realModPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Symlink traversal detected.');
        } catch (e: any) { if (e.message.includes('ACCESS_DENIED')) throw e; }

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
        evidenceLocker.captureBefore(context?.sessionId || 'default-session', targetPath);

        await fs.writeFile(targetPath, content);
        await logFileAudit(baseDir, 'EDIT_FILE', fileName, `Melakukan bedah presisi (patch) pada file.`);
        return { status: 'success', file: fileName, message: 'File successfully patched.' };
    } 

    if (action === 'patch_file') {
        const fileName = details.file || details.path;
        if (!fileName) throw new Error('Argument "file" or "path" is required for patch_file.');
        if (details.start_line === undefined || details.end_line === undefined) {
            throw new Error('Arguments "start_line" and "end_line" are required for patch_file.');
        }
        if (details.new_content === undefined) throw new Error('Argument "new_content" is required for patch_file.');

        const targetPath = path.resolve(workspaceDir, fileName);
        if (!targetPath.startsWith(workspaceDir)) throw new Error('ACCESS_DENIED: Path outside workspace.');
        if (targetPath.includes('node_modules') || targetPath.includes('.env')) throw new Error('ACCESS_DENIED: Sensitive path.');

        const originalContent = await fs.readFile(targetPath, 'utf-8');
        const lines = originalContent.split('\n');
        const startLine = Math.max(1, details.start_line) - 1;
        const endLine = Math.min(lines.length, details.end_line);

        const bakPath = targetPath + '.bak';
        await fs.writeFile(bakPath, originalContent, 'utf-8');

        const removedLines = lines.slice(startLine, endLine);
        const newLines = String(details.new_content).split('\n');
        const diffPreview = [
            ...removedLines.slice(0, 5).map(l => `- ${l}`),
            ...(removedLines.length > 5 ? [`  ... (${removedLines.length - 5} more removed lines)`] : []),
            ...newLines.slice(0, 5).map(l => `+ ${l}`),
            ...(newLines.length > 5 ? [`  ... (${newLines.length - 5} more added lines)`] : []),
        ].join('\n');

        const patchedLines = [
            ...lines.slice(0, startLine),
            ...newLines,
            ...lines.slice(endLine)
        ];
        await fs.writeFile(targetPath, patchedLines.join('\n'), 'utf-8');
        await logFileAudit(baseDir, 'PATCH_FILE', fileName, `Line ${details.start_line}-${details.end_line} diganti (${removedLines.length}→${newLines.length} baris). Backup: ${fileName}.bak`);
        return {
            status: 'success',
            file: fileName,
            backup: `${fileName}.bak`,
            lines_replaced: `${details.start_line}-${details.end_line}`,
            diff_preview: diffPreview,
            message: `Patch applied. ${removedLines.length} lines replaced with ${newLines.length} lines. Backup saved as ${fileName}.bak`
        };
    } 

    if (action === 'git_status') {
        const cwd = details.path ? path.resolve(workspaceDir, details.path) : baseDir;
        try {
            const { stdout } = await execAsync('git status --short --branch', { cwd });
            return { status: 'success', tool: 'git_status', output: stdout.trim() };
        } catch (e: any) {
            return { status: 'error', message: `Git tidak tersedia atau bukan repo: ${e.message}` };
        }
    } 

    if (action === 'git_diff') {
        const cwd = details.path ? path.resolve(workspaceDir, details.path) : baseDir;
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
    } 

    if (action === 'git_log') {
        const cwd = details.path ? path.resolve(workspaceDir, details.path) : baseDir;
        const n = Math.min(details.n || 10, 50);
        try {
            const { stdout } = await execAsync(`git log --oneline --decorate -n ${n}`, { cwd });
            return { status: 'success', tool: 'git_log', output: stdout.trim() };
        } catch (e: any) {
            return { status: 'error', message: `git log gagal: ${e.message}` };
        }
    } 

    if (action === 'git_commit' || action === 'git_checkpoint') {
        const cwd = details.path ? path.resolve(workspaceDir, details.path) : baseDir;
        const message = details.message || `ANT Checkpoint: ${new Date().toISOString()}`;
        const files = details.files || '.';
        try {
            await execAsync(`git add ${files}`, { cwd });
            const { stdout } = await execAsync(`git commit -m ${JSON.stringify(message)}`, { cwd });
            return { status: 'success', tool: 'git_commit', message: `Checkpoint tersimpan: "${message}"`, output: stdout.trim() };
        } catch (e: any) {
            return { status: 'error', message: `git commit gagal (mungkin tidak ada perubahan yang di-stage): ${e.message}` };
        }
    } 

    if (action === 'syntax_check') {
        const fileName = details.file || details.path;
        const target = fileName ? `${fileName}` : '';
        try {
            const { stdout } = await execAsync(`npx tsc --noEmit ${target}`, { cwd: baseDir });
            return { status: 'success', message: 'No TypeScript syntax errors found.', output: stdout };
        } catch (e: any) {
            return { status: 'error', message: 'Syntax errors found:', output: e.stdout || e.message };
        }
    }

    return null;
}
