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
             "[GRAY-1] HIGH: Buffer overflow — allocUnsafe tanpa size check. CWE-120"),
            ("memcpy(dest, src, strlen(src));",
             "[GRAY-1] CRITICAL: strcpy/memcpy tanpa bound check. CWE-120"),
            # Memory leak patterns
            ("setInterval(() => { data.push(fetch(url)); }, 100);",
             "[GRAY-1] HIGH: Memory leak — array tanpa cleanup di setInterval. CWE-401"),
            # Race condition
            ("if (!lock) { lock = true; criticalSection(); lock = false; }",
             "[GRAY-1] HIGH: Race condition — non-atomic lock check. CWE-362"),
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
             "[GRAY-2] CRITICAL: SQL Injection — template literal langsung di query. CWE-89"),
            # XSS
            ("document.innerHTML = req.query.name;",
             "[GRAY-2] HIGH: XSS — user input langsung ke innerHTML. CWE-79"),
            # Command injection
            ("exec(`ls ${req.body.path}`)",
             "[GRAY-2] CRITICAL: Command injection — user input langsung ke exec. CWE-78"),
        ]
    ]

def generate_gray5_samples():
    """GRAY-5: Cloud & Config Auditor"""
    return [
        {
            "instruction": "Kamu adalah GRAY-5, Cloud & Config Auditor ANT-CYBER-CORPS. Audit kode dan laporkan temuan.",
            "input": code,
            "output": finding
        }
        for code, finding in [
            # Exposed secrets
            ("AWS_SECRET_ACCESS_KEY=AKIA1234567890ABCDEF",
             "[GRAY-5] CRITICAL: Exposed AWS key di kode. Revoke segera. CWE-312"),
            ("const apiKey = 'sk-1234567890abcdef'",
             "[GRAY-5] HIGH: Hardcoded API key. Pindahkan ke environment variable. CWE-798"),
            # IAM misconfiguration
            ('{"Effect": "Allow", "Action": "*", "Resource": "*"}',
             "[GRAY-5] HIGH: IAM policy terlalu permissive — wildcard action+resource. CWE-732"),
        ]
    ]

# Generate semua dataset
all_datasets = {
    "gray-1": generate_gray1_samples(),
    "gray-2": generate_gray2_samples(),
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
