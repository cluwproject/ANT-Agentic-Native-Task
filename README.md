# 🐜 ANT (Agentic Native Task) CLI

<div align="center">
  <img src="https://raw.githubusercontent.com/cluwproject/ANT-Agentic-Native-Task/main/docs/assets/ant_logo.png" alt="ANT Logo" width="200"/>
  
  *Native Agentic Commander for Sovereign Developers*
</div>

---

ANT is a **terminal-native coding agent**: a ReAct tool loop equipped with approval gates, an optional security swarm, persistent memory, and **profile-based project scaffolding** (`ant scaffold`). It accelerates full-stack work—scaffolding, testing, debugging, and auditing—while keeping humans as the architects of product and production.

ANT berjalan langsung di terminal (Mac, Linux, Windows, Termux), mampu membaca/menulis file, menjalankan perintah shell, hingga melakukan perbaikan error otonom (self-healing), namun dibatasi oleh *allowlist* keamanan dan *Milestone pipeline* agar tidak bertindak destruktif.

## 🚀 Fitur Utama

- **Terminal-Native & Cross-Platform:** Bekerja langsung di mesin Anda, dari MacBook Pro hingga Android Termux.
- **Project Scaffolding (Milestone Runner):** Buat proyek full-stack (mis. Next.js + Prisma) melalui satu perintah berjenjang (INIT → SCAFFOLD → IMPLEMENT → VERIFY → SECURE).
- **The Agent Loop (ReAct):** Membaca log error, memperbaiki kode, dan menjalankannya lagi secara otonom (*self-healing*).
- **Security Swarm (ANT-CYBER-CORPS):** Orkestrasi 5 Gray Unit ber-taksonomi untuk mengaudit keamanan lokal Anda (mencari celah auth, memory leaks, atau hardcoded secrets).
- **Dual-Vault Memory (MindBy 4-Tier):** Memori persisten antar-sesi. Mode offline menggunakan JSON lokal, mode cloud tersinkronisasi via CockroachDB (Vector 768-dim).
- **Shell Allowlist & Gatekeeper:** Mengamankan mesin Anda dengan pola `default deny` untuk perintah destruktif, dan `auto-approve` untuk *tools* pengembangan (seperti `npm`, `tsc`, `git`).
- **Evidence-Based Claims:** Agen tidak bisa berhalusinasi "sudah memperbaiki kode". Setiap eksekusi sukses wajib mencatatkan *evidence* (SHA-256 hash) di Ledger.

---

## 🛠 Panduan Instalasi (Quickstart)

### Prasyarat
- Node.js 20+
- Git
- Opsional: Kunci API (Anthropic, OpenAI, atau Gemini) untuk akses model cloud yang lebih cerdas.
- Opsional: Ollama untuk *embedding* 768-dim (`ollama pull nomic-embed-text`) dan model SLM lokal offline.

### Instalasi (Untuk Pengguna Akhir)
Gunakan perintah standar berikut untuk menginstal dan menjalankan ANT CLI:

```bash
git clone https://github.com/cluwproject/ANT-Agentic-Native-Task.git
cd ANT-Agentic-Native-Task
npm install        # Menginstal seluruh dependensi standar
npm run build      # Mengompilasi kode TypeScript
npm start          # Memulai ANT CLI
```

### Untuk Kontributor / Developer (Opsional)
Jika Anda ikut mengembangkan basis kode ini, pastikan kode Anda lolos standar *Continuous Integration* (CI) sebelum melakukan _Push_:
- `npm run test:unit` : Menjalankan 41/41 unit test lokal secara offline.
- `npm run ci` : Mensimulasikan pipeline GitHub Actions secara lokal (Typecheck + Build + Test). 
*(Catatan: Anda tidak perlu perintah CI jika hanya ingin menggunakan CLI-nya).*

### Setup Lingkungan (`.env`)
Salin `.env.example` ke `.env` lalu sesuaikan dengan model yang ingin Anda gunakan.

