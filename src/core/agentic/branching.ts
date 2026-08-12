import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../../utils/logger.js';

export interface ConversationBranch {
    name: string;
    createdAt: string;
    parentSessionId: string;
    history: any[];
}

const BRANCH_DIR = path.join(process.cwd(), 'workspace', 'branches');

export async function createBranch(branchName: string, sessionId: string, history: any[]): Promise<string> {
    await fs.mkdir(BRANCH_DIR, { recursive: true });
    const filePath = path.join(BRANCH_DIR, `${branchName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
    const branchData: ConversationBranch = {
        name: branchName,
        createdAt: new Date().toISOString(),
        parentSessionId: sessionId,
        history: [...history]
    };

    await fs.writeFile(filePath, JSON.stringify(branchData, null, 2), 'utf-8');
    Logger.log('INFO', `Branch '${branchName}' created with ${history.length} messages.`, {}, 'BRANCHING');
    return filePath;
}

export async function listBranches(): Promise<string[]> {
    try {
        await fs.mkdir(BRANCH_DIR, { recursive: true });
        const files = await fs.readdir(BRANCH_DIR);
        return files.filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
    } catch {
        return [];
    }
}

export async function loadBranch(branchName: string): Promise<ConversationBranch | null> {
    try {
        const filePath = path.join(BRANCH_DIR, `${branchName.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}
