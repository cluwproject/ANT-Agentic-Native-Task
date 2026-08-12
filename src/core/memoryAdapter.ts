import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * AI-Ready Data Platform:
 * Memory Adapter Interface untuk ANT.
 * 
 * Mengikuti filosofi "Flexible Solutions" (Poin 5 materi GEAR Google),
 * Adapter ini memisahkan logika AI dari format penyimpanan memori (JSON/Database).
 * Jika suatu saat CLUW bermigrasi ke database sungguhan (PostgreSQL/pgvector/Pinecone),
 * kita cukup membuat class baru yang mengimplementasikan `IMemoryStore`.
 */
export interface IMemoryItem {
    id: string;
    content: string;
    role: string;
    sessionId: string;
    context: string;
    rememberedAt: string;
}

export interface IMemoryStore {
    init(): Promise<void>;
    addMemory(item: Omit<IMemoryItem, 'id' | 'rememberedAt'>): Promise<IMemoryItem>;
    getMemories(limit?: number): Promise<IMemoryItem[]>;
    deleteMemory(id: string): Promise<boolean>;
}

export class JsonMemoryStore implements IMemoryStore {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    async init(): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true }).catch(() => {});
        try {
            await fs.access(this.filePath);
        } catch {
            await fs.writeFile(this.filePath, JSON.stringify({ items: [] }, null, 2));
        }
    }

    async addMemory(data: Omit<IMemoryItem, 'id' | 'rememberedAt'>): Promise<IMemoryItem> {
        await this.init();
        let db: any = { items: [] };
        try { db = JSON.parse(await fs.readFile(this.filePath, 'utf-8')); } catch {}
        
        const item: IMemoryItem = {
            id: uuidv4(),
            ...data,
            rememberedAt: new Date().toISOString()
        };
        
        db.items.unshift(item);
        db.items = db.items.slice(0, 100); // Cap at 100
        
        await fs.writeFile(this.filePath, JSON.stringify(db, null, 2));
        return item;
    }

    async getMemories(limit: number = 100): Promise<IMemoryItem[]> {
        await this.init();
        try {
            const db = JSON.parse(await fs.readFile(this.filePath, 'utf-8'));
            return (db.items || []).slice(0, limit);
        } catch {
            return [];
        }
    }

    async deleteMemory(id: string): Promise<boolean> {
        await this.init();
        try {
            const db = JSON.parse(await fs.readFile(this.filePath, 'utf-8'));
            const initialLength = db.items.length;
            db.items = db.items.filter((i: any) => i.id !== id);
            
            if (db.items.length !== initialLength) {
                await fs.writeFile(this.filePath, JSON.stringify(db, null, 2));
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }
}
