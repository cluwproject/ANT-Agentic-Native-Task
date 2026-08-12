import { tieredChat } from '../tiered_ai.js';
import { getBrainConfig } from '../../shared/data.js';
import { GradeResult } from './semanticGrader.js';

export interface JudgeRequest {
    diff: string;
    testContent: string;
    taskDescription: string;
}

/**
 * SovereignJudgeBridge
 * "Ruang sidang" yang terisolasi untuk Juri.
 * Memanggil model independen dengan temperature 0 untuk objektivitas mutlak.
 */
export async function callJudgeModel(prompt: string): Promise<string> {
    const brain = await getBrainConfig();

    const judgeSystemPrompt = `Kamu adalah Juri Kualitas Kode dalam sistem Sovereign Shield.
Tugasmu: Menilai apakah unit test benar-benar menguji perubahan kode yang dilakukan.
Aturan mutlak:
1. Kamu tidak boleh tahu siapa agen yang menulis kode ini.
2. Kamu tidak boleh mempertimbangkan "niat baik" — hanya fakta kode.
3. Jika tes tidak menguji logika baru (hanya expect(true).toBe(true)), FAIL/TOLAK.
4. Output HARUS dalam JSON murni (tanpa tag markdown) dengan schema: { "accepted": boolean, "score": number, "reason": "string", "issues": string[] }`;

    try {
        // Kita paksa menggunakan model Claude atau model andalan dengan suhu 0 (logis ketat).
        // Parameter contextMessages dan attachments kosong untuk isolasi penuh.
        const result = await tieredChat(
            brain, 
            [{ role: 'user', content: prompt }], 
            [], 
            { temperature: 0 }, 
            judgeSystemPrompt,
            'claude-3-5-sonnet-20241022' // Preferred judge model, fallback automatically handled by tieredChat
        );
        return result.content;
    } catch (e: any) {
        throw new Error(`Judge Model gagal merespons: ${e.message}`);
    }
}
