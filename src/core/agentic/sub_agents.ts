import { Logger } from '../../utils/logger.js';
import { chat } from '../ai/index.js';
import type { ChatMessage } from '../agent_loop/types.js';

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
    },
    // S3 Sprint Roles:
    scaffolder: {
        role: 'scaffolder',
        description: 'Ahli inisialisasi project, boilerplate, dan konfigurasi infrastruktur dasar.',
        systemPrompt: `Kamu adalah agen spesialis "Scaffolder". Tugas utamamu adalah merancang pondasi proyek secara efisien dan tepat sasaran.\n- Kamu ahli dalam instalasi dependensi, pembuatan struktur direktori, dan penyusunan build-tools.\n- Fokus pada pembentukan kerangka utama sesuai instruksi.\n- Segera serahkan pekerjaan yang lebih spesifik kepada Frontend/Backend setelah kerangka siap.`,
        allowedTools: ['shell_exec', 'read_file', 'write_file', 'list_dir']
    },
    frontend: {
        role: 'frontend',
        description: 'Spesialis antarmuka pengguna (UI), React, Next.js, dan interaktivitas.',
        systemPrompt: `Kamu adalah agen spesialis "Frontend Engineer". Tugas utamamu adalah menulis komponen antarmuka yang bersih, fungsional, dan sesuai dengan best practice UI modern.\n- Kamu sangat ahli dengan framework klien seperti React, Next.js, TailwindCSS.\n- Fokusmu merender state, menangani aksi pengguna, dan styling.\n- Kamu TIDAK mengelola skema database. Jangan pernah menulis atau merombak Prisma schema atau logika inti backend.`,
        allowedTools: ['read_file', 'modify_file', 'edit_file', 'patch_file', 'syntax_check']
    },
    backend: {
        role: 'backend',
        description: 'Spesialis logika server, database, API routing, dan keamanan data.',
        systemPrompt: `Kamu adalah agen spesialis "Backend Engineer". Tugas utamamu adalah menyusun logika bisnis di sisi server, mengamankan rute API, dan merancang interaksi database.\n- Kamu sangat mumpuni dengan Node.js, Prisma ORM, SQL, Express/Next API routes.\n- Fokusmu: integritas data, validasi payload, serta stabilitas endpoints.\n- JANGAN menyentuh komponen antarmuka (frontend components/pages). Fokus murni pada backend plumbing.`,
        allowedTools: ['read_file', 'modify_file', 'edit_file', 'patch_file', 'syntax_check']
    },
    integrator: {
        role: 'integrator',
        description: 'Tech Lead / Integrator yang menggabungkan hasil kerja spesialis menjadi aplikasi utuh.',
        systemPrompt: `Kamu adalah "Full-Stack Integrator". Tugasmu bukan membuat semuanya dari awal, melainkan merakit, men-debug, dan memverifikasi integrasi dari sistem-sistem yang telah dibangun oleh rekan agen spesialis.\n- Kamu harus memverifikasi kontrak komunikasi (misalnya memastikan fetch call di frontend sudah match dengan response API di backend).\n- Lakukan penyelesaian bug antar-sistem dengan elegan.\n- Ketika menyempurnakan fitur end-to-end, pastikan pipeline CI/CD/build dapat lewat tanpa masalah.`,
        allowedTools: ['read_file', 'modify_file', 'edit_file', 'patch_file', 'syntax_check', 'shell_exec', 'list_dir', 'grep_search']
    }
};

/**
 * Sub-Agent v2: menjalankan sub-agen sebagai AGENT LOOP PENUH (ala Claude
 * Code Task tool) — punya akses tool, konteks terisolasi per-peran, dan
 * kebijakan approval non-interaktif:
 *   - Default   : tool berisiko OTOMATIS DITOLAK (hanya SAFE_TOOLS jalan)
 *   - ANT_SUBAGENT_AUTO_APPROVE=true : semua approval di-auto-approve (yakin?)
 *
 * Mode lama (prompt-only tanpa tool) tetap tersedia via ANT_SUBAGENT_MODE=legacy.
 * Rekursi dibatasi maksimal 2 tingkat agar tidak spawn-bomb.
 */
let activeSubAgents = 0;

