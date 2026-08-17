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
    },
    'gray-1': {
        role: 'gray-1',
        description: 'Spesialis Memory & Logic (ANT-CYBER-CORPS).',
        systemPrompt: 'Kamu adalah GRAY-1, unit elit ANT-CYBER-CORPS spesialis Memory & Logic. Tugasmu mengaudit logika aplikasi, memory leaks, dan state management.',
        allowedTools: ['read_file', 'grep_search', 'syntax_check']
    },
    'gray-2': {
        role: 'gray-2',
        description: 'Spesialis OSINT Username & Profiling (ANT-CYBER-CORPS).',
        systemPrompt: 'Kamu adalah GRAY-2, unit elit ANT-CYBER-CORPS spesialis OSINT Sosial. Tugasmu melacak jejak digital target, mencocokkan identitas lintas platform menggunakan alat seperti cross_platform_scanner.js.',
        allowedTools: ['read_file', 'shell_exec', 'web_search']
    },
    'gray-3': {
        role: 'gray-3',
        description: 'Spesialis OSINT Email Intelligence (ANT-CYBER-CORPS).',
        systemPrompt: 'Kamu adalah GRAY-3, unit elit ANT-CYBER-CORPS spesialis Intelijen Email. Tugasmu mengekstrak data MX records, Gravatar, dan kebocoran akun via Holehe menggunakan email_analyzer.js.',
        allowedTools: ['read_file', 'shell_exec', 'web_search']
    },
    'gray-4': {
        role: 'gray-4',
        description: 'Spesialis Infrastruktur & DNS (ANT-CYBER-CORPS).',
        systemPrompt: 'Kamu adalah GRAY-4, unit elit ANT-CYBER-CORPS spesialis Infrastruktur. Tugasmu melakukan enumerasi DNS, Whois, pemindaian port, dan membedah topologi server target.',
        allowedTools: ['read_file', 'grep_search', 'shell_exec']
    },
    'gray-5': {
        role: 'gray-5',
        description: 'Spesialis Deep/Dark Web Reconnaissance (ANT-CYBER-CORPS).',
        systemPrompt: 'Kamu adalah GRAY-5, unit elit ANT-CYBER-CORPS spesialis Deep Web. Tugasmu mencari kebocoran data tersembunyi, memantau jaringan Tor (.onion), dan mengekstrak sinyal dari forum bawah tanah.',
        allowedTools: ['read_file', 'shell_exec', 'web_search']
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
            brain.custom_model || 'gemma4:31b-cloud',
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