```env
# ─────────────────────────────────────────────────────────
# PILIHAN: CLOUD API MODEL (Sangat disarankan untuk full-stack)
# ─────────────────────────────────────────────────────────
AI_PROVIDER=anthropic      # Opsi: anthropic, openai, google, aws_bedrock
CUSTOM_MODEL=claude-3-5-sonnet-20240620
ANTHROPIC_API_KEY=sk-xxxxxxxxxxxxx

# ─────────────────────────────────────────────────────────
# DATABASE MEMORY (Opsional)
# ─────────────────────────────────────────────────────────
# Jika dikosongkan, memori disimpan di JSON lokal (workspace/memories/)
DATABASE_URL=postgresql://<user>:<pass>@<cluster>.cockroachlabs.cloud:26257/defaultdb
```

---

## 💻 CLI Commands (Subcommands Mandiri)

Selain dijalankan secara interaktif (REPL), ANT menyediakan perintah CLI langsung (dari luar REPL):

| Command | Fungsi |
| :--- | :--- |
| `ant` | Buka ANT dalam REPL interaktif |
| `ant scaffold <profile> <dir>` | Buat project baru terstruktur (mis: `next-prisma`) |
| `ant swarm "<goal>" "<target>"` | Jalankan audit keamanan (Gray Units) |
| `ant swarm report [--json]` | Ekstrak laporan keamanan dalam Markdown/JSON |
| `ant agent list \| run` | Kelola dan panggil Sub-Agen spesialis langsung |
| `ant task list \| schedule` | Manajemen background task otomatis |
| `ant mailbox list \| verify` | Audit transaksi dan integritas memori inter-model |

### Project Scaffolding (Contoh)
```bash
ant scaffold next-prisma ./my-app
```
*Pipeline* ini memandu agen melalui tahap `INIT → SCAFFOLD → IMPLEMENT → VERIFY → SECURE` berdasarkan kontrak di `src/core/agentic/profiles/next-prisma.json`.

---

## 📟 Referensi Slash Commands (Interaktif)

Ketik perintah berikut setelah Anda berada di dalam REPL ANT (`npm start`):

### Memory & Vault
- `/store <teks>` — Simpan memori semantik ke Dual-Vault (embedding 768-dim)
- `/recall <query>` — Cari memori berdasarkan Vector Cosine Similarity
- `/memories` — Lihat semua memori tersimpan
- `/vault [cloud|local]` — Pindah engine memori 
- `/sync` — Flush antrian memori offline ke CockroachDB

### Pendelegasian & Swarm
- `/swarm [path]` — Trigger manual **ANT-CYBER-CORPS** untuk mengaudit path.
- `/report [--json]` — Tarik artefak laporan dari misi Swarm terakhir.
- `/osint` — Pusat investigasi taktis multi-dimensi.
- `/plan <misi>` — Buat rancangan eksekusi kompleks (HTN Planner).

### Session & Konfigurasi
- `/model <nama>` — Ganti model AI yang aktif (Hot-swap) secara on-the-fly.
- `/connect <url>` — Koneksi ke MCP (Model Context Protocol) Server terluar.
- `/agent <aksi>` — Cek status sub-agen otonom.
- `/checkpoint` — Lakukan git commit state workspace saat ini.

---

## 🛡️ Arsitektur Keamanan & Audit (Swarm)

ANT menggunakan unit audit (*Gray Units*) yang berjalan secara **sequential** untuk memastikan perangkat dengan keterbatasan memori (seperti Termux/Android) tidak meledak kehabisan RAM. Mode konkurensi (paralel) bersifat *opt-in* (`ANT_SWARM_MODE=concurrent`).

