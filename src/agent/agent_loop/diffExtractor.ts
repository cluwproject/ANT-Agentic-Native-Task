import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DiffResult {
    diff: string;
    source: 'git' | 'memory' | 'none';
    changedFiles: string[];
}

/**
 * Mengambil Code Diff terbaru untuk Semantic Grader.
 * Prioritas:
 * 1. git diff (paling bersih)
 * 2. Fallback ke perbandingan in-memory / snapshot dari Evidence Ledger (sederhana)
 */
export async function getRecentCodeDiff(options: {
    workingDir?: string;
    changedFiles?: string[];           
    memorySnapshots?: Record<string, string>; 
}): Promise<DiffResult> {
    const cwd = options.workingDir || process.cwd();

    // ---------- Prioritas 1: Git Diff ----------
    try {
        execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'ignore' });

        const gitDiff = execSync('git diff HEAD --no-color --unified=5', {
            cwd,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024 * 2, // 2MB
        });

        if (gitDiff.trim().length > 0) {
            const changedFiles = extractChangedFilesFromGitDiff(gitDiff);
            return {
                diff: gitDiff,
                source: 'git',
                changedFiles,
            };
        }

        if (options.changedFiles && options.changedFiles.length > 0) {
            const filesArg = options.changedFiles.map(f => `"${f}"`).join(' ');
            const specificDiff = execSync(
                `git diff HEAD --no-color --unified=5 -- ${filesArg}`,
                { cwd, encoding: 'utf-8', maxBuffer: 1024 * 1024 }
            );

            if (specificDiff.trim().length > 0) {
                return {
                    diff: specificDiff,
                    source: 'git',
                    changedFiles: options.changedFiles,
                };
            }
        }
    } catch (err) {
        // Bukan git repo atau git tidak tersedia → fallback
    }

    // ---------- Prioritas 2: Fallback In-Memory / Snapshot ----------
    if (options.memorySnapshots && options.changedFiles?.length) {
        const diffs: string[] = [];
        const validChanged: string[] = [];

        for (const filePath of options.changedFiles) {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
            const oldContent = options.memorySnapshots[filePath] || options.memorySnapshots[absolutePath] || '';
            let newContent = '';
            
            try {
                newContent = fs.readFileSync(absolutePath, 'utf-8');
            } catch {
                continue; 
            }

            if (oldContent !== newContent) {
                const simpleDiff = createSimpleUnifiedDiff(filePath, oldContent, newContent);
                diffs.push(simpleDiff);
                validChanged.push(filePath);
            }
        }

        if (diffs.length > 0) {
            return {
                diff: diffs.join('\n\n'),
                source: 'memory',
                changedFiles: validChanged,
            };
        }
    }

    return {
        diff: '',
        source: 'none',
        changedFiles: options.changedFiles || [],
    };
}

function extractChangedFilesFromGitDiff(diff: string): string[] {
    const files = new Set<string>();
    const regex = /^diff --git a\/(.+?) b\/(.+)$/gm;
    let match;
    while ((match = regex.exec(diff)) !== null) {
        files.add(match[2]); 
    }
    return Array.from(files);
}

function createSimpleUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    return [
        `--- a/${filePath}`,
        `+++ b/${filePath}`,
        `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
        ...oldLines.map(l => `-` + l),
        ...newLines.map(l => `+` + l),
    ].join('\n');
}

/**
 * Mengambil isi file unit test yang baru saja dijalankan.
 */
export async function getTestFileContent(options: {
    testPath?: string;           
    workingDir?: string;
    fallbackContent?: string;      
}): Promise<string> {
    const cwd = options.workingDir || process.cwd();

    if (options.testPath) {
        const candidates = [
            options.testPath,
            path.join(cwd, options.testPath),
            path.resolve(cwd, options.testPath),
        ];

        for (const candidate of candidates) {
            try {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    return fs.readFileSync(candidate, 'utf-8');
                }
            } catch {
                // Ignore errors
            }
        }
    }

    if (options.fallbackContent) {
        return options.fallbackContent;
    }

    return '';
}
