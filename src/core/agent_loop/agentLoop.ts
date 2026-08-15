// ============================================================================
// ANT — CLI Agent Loop — Core Orchestration
// ============================================================================
// Loop inti: panggil model → render output → deteksi tool call → minta
// approval → eksekusi → lanjut. Modul ini sengaja "bodoh" secara tampilan
// (didelegasikan ke ui.ts) dan "bodoh" secara parsing (didelegasikan ke
// toolCallParser.ts) supaya setiap bagian bisa diganti sendiri-sendiri
// tanpa merombak keseluruhan file — pola layered architecture ala Claude
// Code (surface / core / safety / state) dan pola tool-as-actor ala OpenCode.
//
// PERUBAHAN UTAMA vs versi lama:
//  1. Logger yang dulu diimpor tapi tidak pernah dipakai, sekarang benar-benar
//     mencatat setiap keputusan (approve/deny/error) — ini fondasi "Glass Box
//     reasoning logger" yang Anda sebut sebagai komponen inti ANT.
//  2. MAX_ATTEMPTS yang habis tidak lagi diam-diam menghentikan loop — user
//     diberi tahu secara eksplisit.
//  3. Ctrl+C (SIGINT) ditangani dengan bersih, bukan langsung mematikan proses.
//  4. Tool call parsing pakai brace-matching yang benar (lihat toolCallParser.ts).
//  5. Context window bisa dipangkas lewat contextManager.ts (opsional, lewat
//     LoopOptions.maxContextMessages).

import { tieredChat } from '../tiered_ai.js';
import chalk from 'chalk';
import { getBrainConfig } from '../../shared/data.js';
import { executeAction } from '../actions.js';
import { Logger } from '../../utils/logger.js';
import fs from 'fs';
import path from 'path';

import * as ui from './ui.js';
import { parseToolCall } from './toolCallParser.js';
import { requestApproval } from './permissions.js';
import { boundMessages, truncateToolResult } from './contextManager.js';
import { recordEvidence, renderEvidenceTags } from './evidenceLedger.js';
import { verifyEvidenceClaims, buildCorrectionMessage } from './verificationGuard.js';
import { isBrowserTool, executeBrowserAction } from './browserTool.js';
import type { ChatMessage, LoopOptions, LoopResult } from './types.js';

// --- Sovereign Shield Imports ---
import { callJudgeModel } from './judgeBridge.js';
import { gradeTestQuality } from './semanticGrader.js';
import { getRecentCodeDiff, getTestFileContent } from './diffExtractor.js';
import { evidenceLocker } from './evidenceLocker.js';

const DEFAULT_MAX_ATTEMPTS = 15;
// Batas percobaan perbaikan khusus saat verification guard menolak respons,
// dihitung terpisah dari attempts biasa supaya tidak "mencuri" jatah langkah
// tool-call yang legit.
const MAX_VERIFICATION_RETRIES = 3;

