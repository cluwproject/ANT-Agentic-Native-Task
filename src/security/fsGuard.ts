import path from 'path';
import fs from 'fs/promises';
import { Logger } from './logger.js';

const BASE_DIR = process.cwd();
const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');

/**
 * Resolves a given path relative to the workspace directory.
 * Throws an error if the path points outside of the workspace directory.
 */
export function resolveWorkspacePath(targetPath: string): string {
    const absolutePath = path.isAbsolute(targetPath)
        ? path.normalize(targetPath)
        : path.normalize(path.join(WORKSPACE_DIR, targetPath));
    
    // Prevent directory traversal attacks
    if (!absolutePath.startsWith(WORKSPACE_DIR)) {
        const errorMsg = `Security violation: Path '${targetPath}' resolves outside the allowed workspace directory.`;
        Logger.log('ERROR', errorMsg, { targetPath, resolved: absolutePath }, 'SECURITY');
        throw new Error(errorMsg);
    }
    
    return absolutePath;
}

/**
 * Writes a verified artifact file to the workspace.
 * Automatically resolves the workspace path and creates any necessary parent directories.
 */
export async function writeVerifiedArtifact(targetPath: string, content: string): Promise<void> {
    try {
        const resolvedPath = resolveWorkspacePath(targetPath);
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, content, 'utf-8');
        Logger.log('INFO', `Successfully wrote verified artifact`, { path: targetPath }, 'SECURITY');
    } catch (e: any) {
        Logger.log('ERROR', `Failed to write verified artifact: ${e.message}`, { targetPath }, 'SECURITY');
        throw e;
    }
}