export async function spawnSubAgent(
    role: string,
    task: string,
    brain: any,
    contextHistory: any[] = []
): Promise<{ role: string; output: string; status: 'success' | 'error' }> {
    const subAgent = SUB_AGENT_REGISTRY[role.toLowerCase()] || SUB_AGENT_REGISTRY.researcher;

    Logger.log('INFO', `Spawning Sub-Agent [${subAgent.role.toUpperCase()}] for task: "${task.slice(0, 60)}..."`, {}, 'SUB_AGENT');

    // --- MODE LEGACY (tanpa tool access, hemat RAM untuk Termux) ---
    if ((process.env.ANT_SUBAGENT_MODE || '').toLowerCase() === 'legacy') {
        return spawnSubAgentLegacy(subAgent, task, brain, contextHistory);
    }

    // --- GUARD REKURSI ---
    if (activeSubAgents >= 2) {
        Logger.log('WARN', `Sub-agent nesting ditolak (${activeSubAgents} aktif). Maksimal 2 tingkat.`, {}, 'SUB_AGENT');
        return {
            role: subAgent.role,
            output: `[SUB-AGENT LIMIT] Kedalaman sub-agent sudah mencapai batas (${activeSubAgents}). Tugas ini dieksekusi langsung tanpa nested loop.`,
            status: 'error'
        };
    }

    const roleMessage = getSubAgentSystemMessage(subAgent.role);
    const isolatedContext = roleMessage ? [roleMessage] : [];

    // Kebijakan approval non-interaktif: default DENY untuk tool sensitif;
    // hanya SAFE_TOOLS (read_file, list_dir, dll) yang lolos otomatis.
    const interactiveAnswer =
        (process.env.ANT_SUBAGENT_AUTO_APPROVE || '').toLowerCase() === 'true'
            ? async (_q: string) => 'a'
            : async (_q: string) => 'n';

    activeSubAgents++;
    try {
        // Impor CORE loop langsung agar bisa menyuntikkan askQuestion
        // non-interaktif (facade index.ts selalu pakai readline interaktif).
        const { runCliAgentLoop: runCoreLoop } = await import('../agent_loop/agentLoop.js');
        const result = await runCoreLoop(
            `[SUB-TASK ASIGNMENT FOR ${subAgent.role.toUpperCase()}]\n${task}`,
            isolatedContext,
            interactiveAnswer,
            { maxAttempts: parseInt(process.env.ANT_SUBAGENT_MAX_ITERATIONS || '8', 10) || 8 }
        );
        const lastAssistant = [...result.messages].reverse().find(m => m.role === 'assistant');
        const output = lastAssistant?.content ?? '(sub-agent selesai tanpa output teks)';
        Logger.log('INFO', `Sub-Agent [${subAgent.role.toUpperCase()}] finished. completed=${result.completed}, attempts=${result.attemptsUsed}`, {}, 'SUB_AGENT');
        return { role: subAgent.role, output, status: 'success' };
    } catch (e: any) {
        Logger.log('ERROR', `Sub-Agent [${subAgent.role.toUpperCase()}] failed: ${e.message}`, {}, 'SUB_AGENT');
        return { role: subAgent.role, output: `Gagal menjalankan sub-task: ${e.message}`, status: 'error' };
    } finally {
        activeSubAgents--;
    }
}

/** Jalur lama: satu panggilan chat() tanpa tool loop. */
async function spawnSubAgentLegacy(
    subAgent: SubAgentDefinition,
    task: string,
    brain: any,
    contextHistory: any[]
): Promise<{ role: string; output: string; status: 'success' | 'error' }> {
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
        return { role: subAgent.role, output: content, status: 'success' };
    } catch (e: any) {
        Logger.log('ERROR', `Sub-Agent [${subAgent.role.toUpperCase()}] failed: ${e.message}`, {}, 'SUB_AGENT');
        return { role: subAgent.role, output: `Gagal menjalankan sub-task: ${e.message}`, status: 'error' };
    }
}

export function getSubAgentSystemMessage(roleId: string): ChatMessage | null {
    const role = SUB_AGENT_REGISTRY[roleId.toLowerCase()];
    if (!role) return null;
    return {
        role: 'system',
        content: `[PERAN SPESIALIS DIAKTIFKAN: ${role.role.toUpperCase()}]\n\n${role.systemPrompt}\n\nIngat: Terapkan peranmu secara penuh. Tolak permintaan jika itu jelas di luar batas kewenangan peranmu, atau delegasikan kembali secara implisit dalam rencana eksekusi.`
    };
}
