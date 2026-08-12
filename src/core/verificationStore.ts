import fs from 'fs/promises';
import path from 'path';
import { ApprovalStore, ApprovalRecord } from './verificationGuard.js';

export class FileApprovalStore implements ApprovalStore {
    private filePath = path.join(process.cwd(), 'workspace', 'registry', 'approval_ledger.json');

    private async readDb(): Promise<Record<string, ApprovalRecord>> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return {};
        }
    }

    private async writeDb(data: Record<string, ApprovalRecord>) {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true }).catch(() => {});
        await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
    }

    async save(record: ApprovalRecord): Promise<void> {
        const db = await this.readDb();
        db[record.actionId] = record;
        await this.writeDb(db);
    }

    async get(actionId: string): Promise<ApprovalRecord | null> {
        const db = await this.readDb();
        return db[actionId] || null;
    }

    async listPending(): Promise<ApprovalRecord[]> {
        const db = await this.readDb();
        return Object.values(db).filter(r => r.status === 'PENDING_APPROVAL');
    }
}
