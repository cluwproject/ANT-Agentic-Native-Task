import fs from 'fs/promises';
import path from 'path';
import { logFileAudit } from './file_ops.js';

export async function handleSkillOps(action: string, details: any, workspaceDir: string, baseDir: string) {
    if (action === 'ant_skill_create') {
        const fName = details.fileName || details.file || details.path || details.name;
        if (!fName) throw new Error('Argument "fileName" is required.');
        await logFileAudit(baseDir, 'ANT_SKILL_CREATE', fName, `Membuat skill baru dengan kode sepanjang ${details.code?.length || 0} karakter.`);
        const { createAntSkill } = await import('../ant_skills.js');
        const result = await createAntSkill(fName, details.code || '');
        return { status: 'success', ...result };
    }

    if (action === 'ant_skill_execute') {
        const { executeAntSkill } = await import('../ant_skills.js');
        const result = await executeAntSkill(details.fileName, details.args || []);
        return Object.assign({ status: 'success' }, result);
    }

    if (action === 'ant_eyes' || action === 'inspect_ui') {
        try {
            const componentsPath = path.join(baseDir, 'src');
            const files = await fs.readdir(componentsPath).catch(() => []);
            return {
                status: 'success',
                scan_time: new Date().toISOString(),
                files_count: files.length,
                files: files.slice(0, 20)
            };
        } catch (e: any) {
            return { status: 'error', message: `Gagal membaca komponen UI: ${e.message}` };
        }
    }

    if (action === 'knowledge_add') {
        const { title, category, content, tags } = details;
        const vaultDir = path.join(workspaceDir, 'workspace', 'knowledge_vault');
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
    }

    if (action === 'knowledge_query') {
        const { query } = details;
        const vaultDir = path.join(workspaceDir, 'workspace', 'knowledge_vault');
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
    }

    if (action === 'memory_store') {
        const { storeMemory } = await import('../memory.js');
        const { layer, key, value, tags } = details;
        const success = await storeMemory(layer || 'semantic', key, value, tags || []);
        return { status: success ? 'success' : 'error', message: success ? `Memory stored: ${key}` : 'Memory store failed' };
    }

    if (action === 'memory_recall') {
        const { key, query } = details;
        if (query) {
            const { semanticSearch } = await import('../memory.js');
            const results = await semanticSearch(query);
            return { status: 'success', results, mode: 'semantic' };
        }
        const memoryPath = path.join(baseDir, 'workspace', 'memories', 'context.json');
        try {
            const data = await fs.readFile(memoryPath, 'utf-8');
            const memory = JSON.parse(data);
            return { status: 'success', memory: key ? memory[key] : memory, mode: 'exact' };
        } catch (e) {
            return { status: 'success', memory: {}, message: 'Memory registry empty.' };
        }
    }

    if (action === 'task_create') {
        const { tasks, saveTasks } = await import('../../shared/data.js');
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
    }

    if (action === 'task_delete') {
        const { tasks, setTasks, saveTasks } = await import('../../shared/data.js');
        const initialCount = tasks.length;
        setTasks(tasks.filter((t: any) => t.id !== details.id));
        if (tasks.length === initialCount) throw new Error(`Task with ID ${details.id} not found.`);
        await saveTasks();
        return { status: 'success', id: details.id };
    }

    if (action === 'image_generate') {
        const { generateImageComposition } = await import('../ai.js');
        const { getBrainConfig } = await import('../../shared/data.js'); 
        const config = await getBrainConfig();
        const { prompt, aspect_ratio } = details;
        const result = await generateImageComposition(config, prompt, aspect_ratio || '1:1', []);
        return { status: 'success', ...result };
    }

    if (action === 'gemini_analyze_image') {
        const { analyzeImage } = await import('../ai.js');
        const { getBrainConfig } = await import('../../shared/data.js'); 
        const config = await getBrainConfig();
        const { prompt, image } = details;
        let base64Image = image;
        if (image && (await fs.stat(image).catch(() => null))) {
            base64Image = (await fs.readFile(image)).toString('base64');
        }
        const text = await analyzeImage(config, prompt, base64Image);
        return { status: 'success', text };
    }

    return null;
}
