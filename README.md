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

## 5. Quickstart

### Prerequisites
- Node.js >= 20.0.0
- Ollama (untuk inference lokal + embedding)
  ```bash
  ollama pull nomic-embed-text   # Wajib — embedding engine (274 MB)
  ollama pull qwen2.5:0.5b       # Untuk Gray Unit swarm (opsional)
  ```
- CockroachDB Serverless (opsional — sistem fallback ke local jika tidak ada)

### Instalasi
```bash
git clone https://github.com/renaldyadri10/ant-cli.git
cd ant-cli
npm install
npm run build
```

### Konfigurasi `.env`
Copy `.env.example` → `.env` lalu isi:

```env
USER_NAME=Ard

# Commander Model (LLM besar)
AI_PROVIDER=ollama
CUSTOM_MODEL=gpt-oss:120b-cloud
BASE_URL=http://localhost:11434/v1

# Swarm Gray Unit (0.5B SLM) — satu key untuk semua 5 unit
ANT_SWARM_MODEL=qwen2.5:0.5b

# SLM Safety Limits
ANT_SLM_MAX_FILE_KB=24
ANT_SLM_MAX_FILES_PER_UNIT=8

# CockroachDB (opsional — auto-fallback ke local jika kosong)
DATABASE_URL=postgresql://<user>:<pass>@<cluster>.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
MEMORY_VAULT_MODE=cloud
```

> **Model Gray Unit** tidak perlu diset per-unit. Cukup `ANT_SWARM_MODEL=qwen2.5:0.5b` 
> untuk semua 5 unit. Override per-unit tersedia via `ANT_GRAY_1_MODEL` s/d `ANT_GRAY_5_MODEL`.

### Menjalankan ANT

```bash
# Development (langsung dari TypeScript)
npm start

# Atau setelah build — dari mana saja
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
