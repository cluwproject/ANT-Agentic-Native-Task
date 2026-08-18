// ============================================================================
// ANT — CLI Agent Loop — Shared Types
// ============================================================================
// Definisi tipe bersama untuk seluruh modul CLI agent loop (ui, parser,
// permissions, contextManager, agentLoop, index). Dipisah ke sini supaya
// tidak ada duplikasi struct antar modul.

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface RoutingMetadata {
    model?: string;
    provider?: string;
    tier?: string;
    reason?: string;
}

export interface ToolCall {
    tool: string;
    args: Record<string, any>;
}

export type ApprovalDecision = 'approved' | 'denied' | 'auto';

export interface ApprovalResult {
    decision: ApprovalDecision;
    isSafe: boolean;
    reason?: string;
}

export interface LoopOptions {
    /** Batas jumlah iterasi loop. Default: 15 (sama seperti versi lama). */
    maxAttempts?: number;
    /**
     * Batas jumlah pesan dalam riwayat sebelum dipangkas oleh contextManager.
     * Jika tidak diisi, pemangkasan tidak dijalankan (perilaku sama seperti
     * versi lama — tidak ada bounding).
     */
    maxContextMessages?: number;
    /** Batas karakter hasil tool sebelum dipotong. Default: 5000. */
    maxToolResultChars?: number;
}

export interface LoopResult {
    messages: ChatMessage[];
    /** true jika agent berhenti sendiri (bukan karena limit/cancel). */
    completed: boolean;
    attemptsUsed: number;
    /** true jika dihentikan paksa lewat SIGINT. */
    cancelled: boolean;
}
