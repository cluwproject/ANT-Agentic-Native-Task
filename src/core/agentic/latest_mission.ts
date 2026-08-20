import fs from 'fs/promises';
import path from 'path';

export async function getLatestMissionId(): Promise<string | null> {
    const missionsDir = path.join(process.cwd(), 'workspace', 'missions');
    try {
        const files = await fs.readdir(missionsDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        if (jsonFiles.length === 0) return null;

        // Get file stats to sort by modification time
        const fileStats = await Promise.all(jsonFiles.map(async file => {
            const stat = await fs.stat(path.join(missionsDir, file));
            return { file, mtime: stat.mtimeMs };
        }));

        // Sort descending by time
        fileStats.sort((a, b) => b.mtime - a.mtime);
        
        // Remove .json extension
        return fileStats[0].file.replace('.json', '');
    } catch (e) {
        return null;
    }
}