export function getSystemInstruction(): string {
    try {
        const configPath = path.join(process.cwd(), 'config', 'ant_identity.json');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(content);
            if (config && config.instruction) {
                return config.instruction;
            }
        }
    } catch (e) {
        safeLog('warn', 'Gagal membaca ant_identity.json, menggunakan fallback default', { error: String(e) });
    }

    return `[CONTEXT: TERMINAL CLI AGENT]\n` +
    `Anda sedang berjalan dalam mode Terminal CLI (Auto-Pilot) langsung di komputer Ard.\n` +
    `Berbeda dengan Web UI atau Telegram, Anda memiliki kebebasan penuh untuk memanggil alat/tool.\n` +
    `Gunakan format JSON block dengan key "tool" dan "args" untuk memanggil aksi.\n` +
    `Contoh eksekusi perintah shell:\n` +
    `\`\`\`json\n` +
    `{\n` +
    `  "tool": "shell_exec",\n` +
    `  "args": { "command": "npm -v" }\n` +
    `}\n` +
    `\`\`\`\n` +
    `Gunakan tag <thought> untuk berpikir sebelum bertindak. Fokus selesaikan tugas Ard!\n\n` +
    `[ATURAN PANGGILAN ALAT — WAJIB DIPATUHI]\n` +
    `- DILARANG KERAS berjanji "aku akan mengerjakannya di latar belakang" atau "sambil kamu istirahat aku akan buatkan". Anda TIDAK MEMILIKI thread latar belakang mandiri! Jika user meminta membuat file, script, atau roadmap, Anda WAJIB LANGSUNG memanggil tool di giliran ini juga!\n` +
    `- UNTUK MEMBUAT ATAU MENULIS FILE: SELALU gunakan tool \`write_file\` (dengan properti \`file\` dan \`content\`). DILARANG menggunakan \`cat << 'EOF'\` atau \`printf\` di \`shell_exec\` karena rentan memicu Security Violation atau shell escape error.\n` +
    `- Untuk melakukan tindakan (termasuk mengeksekusi skill atau membaca URL), Anda WAJIB memanggil JSON block atau tag <action>. Menulis narasi "Aku akan mengeksekusi X" tanpa memanggil tool TIDAK AKAN mengeksekusi apa pun!\n` +
    `- Jika Ard meminta menjalankan skill (misal: "gunakan skill social_resolver"), jalankan via shell_exec (misal: node social_resolver.cjs).\n` +
    `- Jika Ard memberikan URL, SELALU gunakan tool \`fetch_url_content\` untuk melihat isinya terlebih dahulu, jangan pernah berasumsi Anda tidak bisa membaca URL.\n` +
    `- Jangan pernah mengasumsikan keberhasilan eksekusi tool sebelum tool tersebut benar-benar dijalankan dan hasilnya dikembalikan kepada Anda di giliran berikutnya.\n\n` +
    `[ATURAN PENCARIAN FILE & STRUKTUR LINUX — WAJIB DIPATUHI]\n` +
    `- Sadari lingkungan sistem: Di Linux, direktori home untuk user 'root' berada di '/root' (atau '~' / '$HOME'), BUKAN '/home/root'. Direktori '/home' hanya untuk user biasa non-root.\n` +
    `- Saat mencari file/folder proyek yang diminta user (misal: cluwgenesis, ant-cli), JANGAN PERNAH menjalankan perintah 'find /' dari root OS tanpa batas karena akan memindai seluruh OS (/proc, /sys, dll) dan terkena batas waktu timeout (30s).\n` +
    `- Utamakan pencarian cepat terarah: periksa direktori induk '..', home user '/root' atau '~' (misal: 'find ~ -maxdepth 3 -name "*nama*"' atau 'ls -d /root/*nama* 2>/dev/null').\n\n` +
    `[ATURAN BUKTI — WAJIB DIPATUHI]\n` +
    `Anda TIDAK PERNAH boleh menulis sendiri: hash SHA-256, status "file berhasil dibaca", ` +
    `dimensi/metadata screenshot, atau klaim verifikasi lain. Nilai-nilai itu HANYA boleh berasal ` +
    `dari hasil tool yang benar-benar Anda panggil. Setelah tool dieksekusi, sistem akan memberi ` +
    `Anda tag [EVID:xxxxxxxx] — gunakan tag itu di respons Anda untuk merujuk bukti tersebut. ` +
    `Jangan pernah mengarang tag atau nilai bukti apa pun.\n\n` +
    `[TROUBLESHOOTING & SELF-HEALING KNOWLEDGE]\n` +
    `Anda memiliki pengetahuan kognitif untuk mendiagnosis dan memperbaiki masalah sistem ANT secara mandiri:\n` +
    `- Jika terjadi masalah koneksi API atau Telegram Bot terhenti akibat konflik sesi (409 Conflict), carilah dan matikan proses node duplikat, atau periksa file .env.\n` +
    `- Jika halaman Web UI berguncang atau lambat di browser mobile, pastikan komponen visual ThinkingIndicator menggunakan properti isStreaming agar otomatis menciut saat respons mengalir.\n` +
    `- Jika halaman Web UI melakukan refresh otomatis saat diminimalkan di HP, sarankan penggunaan mode produksi (npm run build && npm run start) guna menonaktifkan koneksi WebSocket Vite HMR yang sensitif terhadap suspend jaringan mobile.\n` +
    `- Jika berjalan di HP/Termux, ketahuilah bahwa Playwright tidak didukung di Termux native (harus dijalankan di Proot Ubuntu dengan Chromium Linux ARM64 plus opsi --no-sandbox), gunakan termux-open untuk membuka link URL, dan aktifkan termux-wake-lock agar server latar belakang tetap hidup.\n` +
    `- Selalu baca dan periksa file log di workspace/activity.log untuk mendiagnosis kesalahan sistem secara mandiri.`;
}

// Tetap module-level seperti versi lama, supaya notifikasi "brain switch"
// terdeteksi lintas panggilan runCliAgentLoop dalam proses yang sama.
let lastModelUsed = '';

