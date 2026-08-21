import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export async function saveCliSession(sessionId: string, history: any[]): Promise<void> {
    try {
        const sessionFile = path.join(process.cwd(), 'workspace', 'sessions', `${sessionId}.json`);
        await fs.promises.mkdir(path.dirname(sessionFile), { recursive: true });
        await fs.promises.writeFile(sessionFile, JSON.stringify({
            id: sessionId,
            name: `CLI Companion - ${new Date().toLocaleString()}`,
            timestamp: new Date().toISOString(),
            messages: history
        }, null, 2));
    } catch {
        // Silently ignore
    }
}

export function injectProjectContext(): string {
    const cwd = process.cwd();
    const pkgJsonPath = path.join(cwd, 'package.json');
    let projectSummary = '';
    
    if (fs.existsSync(pkgJsonPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            projectSummary = `Project: ${pkg.name || path.basename(cwd)} (v${pkg.version || '0.1.0'})\nDescription: ${pkg.description || 'N/A'}`;
        } catch {}
    } else {
        projectSummary = `Directory: ${path.basename(cwd)} (Path: ${cwd})`;
    }
    return projectSummary;
}
