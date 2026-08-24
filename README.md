# 🐜 ANT (Agentic Native Task) CLI

[![CI](https://github.com/cluwproject/ANT-Agentic-Native-Task/actions/workflows/ci.yml/badge.svg)](https://github.com/cluwproject/ANT-Agentic-Native-Task/actions/workflows/ci.yml)

<div align="center">
  <img src="https://raw.githubusercontent.com/cluwproject/ANT-Agentic-Native-Task/main/docs/assets/ant_logo.png" alt="ANT Logo" width="200"/>
  
  *Native Agentic Commander for Sovereign Developers*
</div>

---

ANT is a **terminal-native coding agent**: a ReAct tool loop equipped with approval gates, an optional security swarm, persistent memory, and **profile-based project scaffolding** (`ant scaffold`). It accelerates full-stack work—scaffolding, testing, debugging, and auditing—while keeping humans as the architects of product and production.

ANT berjalan langsung di terminal (Mac, Linux, Windows, Termux), mampu membaca/menulis file, menjalankan perintah shell, hingga melakukan perbaikan error otonom (self-healing), namun dibatasi oleh *allowlist* keamanan dan *Milestone pipeline* agar tidak bertindak destruktif.

## 🚀 Fitur Utama

- **Terminal-Native & Cross-Platform:** Bekerja langsung di mesin Anda, dari MacBook Pro hingga Android Termux.
- **Ubiquitous Assistant (v0.4):** Setiap model (Gemini/Claude/OpenAI/Ollama lokal) bisa jadi asisten penuh — dengan tool access, memori proyek, dan MCP ecosystem.
- **MCP Client (Model Context Protocol):** Hubungkan server MCP eksternal (`/mcp add github npx -y @modelcontextprotocol/server-github`) — tools-nya otomatis tersedia untuk SEMUA model melalui approval gate yang sama.
- **Project Memory (ANT.md):** Instruksi proyek persisten ala CLAUDE.md/GEMINI.md. Taruh `ANT.md` di root repo dan semua model langsung paham konteks tim.
- **Headless Mode:** `ant -p "task" --output-format json` untuk scripting, CI/CD, dan otomasi pipeline.
- **Custom Slash Commands:** Simpan workflow tim sebagai markdown di `.ant/commands/*.md` → jadi slash command reusable (mis. `/review`, `/deploy`).
- **Lifecycle Hooks:** Otomatisasi pre/post tool call via `.ant/hooks.json` — guard kustom, notifikasi, audit trail.
- **Sub-Agent v2 (Full Loop):** `ant agent run coder "<task>"` menjalankan sub-agen dengan agent loop penuh + akses tool + konteks terisolasi (approval non-interaktif default: deny).
- **Native Tool Calling:** Tool calls dari provider API (OpenAI/Anthropic/Gemini) dipakai langsung tanpa parsing teks — lebih andal untuk semua model cloud; SLM lokal tetap pakai JSON bridge.
- **Project Scaffolding (Milestone Runner):** Buat proyek full-stack (mis. Next.js + Prisma) melalui satu perintah berjenjang (INIT → SCAFFOLD → IMPLEMENT → VERIFY → SECURE).
- **The Agent Loop (ReAct):** Membaca log error, memperbaiki kode, dan menjalankannya lagi secara otonom (*self-healing*).
- **Security Swarm (ANT-CYBER-CORPS):** Orkestrasi 5 Gray Unit ber-taksonomi untuk mengaudit keamanan lokal Anda (mencari celah auth, memory leaks, atau hardcoded secrets).
- **Dual-Vault Memory (MindBy 4-Tier):** Memori persisten antar-sesi. Mode offline menggunakan JSON lokal, mode cloud tersinkronisasi via CockroachDB (Vector 768-dim).
- **Shell Allowlist & Gatekeeper:** Mengamankan mesin Anda dengan pola `default deny` untuk perintah destruktif, dan `auto-approve` untuk *tools* pengembangan (seperti `npm`, `tsc`, `git`).
- **Evidence-Based Claims:** Agen tidak bisa berhalusinasi "sudah memperbaiki kode". Setiap eksekusi sukses wajib mencatatkan *evidence* (SHA-256 hash) di Ledger.

---

## 🛠 Panduan Instalasi (Quickstart)

### Prasyarat
- Node.js 22+
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
- `npm run test:unit` : Menjalankan 96/96 unit test lokal secara offline (termasuk security bypass suite).
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
| `ant doctor` | 🩺 Diagnostik kesehatan sistem inti ANT (Env, API, SQLite) |
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

Arsitektur ANT v0.4 (The Sovereign Runtime Era) dirumuskan, diuji, dan didogfood secara ketat melalui konsensus lintas arsitektur kognitif (*Cross-Model Peer Review*) — seluruh model di bawah ini adalah kontributor aktif nyata dari rekam jejak kodeks Ard:

- **Ard (Renaldy Adri):** Chief Architect, Sovereign Operator & Visionary.
- **Antigravity (Agy):** Lead Coding Pair & Runtime Engineer.

### 🤖 Frontier Architectural Council

**OpenAI Family**
- **GPT-5.6 Terra:** *Cognitive State Architecture, Recovery State Machine, & Multi-Agent Orchestration Design.*
- **GPT-5.6 Luna:** *Semantic Memory Layering, Long-Context Reasoning, & Pilar 4 Execution Chain.*
- **GPT-5.6 Sol:** *Red-Team Adversarial Testing, Shell Hardening Analysis, & Risk Register.*

**Google Gemini Family**
- **Gemini 3.5 Flash:** *Rapid Prototyping Validation & Tool Schema Iteration.*
- **Gemini 3.6 Flash:** *Agent Loop Optimization & Streaming Response Protocol.*
- **Gemini 3.7 Flash:** *Scaffolding Pipeline Design & Dynamic Healthcheck Spec.*
- **Gemini 3.1 Pro High:** *Deep Architectural Review, ADR-001 Git-First State Store, & Security Fence Specification.*

**Anthropic Claude Family**
- **Claude Sonnet 5:** *Variable-Friction Approval Gate, Anti-Automation Bias (R6), & Grand Consolidation Synthesis.*
- **Claude Sonnet 4.6 (Thinking):** *Sprint Planning & Implementation Validation, Debt Sprint Audit, SQLite Vault ADR-001 Spec, & Definition of Done Framework.*

**Kimi (Moonshot AI)**
- **Kimi 2.6:** *Distributed Concurrency Protocol, Event-Driven Callbacks, & Worktree Isolation Architecture.*

**DeepSeek**
- **DeepSeek V4 Flash:** *Pragmatic Doktrin P1–P4, Lightweight Inference Optimization, & Termux Mobile Compatibility.*
- **DeepSeek V4 Pro:** *Pilar 0 Security Fence Hardening, ADR-001 Rationale, & Distributed Lease Protocol Design.*

**MiniMax**
- **MiniMax M3:** *Proactive Engine Design, Cognitive Event Bus Architecture, & Memory Consolidation Cycle.*

**Mistral / NVIDIA**
- **Nemotron:** *Embedding Optimization, 768-dim Vector Vault Spec, & Semantic Search Ranking.*

**Stealth**
- **ox-alpha (stealth/OpenRouter):** *Live Runtime Validation langsung dari dalam ANT CLI v0.3.5 — Zero-Hallucination Audit & Evidence-Based Codebase Debugging.*

**Ollama Local Models (On-Device Sovereign Runtime)**
- **Qwen 3.8 Max, Gemma series, dan model lokal lainnya:** *Validasi on-device di Termux & Android, Offline-First Resilience Testing, & Latency Benchmarking.*

Lihat naskah lengkap spesifikasi di [**`ROADMAP_UBIQUITOUS_COMPANION.md`**](ROADMAP_UBIQUITOUS_COMPANION.md).

---

## 📜 Intellectual Property & Sovereign Declaration

- **Creator / Operator:** Ard
- **Parent Architecture:** CLUW-Genesis
- **Version:** v0.3.5 (Menuju v0.4) — Swarm Intelligence, CI/CD, & Scaffolding
- **License:** [Apache 2.0 License](LICENSE)

*"Model AI bersifat sementara. Arsitektur kognitif, memori, dan kedaulatan eksekusi bersifat abadi."*
