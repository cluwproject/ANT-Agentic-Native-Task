# Phase 2 — GRAY Unit Fine-Tuning Guide (Sovereign Swarm Architecture)

## Overview
Folder ini berisi script untuk melatih model GRAY Units ANT-CYBER-CORPS menggunakan **QLoRA** di Kaggle.

> [!IMPORTANT]
> **Arsitektur Hot-Swap LoRA:**
> Untuk menghemat RAM (khususnya di Termux / PC biasa), kita **TIDAK** menggabungkan LoRA dengan Base Model. Kita menggunakan 1 Base Model yang menetap di RAM (`qwen2.5-coder:1.5b`), dan menukar-nukar adapter LoRA kecil (~50MB) di atasnya. Ollama mendukung ini via instruksi `ADAPTER`.

## Files
| File | Fungsi |
|------|--------|
| `gray_unit_finetune.py` | Script training utama untuk Kaggle (menyimpan *hanya* adapter LoRA) |
| `generate_dataset.py` | Generator dataset training lokal dengan hard negatives & CWE format |

---

## Step-by-Step

### Step 1: Generate Dataset (di lokal)
```bash
python generate_dataset.py
# Output: dataset_gray-1.jsonl, dataset_gray-2.jsonl, dsb. (Total ~2.400 samples)
```

### Step 2: Upload ke Kaggle
1. Buka [kaggle.com/datasets](https://www.kaggle.com/datasets)
2. Klik **New Dataset** dan upload semua file `.jsonl`
3. Beri nama: `ant-gray-units-dataset`

### Step 3: Training di Kaggle Notebook
1. Buka [kaggle.com/code](https://www.kaggle.com/code) → **New Notebook**
2. Aktifkan **GPU T4 x2**
3. Copy-paste isi `gray_unit_finetune.py`
4. Attach dataset dari Step 2
5. Script akan otomatis melakukan **Train/Eval Split (80/20)** untuk mengevaluasi *Precision/Recall* pada data yang tidak pernah dilihat model.
6. Klik **Run All**.

### Step 4: Convert LoRA ke GGUF
Setelah training selesai, convert direktori adapter ke format GGUF. Jalankan ini di terminal Kaggle atau lokal:
```bash
# Clone llama.cpp
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
pip install -r requirements.txt

# Convert HANYA adapter-nya (butuh reference ke Base Model HF untuk config)
# Pastikan qwen2.5-coder-1.5b-hf sudah didownload atau cache tersedia
python convert_lora_to_gguf.py \
  --base Qwen/Qwen2.5-Coder-1.5B-Instruct \
  --outfile gray1-adapter.gguf \
  ../ant-gray-unit/gray-1-adapter
```

> [!TIP]
> **Penting Sebelum Melatih Semua Unit:**
> Lakukan seluruh proses (training -> konversi -> register Ollama -> test inference) untuk **SATU** adapter (misal GRAY-1) terlebih dahulu. Ini memastikan tidak ada isu penamaan tensor antara PEFT dan backend llama.cpp (Ollama) sebelum kamu menghabiskan waktu melatih sisa 4 unit lainnya.

### Step 5: Setup Modelfile di Ollama (Hot-Swap)
Di komputer lokal/Termux, download dulu base modelnya:
```bash
ollama pull qwen2.5-coder:1.5b
```

Lalu buat `Modelfile` untuk GRAY-1:
```dockerfile
FROM qwen2.5-coder:1.5b
ADAPTER ./gray1-adapter.gguf
SYSTEM "Kamu adalah GRAY-1, Memory & Logic Guardian ANT-CYBER-CORPS."
```

Register ke Ollama:
```bash
ollama create ant-gray-1 -f Modelfile
```

### Step 6: Aktifkan di ANT
Di `.env` Anda:
```env
ANT_GRAY_1_MODEL=ant-gray-1
# Model ANT-GRAY-1 sekarang akan menggunakan base 1.5B (shared RAM) + adapter 50MB!
```
