// ============================================================================
// ANT — CLI Argv — One-Shot (Headless) Invocation Parser
// ============================================================================
// Parser murni untuk mode headless/scriptable ala Claude Code & Gemini CLI:
//   ant -p "<task>"                          → jalankan tugas sekali lalu keluar
//   ant -p "<task>" --output-format json     → hasil terstruktur untuk CI/script
//   ant -p "<task>" --sandbox                → tandai eksekusi terisolasi
//
// Dipisah dari router.ts supaya bisa di-unit-test tanpa menyentuh proses.
// ============================================================================

export interface OneShotInvocation {
    prompt: string;
    outputFormat: 'text' | 'json';
    sandbox: boolean;
}

/**
 * Parse argumen CLI menjadi OneShotInvocation, atau null jika tidak ada
 * flag -p/--prompt (berarti bukan one-shot).
 *
 * Contoh:
 *   parseOneShotArgs(['-p', 'fix bug'])          → { prompt: 'fix bug', ... }
 *   parseOneShotArgs(['--prompt','x','--output-format','json'])
 */
export function parseOneShotArgs(args: string[]): OneShotInvocation | null {
    let prompt: string | null = null;
    let outputFormat: 'text' | 'json' = 'text';
    let sandbox = false;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-p' || arg === '--prompt') {
            if (i + 1 >= args.length) {
                throw new Error('Opsi -p/--prompt membutuhkan argumen prompt.');
            }
            prompt = args[i + 1];
            i++;
        } else if (arg === '--output-format') {
            if (i + 1 >= args.length) {
                throw new Error('Opsi --output-format membutuhkan nilai (text|json).');
            }
            const fmt = String(args[i + 1]).toLowerCase();
            if (fmt !== 'text' && fmt !== 'json') {
                throw new Error(`Nilai --output-format tidak valid: "${args[i + 1]}". Gunakan "text" atau "json".`);
            }
            outputFormat = fmt;
            i++;
        } else if (arg === '--sandbox') {
            sandbox = true;
        }
    }

    if (prompt === null) return null;
    return { prompt, outputFormat, sandbox };
}
