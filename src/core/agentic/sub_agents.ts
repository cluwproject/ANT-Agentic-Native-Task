import { Logger } from '../../utils/logger.js';
import { chat } from '../ai/index.js';

export interface SubAgentDefinition {
    role: string;
    description: string;
    systemPrompt: string;
    allowedTools: string[];
}

export const SUB_AGENT_REGISTRY: Record<string, SubAgentDefinition> = {
    researcher: {
        role: 'researcher',
        description: 'Sub-agen riset: mengumpulkan informasi dari web, file, dan dokumentasi.',
        systemPrompt: 'Kamu adalah Sub-Agen Research ANT. Tugasmu mencari informasi, membaca file, dan menyajikan ringkasan fakta yang presisi.',
        allowedTools: ['read_file', 'grep_search', 'web_search', 'fetch_url_content', 'list_dir']
    },
    coder: {
        role: 'coder',
        description: 'Sub-agen pemrogram: menulis, mengedit, dan memperbaiki kode.',
        systemPrompt: 'Kamu adalah Sub-Agen Coder ANT. Tugasmu menulis kode berkualitas tinggi, melakukan refaktorisasi, dan memperbaiki syntax error.',
        allowedTools: ['read_file', 'modify_file', 'edit_file', 'patch_file', 'syntax_check']
    },
    tester: {
        role: 'tester',
        description: 'Sub-agen penguji: menjalankan verifikasi, typecheck, dan tes sistem.',
        systemPrompt: 'Kamu adalah Sub-Agen Tester ANT. Tugasmu memverifikasi kode, menguji command shell, dan memastikan tidak ada error.',
        allowedTools: ['syntax_check', 'shell_exec', 'git_status']
    },
    planner: {
        role: 'planner',
        description: 'Sub-agen perencanaan: memecah tugas kompleks menjadi langkah-langkah terstruktur.',
        systemPrompt: 'Kamu adalah Sub-Agen Planner ANT. Tugasmu menyusun rencana eksekusi HTN yang efisien dan logis.',
        allowedTools: ['read_file', 'list_dir']
    }
};

export async function spawnSubAgent(role: string, task: string, brain: any, contextHistory: any[] = []): Promise<{ role: string; output: string; status: 'success' | 'error' }> {
    const subAgent = SUB_AGENT_REGISTRY[role.toLowerCase()] || SUB_AGENT_REGISTRY.researcher;
    
    Logger.log('INFO', `Spawning Sub-Agent [${subAgent.role.toUpperCase()}] for task: "${task.slice(0, 60)}..."`, {}, 'SUB_AGENT');

    const subMessages = [
        ...contextHistory.slice(-2),
        { role: 'user', content: `[SUB-TASK ASIGNMENT FOR ${subAgent.role.toUpperCase()}]\n${task}` }
    ];

    try {
        const response = await chat(
            brain,
            subMessages,
            [],
            {},
            subAgent.systemPrompt,
            brain.custom_model || 'gemini-2.0-flash',
            `SubAgent:${subAgent.role}`
        );

        const content = typeof response === 'string' ? response : response.content;
        Logger.log('INFO', `Sub-Agent [${subAgent.role.toUpperCase()}] finished task successfully.`, {}, 'SUB_AGENT');
        
        return {
            role: subAgent.role,
            output: content,
            status: 'success'
        };
    } catch (e: any) {
        Logger.log('ERROR', `Sub-Agent [${subAgent.role.toUpperCase()}] failed: ${e.message}`, {}, 'SUB_AGENT');
        return {
            role: subAgent.role,
            output: `Gagal menjalankan sub-task: ${e.message}`,
            status: 'error'
        };
    }
}
