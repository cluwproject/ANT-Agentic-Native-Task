/**
 * ════════════════════════════════════════════════════════════════════
 * ANT-CYBER-CORPS — MULTI-UNIT SPECIALIST DATASET GENERATOR
 * ════════════════════════════════════════════════════════════════════
 * Generates high-quality Supervised Fine-Tuning (SFT) datasets in JSONL
 * format for the 5 specialized sub-ops (ANT-GRAY-1 through ANT-GRAY-5).
 * Base Models: Qwen2.5-Coder-0.5B-Instruct & Qwen2.5-0.8B-Instruct
 * ════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseDir = path.resolve(__dirname, 'datasets');

// Helper to write JSONL
function writeDataset(unitId, dataList) {
    const unitDir = path.join(baseDir, unitId);
    fs.mkdirSync(unitDir, { recursive: true });
    const targetFile = path.join(unitDir, 'train.jsonl');
    
    const lines = dataList.map(item => JSON.stringify(item)).join('\n') + '\n';
    fs.writeFileSync(targetFile, lines, 'utf8');
    console.log(`✓ [${unitId.toUpperCase()}] Saved ${dataList.length} training samples -> ${targetFile}`);
}

// -------------------------------------------------------------
// UNIT GRAY-1: Memory & Logic Guardian (C/C++, Rust, Logic)
// -------------------------------------------------------------
const gray1Samples = [
    {
        instruction: "Periksa potongan kode C berikut. Apakah ada celah keamanan memori atau potensi crash?\n\n```c\nvoid process_input(char *user_str) {\n    char buffer[64];\n    strcpy(buffer, user_str);\n    printf(\"Input: %s\\n\", buffer);\n}\n```",
        output: "[ANALISIS ANT-GRAY-1]\nCelah: Buffer Overflow (CWE-120)\nRisiko: HIGH (Potensi crash memori / Remote Code Execution jika user_str melebihi 64 bytes).\n\n[SOLUSI PERBAIKAN]\nGanti `strcpy` dengan fungsi aman berbatas ukuran seperti `strncpy` atau `snprintf`:\n\n```c\nvoid process_input(const char *user_str) {\n    char buffer[64];\n    snprintf(buffer, sizeof(buffer), \"%s\", user_str);\n    printf(\"Input: %s\\n\", buffer);\n}\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Terapkan snprintf dan validasi batas buffer.\n🙈 [ABAIKAN] -> Catat sebagai risiko memori yang belum dipatch."
    },
    {
        instruction: "Analisis fungsi alokasi memori ini. Di mana letak kesalahannya?\n\n```c\nchar* get_data() {\n    char *data = (char*)malloc(100);\n    if (!data) return NULL;\n    // operasi data...\n    return data;\n}\n```",
        output: "[ANALISIS ANT-GRAY-1]\nCelah: Potensi Memory Leak (CWE-401) jika pemanggil tidak membebaskan memori (`free`).\nRisiko: MEDIUM (Konsumsi RAM membengkak hingga out-of-memory).\n\n[SOLUSI PERBAIKAN]\nPastikan ada dokumentasi transfer kepemilikan memori, atau gunakan struktur RAII (jika C++) / smart pointer, atau sediakan fungsi cleanup pendamping:\n\n```c\nvoid free_data(char *data) {\n    if (data) free(data);\n}\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Pasang cleanup handler / smart pointer.\n🙈 [ABAIKAN] -> Risiko memory leak diterima."
    }
];

// -------------------------------------------------------------
// UNIT GRAY-2: Input & Injection Sifter (SQLi, XSS, Command Inj)
// -------------------------------------------------------------
const gray2Samples = [
    {
        instruction: "Review endpoint Node.js Express berikut untuk deteksi celah injeksi:\n\n```javascript\napp.get('/api/users', async (req, res) => {\n    const username = req.query.username;\n    const query = `SELECT id, email, role FROM users WHERE username = '${username}'`;\n    const result = await db.query(query);\n    res.json(result.rows);\n});\n```",
        output: "[ANALISIS ANT-GRAY-2]\nCelah: SQL Injection (CWE-89)\nRisiko: CRITICAL (Penyerang bisa memasukkan `' OR '1'='1` untuk membocorkan seluruh isi database atau `' ; DROP TABLE users; --`)\n\n[SOLUSI PERBAIKAN]\nGunakan Parameterized Queries / Prepared Statements:\n\n```javascript\napp.get('/api/users', async (req, res) => {\n    const username = req.query.username;\n    const query = 'SELECT id, email, role FROM users WHERE username = $1';\n    const result = await db.query(query, [username]);\n    res.json(result.rows);\n});\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Terapkan parameterized query ($1).\n🙈 [ABAIKAN] -> Risiko injeksi database diterima."
    },
    {
        instruction: "Periksa fungsi render HTML berikut. Apakah rentan XSS?\n\n```javascript\nfunction renderComment(author, commentText) {\n    document.getElementById('comment-box').innerHTML = `<b>${author}</b>: ${commentText}`;\n}\n```",
        output: "[ANALISIS ANT-GRAY-2]\nCelah: Stored/DOM-based Cross-Site Scripting / XSS (CWE-79)\nRisiko: HIGH (Penyerang bisa memasukkan `<img src=x onerror=stealCookies()>` untuk membajak sesi user).\n\n[SOLUSI PERBAIKAN]\nGunakan `textContent` atau sanitasi input menggunakan DOMPurify:\n\n```javascript\nfunction renderComment(author, commentText) {\n    const box = document.getElementById('comment-box');\n    const b = document.createElement('b');\n    b.textContent = author + ': ';\n    const span = document.createElement('span');\n    span.textContent = commentText;\n    box.replaceChildren(b, span);\n}\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Gunakan textContent / DOMPurify.\n🙈 [ABAIKAN] -> Risiko script injection diterima."
    }
];

// -------------------------------------------------------------
// UNIT GRAY-3: Auth & Identity Architect (IDOR, JWT, RBAC)
// -------------------------------------------------------------
const gray3Samples = [
    {
        instruction: "Periksa handler controller profil user berikut untuk mendeteksi celah otorisasi:\n\n```javascript\napp.get('/api/user/profile', async (req, res) => {\n    const targetUserId = req.query.id;\n    const userProfile = await db.findUserById(targetUserId);\n    res.json(userProfile);\n});\n```",
        output: "[ANALISIS ANT-GRAY-3]\nCelah: Insecure Direct Object Reference / IDOR (CWE-639)\nRisiko: HIGH (User A dapat melihat profil rahasia User B hanya dengan mengubah parameter `?id=123`)\n\n[SOLUSI PERBAIKAN]\nAmbil ID user dari sesi / token JWT yang terverifikasi, BUKAN dari parameter query yang bisa diubah user:\n\n```javascript\napp.get('/api/user/profile', authMiddleware, async (req, res) => {\n    const authenticatedUserId = req.user.id; // Diambil dari JWT terverifikasi\n    const userProfile = await db.findUserById(authenticatedUserId);\n    res.json(userProfile);\n});\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Ambil ID dari req.user.id (JWT).\n🙈 [ABAIKAN] -> Risiko IDOR diterima."
    }
];

// -------------------------------------------------------------
// UNIT GRAY-4: Supply Chain Sentinel (Dependencies, CVE, NPM)
// -------------------------------------------------------------
const gray4Samples = [
    {
        instruction: "Periksa potongan dependencies package.json ini:\n\n```json\n{\n  \"dependencies\": {\n    \"lodash\": \"4.17.15\",\n    \"axios\": \"0.21.1\"\n  }\n}\n```",
        output: "[ANALISIS ANT-GRAY-4]\nCelah: Vulnerable Outdated Dependencies\n- `lodash@4.17.15` memiliki CVE-2020-8203 / Prototype Pollution (High Risk).\n- `axios@0.21.1` memiliki CVE-2020-28168 / SSRF (Medium Risk).\n\n[SOLUSI PERBAIKAN]\nUpgrade versi package ke versi patch yang aman:\n\n```json\n{\n  \"dependencies\": {\n    \"lodash\": \"^4.17.21\",\n    \"axios\": \"^1.7.0\"\n  }\n}\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Jalankan npm update / upgrade ke versi aman.\n🙈 [ABAIKAN] -> Risiko dependency usang diterima."
    }
];

// -------------------------------------------------------------
// UNIT GRAY-5: Cloud & Config Auditor (S3, .env, IAM, Headers)
// -------------------------------------------------------------
const gray5Samples = [
    {
        instruction: "Audit potongan konfigurasi Nginx / Server ini:\n\n```nginx\nserver {\n    listen 80;\n    server_name api.ant-system.com;\n    location / {\n        proxy_pass http://localhost:3000;\n    }\n}\n```",
        output: "[ANALISIS ANT-GRAY-5]\nCelah: Unencrypted HTTP & Missing Security Headers\nRisiko: MEDIUM (Data transit tidak terenkripsi, rentan Man-in-the-Middle).\n\n[SOLUSI PERBAIKAN]\nTerapkan SSL/TLS (HTTPS) dan tambahkan Security Headers esensial (HSTS, X-Content-Type-Options, CSP):\n\n```nginx\nserver {\n    listen 443 ssl http2;\n    server_name api.ant-system.com;\n    \n    add_header X-Content-Type-Options nosniff always;\n    add_header X-Frame-Options DENY always;\n    add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;\n\n    location / {\n        proxy_pass http://localhost:3000;\n    }\n}\n```\n\nPilihan Tindakan:\n🛠️ [PERBAIKI] -> Aktifkan HTTPS & Security Headers.\n🙈 [ABAIKAN] -> Risiko transit unencrypted diterima."
    }
];

// Execute population
console.log('🚀 Starting ANT-CYBER-CORPS Dataset Generation...\n');
writeDataset('gray-1', gray1Samples);
writeDataset('gray-2', gray2Samples);
writeDataset('gray-3', gray3Samples);
writeDataset('gray-4', gray4Samples);
writeDataset('gray-5', gray5Samples);
console.log('\n✨ All datasets successfully generated in workspace/ant-cyber-corps/datasets/!');
