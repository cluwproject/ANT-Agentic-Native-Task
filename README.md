# ANT-CLI (Agentic Native Task)
### Sovereign Agentic Runtime × MindBy Persistent Cognitive Memory

> **You Ask. ANT Acts. Memory Persists. Evidence Remains.**  
> *Built for CockroachDB × AWS Hackathon 2026 — Track: Agentic Memory*

---

## 1. Executive Summary

**ANT-CLI** is a sovereign, terminal-native agentic runtime designed for security professionals and data-driven operators. It integrates a central orchestrator, a cryptographic memory ledger, and a swarm of specialized tactical agents into a single, cohesive command-line interface.

ANT is built on the philosophy of **Model Independence and Absolute Sovereignty**:
- **Swappable AI Brain:** Users can easily switch the underlying LLM engine (AWS Bedrock, Anthropic Claude, Google Gemini, DeepSeek, or Local Ollama) without breaking the core system architecture. The intelligence engine is just a pluggable module.
- **Persistent Memory:** Powered by CockroachDB Serverless, ensuring all contextual memory and operational logs survive system reboots and scaling events.
- **Edge-Ready:** Operates securely within constrained environments like standard terminal emulators or edge devices.

```text
                   USER / OPERATOR
                          │
                 [ Command / Prompt ]
                          │
                          ▼
                 ┌─────────────────┐
                 │  ANT Commander  │ ◄── Swappable LLM Brain
                 └────────┬────────┘     (Bedrock, Claude, Ollama)
                          │
    ┌─────────────────────┼──────────────────────┐
    ▼                     ▼                      ▼
 HTN Planner       MindBy Memory OS          Tool Engine
 (ReAct Loop)    (CockroachDB + Vector)    (Terminal/Shell)
                          │
                          ▼
                 ANT-CYBER-CORPS
        ┌──────────────────────────────────┐
        │  GRAY-1  GRAY-2  GRAY-3          │
        │  GRAY-4  GRAY-5  (Parallel Swarm)│
        └──────────────────────────────────┘
                          │
                          ▼
               COCKROACHDB CLOUD (Memory & Ledger)
```

---

## 2. MindBy — Cognitive Memory System

### 4-Tier Memory Architecture

| Layer | File/Table | Purpose |
| :--- | :--- | :--- |
| **Working** | `context.json` | Active conversation memory & task state |
| **Episodic** | `episodic.json` | Execution logs, error debugging, system events |
| **Semantic** | `semantic_memories` (CockroachDB) | Long-term knowledge, 768-dim vector embedding |
| **Core** | `core.json` | Permanent facts, user preferences, agent constitution |

### Dual-Vault Resilience

```text
ONLINE  ──► CockroachDB Serverless  (Vector Indexing, ACID, Multi-region)
OFFLINE ──► Local JSON Vault        (workspace/memories/*.json)
                │
                └── workspace/memories/pending_sync.json  ← offline queue
                      │
                      └── /sync  ← dispatch to cloud when online
```

### Embedding Pipeline (Offline-First)

- **Primary Provider:** `nomic-embed-text` via Ollama (274 MB, offline, 768-dim)
- **Cloud Provider (Optional):** AWS Bedrock Titan / OpenAI `text-embedding-3-small`
- Vectors are safely persisted in CockroachDB using `VECTOR(768)` indexing.

---

## 3. ANT-CYBER-CORPS — Tactical Security Swarm

5 Gray Units operate **in parallel** (`Promise.all`) to perform comprehensive security audits:

| Unit | Name | Domain Specialization |
| :--- | :--- | :--- |
| GRAY-1 | Memory & Logic Guardian | Internal Code Audits, Buffer Overflow, Race Conditions |
| GRAY-2 | Public Footprint Monitor | Open-Source Threat Intelligence (OSINT), Surface Web Scans |
| GRAY-3 | Credential Leak Checker | Deep Web Database Correlation, Email & Password Leaks |
| GRAY-4 | Cloud Infrastructure Scanner | Port Scanning, S3 Bucket Misconfigurations, Topology Mapping |
| GRAY-5 | Threat Intelligence Engine | Vulnerability Correlation, Threat Pattern Analysis |

### Swarm Execution Flow

