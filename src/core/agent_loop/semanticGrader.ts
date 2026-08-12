export interface GradeRequest {
    codeDiff: string;
    testFileContent: string;
    testOutput: string;
    changedFiles: string[];
}

export interface GradeResult {
    accepted: boolean;
    score: number;
    reason: string;
    issues: string[];
}

/**
 * Semantic Grader - Berjalan di luar loop utama agen
 * Berperan sebagai juri independen (Fixed Judge) untuk menolak 'Weak-Test Gaming'
 */
export async function gradeTestQuality(
    request: GradeRequest,
    llmCall: (prompt: string) => Promise<string>
): Promise<GradeResult> {
    const MAX_DIFF_CHARS = 8000;
    const MAX_TEST_CHARS = 6000;
    
    const safeDiff = (request.codeDiff || "Tidak ada diff yang disediakan").slice(0, MAX_DIFF_CHARS);
    const safeTest = (request.testFileContent || "Tidak ada kode tes yang disediakan").slice(0, MAX_TEST_CHARS);
    const safeOutput = (request.testOutput || "Tidak ada output terminal yang disediakan").slice(0, 4000);

    const prompt = `
Anda adalah Sovereign Semantic Grader, juri kode independen yang ketat dan tanpa kompromi. 
Tugas Anda adalah menilai apakah sebuah Unit Test benar-benar menguji logika spesifik yang baru saja dimodifikasi, bukan sekadar tes 'dummy' yang menipu sistem.

### Code Diff (Perubahan yang baru dilakukan agen):
\`\`\`diff
${safeDiff}
\`\`\`

### File Unit Test yang Dieksekusi:
\`\`\`typescript
${safeTest}
\`\`\`

### Output Tes (Terminal):
\`\`\`
${safeOutput}
\`\`\`

### ATURAN PENILAIAN MUTLAK (FAIL-CLOSED):
1. Fokus HANYA pada pertanyaan: "Apakah unit test ini secara langsung menguji perilaku yang berubah di Code Diff?"
2. Jika Code Diff kosong atau tidak relevan dengan isi tes → TOLAK (accepted: false).
3. Jika tes hanya memanggil fungsi tanpa memeriksa nilai kembali / side effect / state yang berubah → TOLAK.
4. Jika tes hanya berisi assertion sampah/lemah seperti expect(true).toBe(true), expect(1).toBe(1), atau assertion yang terlalu generik/tidak terhubung dengan perubahan di Diff → TOLAK.
5. Jangan berikan skor di atas 40 jika tes tidak menyentuh logika inti dari Diff.
6. Anda adalah juri, bukan mentor. Jangan memberi saran perbaikan di dalam "reason". Hanya nyatakan fakta penolakan/penerimaan.
7. Anda TIDAK BOLEH memaafkan atau memberi simpati. Nilai murni dari kualitas assertion tes terhadap diff.

Anda WAJIB merespons HANYA dalam bentuk JSON murni tanpa markdown, tanpa penjelasan di luar JSON. Gunakan skema berikut:
{
  "accepted": boolean,
  "score": number (0-100),
  "reason": "Penjelasan sangat singkat (maksimal 2 kalimat) mengapa diterima/ditolak",
  "issues": ["daftar celah spesifik 1", "daftar celah spesifik 2"]
}
`.trim();

    try {
        const rawOutput = await llmCall(prompt);
        
        // Membersihkan jika LLM membocorkan tag markdown
        const cleanedOutput = rawOutput.replace(/\`\`\`json/gi, '').replace(/\`\`\`/g, '').trim();
        const parsed = JSON.parse(cleanedOutput);
        
        // Shape Validation (Defense-in-depth)
        if (
            typeof parsed.accepted !== 'boolean' ||
            typeof parsed.score !== 'number' ||
            typeof parsed.reason !== 'string'
        ) {
            throw new Error('Invalid GradeResult shape returned by Judge Model');
        }

        // Hard rule tambahan: Tolak jika skor terlalu rendah walaupun status diterima
        if (parsed.accepted && parsed.score < 60) {
            parsed.accepted = false;
            parsed.reason += ' | [SYSTEM REJECT] Score too low for acceptance (Minimum 60).';
        }

        return {
            accepted: parsed.accepted,
            score: parsed.score,
            reason: parsed.reason,
            issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        };
    } catch (e: any) {
        // FAIL-CLOSED BEHAVIOR: 
        // Jika model Judge gagal menjawab dengan JSON valid atau API timeout, 
        // kita paksa penolakan. Agent tidak boleh lewat karena grader rusak.
        return {
            accepted: false,
            score: 0,
            reason: 'Sovereign Semantic Grader mengalami kegagalan sistem saat parsing JSON. Dianggap gagal (Fail-Closed).',
            issues: ['Grader output unparseable / System timeout', e.message]
        };
    }
}