/**
 * Wrapper aman untuk Logger: nama method (info/warn/error/debug) disesuaikan
 * dengan implementasi utils/logger.js milik Anda. Kalau signature aslinya
 * beda (mis. Logger.log(level, msg) bukan Logger.info(msg)), cukup ubah
 * fungsi ini saja — seluruh sisa file tidak perlu disentuh. Logger tidak
 * boleh membuat loop utama crash hanya gara-gara gagal mencatat.
 */
function safeLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Record<string, any>) {
    try {
        const fn = (Logger as any)?.[level];
        if (typeof fn === 'function') {
            fn.call(Logger, message, meta);
        }
    } catch {
        // sengaja diam — logging gagal bukan alasan menghentikan agent
    }
}

export async function runCliAgentLoop(
    initialMessage: string,
    contextMsgs: ChatMessage[] = [],
    askQuestion: (q: string) => Promise<string>,
    options: LoopOptions = {}
): Promise<LoopResult> {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const maxContextMessages = options.maxContextMessages;
    const maxToolResultChars = options.maxToolResultChars;

    const brain = await getBrainConfig();
    const sessionId = `sess-${Date.now()}`;

    let currentMessages: ChatMessage[] = [...contextMsgs, { role: 'user', content: initialMessage }];
    let attempts = 0;
    let cancelled = false;
    let verificationRetries = 0;

    const onSigint = () => {
        cancelled = true;
        ui.printCancelled();
    };
    process.once('SIGINT', onSigint);

    safeLog('info', 'CLI agent loop dimulai', { initialMessage });

    // --- AUTO-ROUTE: RESEARCH & DEEP THINK MODE ---
    // Hanya aktif jika user menggunakan kata kerja perintah secara eksplisit
    const researchTriggerRegex = /\b(tolong|coba|lakukan|bantu|mulai)\s+riset\b/i;
    const isResearchMode = researchTriggerRegex.test(initialMessage);
    
    let baseSystemInstruction = getSystemInstruction();
    if (isResearchMode) {
        console.log(chalk.magenta.bold('\n🧠 [Auto-Route] Deteksi intensi "Riset". Mengaktifkan Deep Think Protocol & Analisis Mendalam...'));
        baseSystemInstruction += `\n\n[MODE RISET OTOMATIS AKTIF]
User telah memicu mode riset. Ikuti aturan mutlak berikut:
1. Gunakan mode penalaran mendalam (Deep Think) untuk mengeksplorasi masalah ini.
2. Wajib berikan label/header "🔎 HASIL RISET (DEEP THINK)" di awal jawaban akhirmu.
3. Wajib cantumkan daftar "Sumber Data" di bagian akhir jawaban (sebutkan file, web, atau memori yang kamu gunakan).`;
    }

    try {
        while (attempts < maxAttempts && !cancelled) {
            const spinner = ui.startSpinner('ANT Sedang Memproses...');
            const startTime = Date.now();

            let response: string;
            let metadata: any;
            try {
                if (maxContextMessages) {
                    currentMessages = boundMessages(currentMessages, maxContextMessages);
                }
                const result = await tieredChat(brain, currentMessages, [], {}, baseSystemInstruction);
                response = result.content;
                metadata = result.metadata;
            } catch (err: any) {
                spinner.stop();
                ui.printConnectionError(err.message);
                safeLog('error', 'Gagal memanggil tieredChat', { error: err.message });
                break;
            }

            spinner.stop();

            const durationSec = Math.max(1, Math.round((Date.now() - startTime) / 1000));
            const totalChars = currentMessages.reduce((acc, m) => acc + (m.content?.length || 0), 0) + response.length;
            const estimatedTokens = Math.round(totalChars / 3.7);

            if (metadata) {
                lastModelUsed = ui.printRoutingStatus(metadata, lastModelUsed);
            }

            const thoughtMatch = response.match(/<thought>([\s\S]*?)<\/thought>/i);
            if (thoughtMatch) {
                ui.printThought(thoughtMatch[1], durationSec, estimatedTokens);
            }

            const { toolCalls, cleanedText, parseError } = parseToolCall(response);

            if (parseError && toolCalls.length === 0) {
                ui.printToolParseFailure();
                safeLog('warn', 'Gagal parse tool call dari respons model, memicu perbaikan format', { response });
                currentMessages.push({ role: 'assistant', content: response });
                currentMessages.push({
                    role: 'user',
                    content: `[SYSTEM TOOL REPAIR PROMPT]\nFormat tool call JSON yang Anda keluarkan tidak dapat di-parse atau rusak.\n` +
                             `PANDUAN EKSEKUSI:\n` +
                             `1. DILARANG berjanji 'akan mengerjakan di latar belakang' — panggil tool SEKARANG.\n` +
                             `2. Untuk menulis file, gunakan tool "write_file" dengan format:\n` +
                             `\`\`\`json\n{\n  "tool": "write_file",\n  "args": { "file": "nama_file.js", "content": "isi_file" }\n}\n\`\`\`\n` +
                             `3. Untuk perintah terminal, gunakan "shell_exec".\n` +
                             `Keluarkan tool call yang valid sekarang!`
                });
                attempts++;
                continue;
            }

            // Gerbang verifikasi: tolak teks yang mengklaim bukti tanpa
            // rujukan [EVID:id] yang valid ke ledger nyata. Ini yang
            // mencegah model menulis hash/status file karangan dan
            // menampilkannya seolah-olah hasil eksekusi tool sungguhan.
            const guardResult = verifyEvidenceClaims(cleanedText);
            if (!guardResult.passed) {
                safeLog('warn', 'Verification guard menolak respons (klaim bukti tidak terverifikasi)', {
                    violations: guardResult.violations,
                    rawResponse: response
                });

                if (verificationRetries >= MAX_VERIFICATION_RETRIES) {
                    ui.printConnectionError(
                        `Model berulang kali menghasilkan klaim bukti yang tidak dapat diverifikasi ` +
                        `(${verificationRetries}x). Loop dihentikan — periksa manual sebelum lanjut.`
                    );
                    safeLog('error', 'Verification retries habis, loop dihentikan demi keamanan data', {
                        verificationRetries
                    });
                    break;
                }

                verificationRetries++;
                currentMessages.push({ role: 'assistant', content: response });
                currentMessages.push({ role: 'user', content: buildCorrectionMessage(guardResult.violations) });
                attempts++;
                continue;
            }

            const genDurationMs = Math.max(100, Date.now() - startTime);
            const genDurationSec = (genDurationMs / 1000).toFixed(1);
            const outputTokens = Math.max(1, Math.round(cleanedText.length / 3.7));
            const speedTokPerSec = (outputTokens / (genDurationMs / 1000)).toFixed(1);

            const renderedText = renderEvidenceTags(cleanedText);
            await ui.printAssistantText(renderedText, {
                durationSec: genDurationSec,
                tokens: outputTokens,
                speed: speedTokPerSec
            });

            if (toolCalls.length === 0) {
                // --- GUARD: ANTI-BACKGROUND-HALU ---
                const backgroundPromiseRegex = /(di\s+latar\s+belakang|di\s+balik\s+layar|sambil\s+.*istirahat|aku\s+akan\s+(terus\s+)?(membuat|membangun|menyiapkan|menulis|menyusun|mengumpulkan)\s+.*(nanti|di\s+latar|di\s+balik))/i;
                if (backgroundPromiseRegex.test(cleanedText)) {
                    safeLog('warn', 'Anti-Hallucination Guard menolak janji latar belakang palsu', { cleanedText });
                    currentMessages.push({ role: 'assistant', content: response });
                    currentMessages.push({
                        role: 'user',
                        content: `[SYSTEM SOVEREIGN DIRECTIVE — NO BACKGROUND HALU]\n` +
                                 `PERINGATAN: DILARANG menjanjikan eksekusi di latar belakang atau sambil user istirahat!\n` +
                                 `Anda TIDAK MEMILIKI background worker otomatis. Anda adalah agen terminal reaktif.\n` +
                                 `Jika Anda menyatakan akan membuat folder, script, dataset, atau roadmap, Anda WAJIB LANGSUNG memanggil tool sekarang:\n` +
                                 `- Gunakan 'write_file' untuk menulis file/script/dataset.\n` +
                                 `- Gunakan 'shell_exec' untuk menjalankan perintah terminal.\n` +
                                 `Keluarkan blok JSON tool sekarang untuk mengeksekusinya secara nyata!`
                    });
                    attempts++;
                    continue;
                }

                // --- GUARD 2: FRESHNESS VALIDATOR ---
                const { validateFreshness } = await import('./freshnessValidator.js');
                const freshness = validateFreshness();
                if (!freshness.allowed) {
                    safeLog('warn', 'Freshness Validator menolak penutupan task', { reason: freshness.reason });
                    
                    // Kita beritahu UI secara halus agar Ard tahu
                    ui.printConnectionError(`Sovereign Guard menahan agent: ${freshness.reason}`);
                    
                    currentMessages.push({ role: 'assistant', content: response });
                    currentMessages.push({
                        role: 'user',
                        content: `[SYSTEM FRESHNESS GUARD REJECTED]\nPenutupan task ditolak!\nAlasan: ${freshness.reason}\nSilakan jalankan alat (tool) yang tepat untuk memenuhi syarat ini sebelum menyelesaikan tugas.`
                    });
                    attempts++;
                    continue;
                }

                // Lolos → agen diizinkan selesai
                currentMessages.push({ role: 'assistant', content: response });
                break;
            }

            currentMessages.push({ role: 'assistant', content: response });
            let allResults = "";
            let anyDenied = false;

            for (const toolCall of toolCalls) {
                const approval = await requestApproval(toolCall, askQuestion);

                if (approval.decision === 'denied') {
                    ui.printDenied();
                    safeLog('info', 'Tool call ditolak/diblokir', { tool: toolCall.tool, args: toolCall.args });
                    currentMessages.push({
                        role: 'user',
                        content: `[SYSTEM] User menolak pengeksekusian aksi '${toolCall.tool}'. Silakan gunakan pendekatan lain atau hentikan tugas.`
                    });
                    anyDenied = true;
                    break;
                }

            let spinnerText = `Menjalankan ${toolCall.tool}...`;
            if (toolCall.tool === 'shell_exec') {
                const cmdPrefix = (toolCall.args?.command || '').substring(0, 40);
                spinnerText = `[shell_exec] Menjalankan: ${cmdPrefix}...`;
            } else if (toolCall.tool === 'write_file' || toolCall.tool === 'read_file') {
                spinnerText = `[${toolCall.tool}] ${toolCall.args?.file || toolCall.args?.path}...`;
            }
            const execSpinner = ui.startSpinner(spinnerText);
            const startTime = Date.now();
            try {
                let result: any;

                if (isBrowserTool(toolCall.tool)) {
                    // browserTool.ts mencatat evidence-nya sendiri (termasuk
                    // hash byte asli untuk screenshot) — tidak perlu recordEvidence
                    // kedua kali di sini.
                    const browserResult = await executeBrowserAction(toolCall.tool, toolCall.args);
                    if (!browserResult.success) {
                        throw new Error(browserResult.error || 'Browser action gagal tanpa pesan error');
                    }
                    result = browserResult.data;

                    if (browserResult.evidence) {
                        safeLog('info', 'Evidence browser dicatat ke ledger', {
                            evidenceId: browserResult.evidence.id,
                            tool: toolCall.tool
                        });
                    }

                    execSpinner.stop();
                    ui.printToolSuccess(toolCall.tool, toolCall.args, browserResult.evidence?.id);

                    currentMessages.push({ role: 'assistant', content: response });
                    const resultStr = truncateToolResult(JSON.stringify(result), maxToolResultChars);
                    const evidTag = browserResult.evidence ? `[EVID:${browserResult.evidence.id}]` : '(tidak ada evidence)';
                    currentMessages.push({
                        role: 'user',
                        content:
                            `[SYSTEM AUTO-REPORT]\nTool '${toolCall.tool}' berhasil dieksekusi.\n` +
                            `Result: ${resultStr}\n` +
                            `Evidence ID untuk hasil ini: ${evidTag} — gunakan tag ini persis seperti ini jika ` +
                            `Anda ingin merujuk bukti ini di respons Anda.\n` +
                            `Lanjutkan langkah berikutnya jika belum selesai.`
                    });

                    safeLog('info', 'Tool call berhasil dieksekusi', { tool: toolCall.tool, args: toolCall.args });
                    attempts++;
                    continue;
                }

                const execContext = { manual_approval: true, sessionId };
                result = await executeAction(toolCall.tool, toolCall.args, 1, execContext);
                execSpinner.stop();

                // --- GATE 2: SEMANTIC GRADER (Test Quality Audit) ---
                if (toolCall.tool === 'run_tests' || toolCall.tool === 'shell_exec') {
                    const cmd = toolCall.args?.command || '';
                    const isTestCommand = toolCall.tool === 'run_tests' || /npm test|jest|vitest|mocha|cypress/i.test(cmd);
                    
                    if (isTestCommand && (result.exitCode === 0 || (result.code === 0 && !result.error))) {
                        safeLog('info', 'Memasuki Semantic Grading...', { sessionId });
                        
                        const diffResult = await getRecentCodeDiff({
                            workingDir: process.cwd(),
                            memorySnapshots: evidenceLocker.getAllSnapshotsAsRecord(sessionId)
                        });
                        
                        const testContent = await getTestFileContent({
                            testPath: toolCall.args?.testPath || toolCall.args?.file || toolCall.args?.command,
                            workingDir: process.cwd()
                        });

                        const grade = await gradeTestQuality({
                            codeDiff: diffResult.diff,
                            testFileContent: testContent,
                            testOutput: typeof result === 'string' ? result : JSON.stringify(result),
                            changedFiles: diffResult.changedFiles
                        }, callJudgeModel);

                        if (!grade.accepted) {
                            safeLog('warn', 'Semantic Grader menolak tes', { reason: grade.reason });
                            ui.printConnectionError(`[Sovereign Judge] Menolak tes Anda: ${grade.reason}`);
                            
                            // Override result to FAIL so it doesn't get a successful EVID
                            result = {
                                ...result,
                                status: 'error',
                                exitCode: 1,
                                code: 1,
                                stdout: `[SEMANTIC GRADE FAILED]\nTes lulus exit code 0, tapi ditolak oleh Sovereign Judge (Skor: ${grade.score}).\nAlasan Juri: ${grade.reason}\n\nIssues:\n${grade.issues.join('\n')}\n\nSilakan perbaiki tes Anda agar benar-benar menguji logika yang baru diubah!`,
                                stderr: 'Semantic Validation Failed'
                            };
                        }
                    }
                }
                // --- END GATE 2 ---

                safeLog('info', 'Tool call berhasil dieksekusi', { tool: toolCall.tool, args: toolCall.args });

                // Hash & metadata dihitung DI SINI oleh kode kita, dari hasil
                // asli — bukan diserahkan ke model untuk "dilaporkan ulang".
                const evidence = recordEvidence(toolCall.tool, toolCall.args, result);
                safeLog('info', 'Evidence dicatat ke ledger', { evidenceId: evidence.id, tool: toolCall.tool });

                const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
                ui.printToolSuccess(toolCall.tool, toolCall.args, evidence.id);
                if (toolCall.tool === 'shell_exec') {
                    console.log(chalk.green(`    ✔ Selesai dalam ${durationSec}s`));
                }

                currentMessages.push({ role: 'assistant', content: response });
                const resultStr = truncateToolResult(JSON.stringify(result), maxToolResultChars);
                currentMessages.push({
                    role: 'user',
                    content:
                        `[SYSTEM AUTO-REPORT]\nTool '${toolCall.tool}' berhasil dieksekusi.\n` +
                        `Result: ${resultStr}\n` +
                        `Evidence ID untuk hasil ini: [EVID:${evidence.id}] — gunakan tag ini persis seperti ` +
                        `ini jika Anda ingin merujuk bukti ini di respons Anda. Jangan menulis ulang hash ` +
                        `atau detail file secara manual.\n` +
                        `Lanjutkan langkah berikutnya jika belum selesai.`
                });
            } catch (e: any) {
                execSpinner.stop();
                ui.printToolFailure(toolCall.tool, toolCall.args, e.message);

                safeLog('error', 'Tool call gagal dieksekusi', { tool: toolCall.tool, error: e.message });
                allResults += `[SYSTEM ERROR]\nTool '${toolCall.tool}' gagal: ${e.message}\nPerbaiki kesalahan ini dan coba lagi.\n\n`;
            }
            }

            if (anyDenied) {
                break;
            } else if (allResults.trim() !== "") {
                currentMessages.push({
                    role: 'user',
                    content: allResults.trim() + `\n\nLanjutkan langkah berikutnya jika belum selesai.`
                });
            }

            attempts++;
        }
    } finally {
        process.removeListener('SIGINT', onSigint);
    }

    const hitLimit = attempts >= maxAttempts && !cancelled;
    if (hitLimit) {
        ui.printAttemptLimitReached(maxAttempts);
        safeLog('warn', 'Loop dihentikan karena mencapai MAX_ATTEMPTS', { maxAttempts });
    }

    return {
        messages: currentMessages,
        completed: !hitLimit && !cancelled,
        attemptsUsed: attempts,
        cancelled
    };
}
