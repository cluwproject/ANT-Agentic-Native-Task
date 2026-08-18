# Phase 2 — GRAY Unit Fine-Tuning Guide

## Overview
Folder ini berisi semua yang kamu butuhkan untuk melatih model GRAY Units ANT-CYBER-CORPS menggunakan **QLoRA** di Kaggle (GPU gratis).

## Files
| File | Fungsi |
|------|--------|
| `gray_unit_finetune.py` | Script training utama untuk Kaggle |
| `generate_dataset.py` | Generator dataset training lokal |

---

## Step-by-Step di Kaggle

### Step 1: Generate Dataset (di lokal dulu)
```bash
python generate_dataset.py
# Output: dataset_gray-1.jsonl, dataset_gray-2.jsonl, dataset_gray-5.jsonl
```

### Step 2: Upload ke Kaggle
1. Buka [kaggle.com/datasets](https://www.kaggle.com/datasets)
2. Klik **New Dataset**
3. Upload semua file `.jsonl`
4. Beri nama: `ant-gray-units-dataset`

### Step 3: Buat Notebook Kaggle
1. Buka [kaggle.com/code](https://www.kaggle.com/code) → **New Notebook**
2. Aktifkan **GPU T4 x2** (Settings → Accelerator)
3. Copy-paste isi `gray_unit_finetune.py`
4. Attach dataset dari Step 2
5. Klik **Run All**

### Step 4: Download Model
Setelah training selesai, model tersimpan di `/kaggle/working/`. Download via:
```python
from kaggle_secrets import UserSecretsClient
# atau zip dan download manual dari output
```

### Step 5: Push ke Ollama (lokal)
```bash
# Konversi ke GGUF format
python llama.cpp/convert.py ./ant-gray-unit --outfile gray1.gguf --outtype q4_k_m

# Buat Modelfile untuk Ollama
cat > Modelfile << EOF
FROM gray1.gguf
SYSTEM "Kamu adalah GRAY-1, Memory & Logic Guardian ANT-CYBER-CORPS."
EOF

# Register ke Ollama
ollama create ant-gray-1 -f Modelfile

# Test
ollama run ant-gray-1 "Audit kode ini: let buf = Buffer.allocUnsafe(10);"
```

### Step 6: Aktifkan di ANT
Di `.env`:
```env
ANT_GRAY_1_MODEL=ant-gray-1
ANT_GRAY_2_MODEL=ant-gray-2
```

---

## GPU Requirements per Model

| Base Model | VRAM Needed | Kaggle GPU |
|-----------|-------------|-----------|
| Qwen2.5-Coder-0.5B | 4GB | T4 ✅ |
| Qwen2.5-Coder-1.5B | 6GB | T4 ✅ |
| Qwen2.5-Coder-3B | 10GB | T4 ✅ |
| Qwen2.5-Coder-7B | 16GB | V100 (P100) ✅ |

---

## Dataset Target (Minimum per Unit)

| Unit | Target Samples | Fokus Kerentanan |
|------|---------------|-----------------|
| GRAY-1 | 500 | Buffer overflow, race condition, memory leak |
| GRAY-2 | 500 | SQLi, XSS, command injection, SSRF |
| GRAY-3 | 300 | IDOR, JWT flaw, broken auth |
| GRAY-4 | 300 | CVE deps, outdated packages |
| GRAY-5 | 300 | Exposed secrets, IAM misconfiguration |