```text
ant swarm "Goal" "Target"
      │
      ├── createMission()  →  workspace/missions/<id>.json  (Blackboard)
      │
      ├── Promise.all([
      │     runStaticAudit(GRAY-1, Target),
      │     runStaticAudit(GRAY-2, Target),
      │     runStaticAudit(GRAY-3, Target),
      │     runStaticAudit(GRAY-4, Target),
      │     runStaticAudit(GRAY-5, Target)
      │   ])
      │
      ├── Findings Consolidation → workspace/missions/<id>.json
      │
      └── renderSwarmReport()  →  Actionable intelligence rendered in terminal
```

---

## 4. Self-Healing Architecture

```text
Layer 1: JSON Repair via System Prompt
  └── If model output is invalid JSON → retry with repair instructions

Layer 2: File Rollback (SelfHealer)
  └── Automatically restores corrupt files from .bak backups

Layer 3: Mailbox Handover
  └── If unit consistently fails → hands over control to the Commander LLM
```

---

## 5. Quickstart & Cross-Platform Setup

ANT dirancang untuk berjalan di berbagai lingkungan (Edge to Desktop) dengan instalasi instan.

### Prerequisites (Prasyarat Umum)
- **Node.js** >= 20.0.0
- **Git** terpasang di sistem operasi.
- **Ollama** (Untuk memori lokal & *embedding* 768-dim):
  ```bash
  ollama pull nomic-embed-text
  ```

### Panduan Instalasi per Platform

**A. Windows (CMD / PowerShell)**
Buka `Command Prompt` (CMD) atau `PowerShell` sebagai Administrator (opsional tapi disarankan), lalu jalankan:
```cmd
git clone https://github.com/renaldyadri10/ant-cli.git
cd ant-cli
npm install
npm run build
npm start
```
*Catatan untuk PowerShell: Jika mendapat error eksekusi script, jalankan `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` terlebih dahulu.*

**B. macOS / Linux (Terminal)**
Buka aplikasi `Terminal`, lalu jalankan:
```bash
git clone https://github.com/renaldyadri10/ant-cli.git
cd ant-cli
npm install
npm run build
npm start
```

**C. Android (Termux)**
Buka aplikasi `Termux` (pastikan *storage permission* sudah aktif), lalu jalankan:
```bash
pkg install git nodejs -y
git clone https://github.com/renaldyadri10/ant-cli.git
cd ant-cli
npm install
npm run build
npm start
```

### Konfigurasi Pertama (Identity Setup)
Saat pertama kali menjalankan `npm start`, ANT akan meminta **Identitas Pengguna**:
```text
[ANT INITIALIZATION]
Identitas belum diatur. Siapa yang sedang mengakses sistem ini?
Masukkan nama Anda: 
```
Masukkan nama Anda. Identitas ini akan digunakan ANT untuk menyapa dan melacak log operasi, namun **Origin Sistem** akan tetap terkunci pada pendirinya (*CLUW Genesis / Ard*).

### Konfigurasi `.env` (Lanjutan)
Copy `.env.example` → `.env` untuk mengganti otak AI atau menghubungkan CockroachDB:

```env
USER_NAME=Ard

# Commander Model (LLM besar - Swappable)
AI_PROVIDER=ollama
CUSTOM_MODEL=gpt-oss:120b-cloud
BASE_URL=http://localhost:11434/v1

# CockroachDB (opsional — auto-fallback ke local JSON jika kosong)
DATABASE_URL=postgresql://<user>:<pass>@<cluster>.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
```

### Menjalankan ANT (Kapan Saja)
```bash
# Menjalankan dari source code
npm start

# Atau menjalankan secara global (jika sudah di-link)
ant
```

---

## 📟 Referensi Slash Command

### Memory & Vault
| Command | Fungsi |
| :--- | :--- |
| `/store <teks>` | Simpan memori semantik ke Dual-Vault (embedding nyata 768-dim) |
| `/recall <query>` | Cari memori via Vector Cosine Similarity (cloud + local) |
| `/memories` | Lihat semua memori tersimpan di CockroachDB |
| `/vault [cloud\|local]` | Ganti vault aktif (CockroachDB cloud / local offline) |
| `/sync` | Flush antrian offline `pending_sync.json` → kirim ke CockroachDB |

