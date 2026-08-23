# 🐜 ANT-CYBER-CORPS: Sovereign Security Swarm

## 🌟 Visi & Misi
**Visi:** Membangun ekosistem AI spesialis yang mampu mendeteksi, menganalisis, dan memperbaiki kerentanan keamanan siber secara otomatis di ranah lokal tanpa cloud.
**Misi:** *Detect, Analyze, Remediate.* Fokus pada pertahanan (defensive) dan perbaikan, dengan menjunjung tinggi akurasi dan meminimalisir halusinasi.

## 🧬 Arsitektur Koloni (Hot-Swap LoRA)
Model berbasis **Swarms of Specialists**. Untuk menghemat RAM (khususnya di Android/Termux), kita menggunakan arsitektur **Sovereign Swarm**:
- **1 Base Model Resident** berjalan statis di memori.
- **5 LoRA Adapters** di-hot-swap secara sekuensial (bergantian) saat swarm diaktifkan.

### 🛠️ Unit Spesialis (The Elite Five)
| Unit | Nama | Spesialisasi | Fokus Utama |
| :--- | :--- | :--- | :--- |
| **GRAY-1** | Memory & Logic Guardian | Memory & Logic | Buffer Overflow, Race Condition, Memory Leaks, ReDoS |
| **GRAY-2** | Injection Sifter | Runtime Injection | SQLi, XSS, Command Injection, SSRF, Path Traversal |
| **GRAY-3** | Auth & Identity Architect| Auth & Identity | IDOR, JWT Flaws, Broken Auth, Privilege Escalation |
| **GRAY-4** | Supply Chain Sentinel | Dependency/Manifest| CVE Deps, Typosquatting, Malicious Scripts (`postinstall`) |
| **GRAY-5** | Cloud & Config Auditor | Cloud & Config | Hardcoded Secrets, IAM Misconfig, Cloud Misconfig |

## ⚙️ Spesifikasi Teknis (Update Phase 2)
- **Base Model:** Qwen2.5-Coder-1.5B-Instruct
- **Parameter Size:** ~1.5 Billion (Jauh lebih stabil dari 0.5B, mampu generalisasi pola)
- **Estimated Size:** Base ~1.5GB (Shared RAM) + Adapters ~50MB per unit
- **Deployment Target:** Kaggle T4 GPU (Fine-tuning via QLoRA 4-bit)
- **Conversion:** Export hanya adapter (GGUF format) via `convert_lora_to_gguf.py`
- **Orchestration:** Sequential dispatch via `swarm_orchestrator.ts` dengan `keep_alive: 0`

## 📈 Progress Tracker
- [x] Penentuan Visi & Misi 
- [x] Pemilihan 5 Kandidat Spesialis
- [x] Upgrade Base Model ke 1.5B untuk stabilitas
- [x] Arsitektur LoRA Hot-Swap & Sequential Orchestrator
- [x] Blueprint Distribusi Dataset (Hard Negatives, CWE vs CVE, ReDoS)
- [x] Pembuatan Script Generator Dataset (`generate_dataset.py`)
- [x] Pembuatan Script Training Kaggle (`gray_unit_finetune.py`)
- [ ] Pengisian Sampel Dataset Lengkap (Target: 600 per unit, total 2.400)
- [ ] Upload Dataset ke Kaggle
- [ ] Training & Fine-Tuning di Kaggle (Loop per Unit)
- [ ] Konversi Adapter ke GGUF & Register ke Ollama Modelfile
- [ ] Evaluasi Test-Set (80/20 Split Precision & Recall)
- [ ] Integrasi End-to-End dengan ANT CLI

## 📅 Next Steps
1. Menyelesaikan pengisian dataset sintesis menggunakan `generate_dataset.py` (oleh Operator).
2. Uji coba siklus end-to-end (Train -> Convert -> Ollama Load) pada **satu unit pertama (GRAY-1)** untuk *fail-fast validation*.
3. Training massal sisa 4 unit lainnya di Kaggle.

---
*Last Updated: 18 Agustus 2026 | Status: PHASE 2 (DATASET PREP)*