```text
ANT-CYBER-CORPS (Sequential Code-Audit, Termux-safe)
  ├─ GRAY-1 : Memory Leak / Buffer Overflow / IPC
  ├─ GRAY-2 : Injection / Sanitization (SQLi, XSS)
  ├─ GRAY-3 : Auth / Access Control / JWT
  ├─ GRAY-4 : Supply Chain / Dependency risks
  └─ GRAY-5 : Hardcoded Secrets / Cloud / IAM Misconfig
       ↓
  Blackboard JSON 
       ↓
  report.json (Mesin) + report.md (Manusia)
```

**Batasan Akses Shell (Allowlist Gatekeeper):**  
ANT **tidak** mengeksekusi shell secara membabi buta. Ia menggunakan L5 Allowlist:
*   `npm`, `npx`, `node`, `tsc`, `git` = Auto-Approve
*   `rm -rf /`, `curl | sh`, `dd` = Hard Block
*   Lainnya = Meminta manual *approval* [y/n/a] dari User.

---

## 🗂️ Struktur Direktori Proyek

```
ant-cli/
├── src/
│   ├── core/
│   │   ├── cli/
│   │   │   ├── index.ts              # Modular CLI Boot & Router
│   │   │   ├── commands/             # Logika command CLI (Scaffold, Swarm, dll)
│   │   │   └── argv/                 # Argv parsing (yargs fallback)
│   │   ├── agent_loop/
│   │   │   ├── agentLoop.ts          # Core ReAct Loop
│   │   │   ├── permissions.ts        # Manual Approval & Evidence
│   │   │   └── allowlist.ts          # Fase 4E Shell Gatekeeper
│   │   └── agentic/
│   │       ├── swarm_orchestrator.ts # Arsitektur Gray Units & Blackboard
│   │       ├── swarm_report.ts       # Generator Artifact JSON (Fase 4B)
│   │       ├── milestone_runner.ts   # State Machine Scaffolding
│   │       └── profiles/             # L1 Spesifikasi Proyek (next-prisma.json)
├── workspace/
│   ├── memories/                     # Local vault (semantic, core, episodic)
│   ├── missions/                     # Penyimpanan misi aktif
│   └── reports/                      # Artefak JSON Swarm report
├── tests/
│   └── unit/                         # 100% Native Node Test Runner (node:test)
├── .github/
│   └── workflows/ci.yml              # CI Pipeline (Typecheck + Build + Unit Tests)
└── .env.example
```

---

## 🏛️ Architecture Council & Cross-Model Synthesis

Arsitektur ANT v0.4 (The Sovereign Runtime Era) dirumuskan dan diuji secara ketat melalui konsensus lintas arsitektur kognitif (*Cross-Model Peer Review*):
- **Ard (Renaldy Adri):** Chief Architect, Sovereign Operator & Visionary.
- **Antigravity (Agy):** Lead Coding Pair & Runtime Engineer.
- **Frontier Architectural Council (Synthesis):**
  - **GPT-4o/o3:** *Cognitive State vs Memory Separation & Recovery State Machine.*
  - **Kimi:** *Distributed Concurrency, Event-Driven Callbacks, & Worktree Isolation.*
  - **Qwen 3.8 Max:** *Pragmatic Doktrin P1–P4, Pilar 0 Security Fence, & ADR-001 Git-First Architecture.*
  - **Grok:** *Red-Team Threat Analysis, npm Script Hardening, & Mobile Recovery Branches.*
  - **Claude 3.7:** *Variable-Friction Approval, Anti-Automation Bias, & Grand Consolidation.*

Lihat naskah lengkap spesifikasi di [**`ROADMAP_UBIQUITOUS_COMPANION.md`**](ROADMAP_UBIQUITOUS_COMPANION.md).

---

## 📜 Intellectual Property & Sovereign Declaration

- **Creator / Operator:** Ard
- **Parent Architecture:** CLUW-Genesis
- **Version:** v0.3.5 (Menuju v0.4) — Swarm Intelligence, CI/CD, & Scaffolding
- **License:** [Apache 2.0 License](LICENSE)

*"Model AI bersifat sementara. Arsitektur kognitif, memori, dan kedaulatan eksekusi bersifat abadi."*