### Keamanan & Audit
| Command | Fungsi |
| :--- | :--- |
| `/swarm [path]` | Launch 5 Gray Unit paralel untuk audit keamanan kode |
| `/health` | Audit koneksi CockroachDB, statistik memori & evidence |

### Reasoning & Planning
| Command | Fungsi |
| :--- | :--- |
| `/plan <misi>` | Buat rencana terstruktur dengan HTN Planner |
| `/branch` | Buat, daftar, atau checkout conversation branch |
| `/checkpoint` | Simpan Git commit checkpoint dari workspace saat ini |
| `/skills` | Lihat daftar custom skills yang tersedia |

### Session & Model
| Command | Fungsi |
| :--- | :--- |
| `/model <nama>` | Hot-swap model AI aktif (Ollama / Bedrock / OpenAI) |
| `/session list` | Lihat semua session tersimpan |
| `/resume [id]` | Lanjutkan session sebelumnya dengan context bridging |
| `/mailbox` | Inspeksi inter-model relay & handover ledger |

### Sistem
| Command | Fungsi |
| :--- | :--- |
| `/undo` | Restore file dari backup `.bak` terakhir |
| `/git status\|diff\|log` | Operasi Git dari dalam CLI |
| `/help` | Tampilkan semua command & opsi operasional |
| `/exit` | Keluar dengan ritual konsolidasi memori |

---

## 🗂️ Struktur Proyek

```
ant-cli/
├── src/
│   ├── core/
│   │   ├── cli.ts                    # Entry point CLI + semua slash commands
│   │   ├── mindby_cockroach.ts       # CockroachDB Dual-Vault engine
│   │   ├── memory.ts                 # 4-Tier local memory + getEmbedding()
│   │   ├── slash_menu.ts             # Autocomplete slash menu
│   │   ├── ai/
│   │   │   ├── index.ts              # AI adapter (Ollama/Bedrock/OpenAI)
│   │   │   └── tiers/slm.ts          # SLM distillation handler
│   │   ├── agent_loop/
│   │   │   ├── agentLoop.ts          # ReAct loop utama + metrics
│   │   │   ├── evidenceLedger.ts     # SHA-256 evidence tracking
│   │   │   └── healing.ts            # Self-healing 3-layer
│   │   └── agentic/
│   │       ├── swarm_orchestrator.ts # ANT-CYBER-CORPS swarm engine ← BARU
│   │       ├── planner.ts            # HTN Planner
│   │       ├── mailbox/              # Inter-model relay + circuit breaker
│   │       ├── branching.ts          # Conversation branching
│   │       └── sub_agents.ts         # Sub-agent execution
│   ├── shared/
│   │   └── data.ts                   # getBrainConfig() — model config
│   └── utils/
│       └── logger.ts                 # Structured logging
├── workspace/
│   ├── memories/
│   │   ├── semantic.json             # Local semantic vault
│   │   ├── episodic.json             # Episodic log
│   │   ├── core.json                 # Core facts
│   │   └── pending_sync.json         # Offline sync queue ← BARU
│   └── missions/
│       └── mission-<id>.json         # Swarm blackboard ← BARU
├── .env.example                      # Template konfigurasi lengkap
└── README.md
```

---

## 🛠️ Technology Stack

| Layer | Teknologi |
| :--- | :--- |
| **Persistent Memory** | CockroachDB Serverless (`VECTOR(768)`, ACID, Multi-region) |
| **Embedding Engine** | `nomic-embed-text` via Ollama (768-dim, offline-first) |
| **Commander LLM** | Ollama cloud models / AWS Bedrock / OpenAI compatible |
| **Swarm SLM** | `qwen2.5:0.5b` via Ollama (Gray Unit 0.5B) |
| **Runtime** | Node.js 20+, TypeScript, ESM |
| **Protocol** | Model Context Protocol (MCP), ANT-MAIL/1.0 |
| **Evidence** | SHA-256 kriptografis, CockroachDB `evidence_ledger` |

---

## 📜 Intellectual Property & Sovereign Declaration

- **Creator / Operator:** Renaldy Adri (Ard)
- **Parent Architecture:** CLUW-Genesis (Declared 27 July 2026)
- **Version:** v0.3.0 — Swarm Intelligence & Memory Hardening
- **License:** [MIT License](LICENSE)

*"Model AI bersifat sementara. Arsitektur kognitif dan memori bersifat berkelanjutan."*
