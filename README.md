# ANT-CLI — Agentic Native Task
### Sovereign Agentic Runtime × MindBy Persistent Cognitive Memory × ANT-CYBER-CORPS

> **You Ask. ANT Acts. Memory Persists. Evidence Remains.**  
> *Built for CockroachDB × AWS Hackathon 2026 — Track: Agentic Memory*

---

## 🌟 Apa Itu ANT?

**ANT-CLI** adalah *sovereign agentic runtime* berbasis CLI yang menggabungkan tiga sistem inti secara terintegrasi:

1. **ANT Commander** — LLM besar (120B cloud / Ollama) yang menerima misi dari pengguna, melakukan *reasoning*, memanggil tools, dan mengorkestrasi sub-agen.
2. **MindBy Memory OS** — Mesin memori kognitif 4-tier dengan dual-vault (CockroachDB Cloud + Local JSON), embedding 768-dim via `nomic-embed-text`, dan offline sync queue.
3. **ANT-CYBER-CORPS** — Pasukan 5 sub-agen kecil (0.5B SLM) yang bekerja **paralel** untuk mengaudit keamanan kode secara cepat dan ringan.

```
                   USER / OPERATOR (Ard)
                             │
                    /command atau prompt bebas
                             │
                             ▼
                    ┌─────────────────┐
                    │  ANT Commander  │ ◄── Slash Menu / CLI / MCP
                    │  (LLM Besar)    │
                    └────────┬────────┘
                             │
       ┌─────────────────────┼──────────────────────┐
       ▼                     ▼                      ▼
  HTN Planner         MindBy Memory OS         Tool Engine
  (ReAct Loop)        (4-Tier + Dual Vault)    (Terminal/Git/Web)
       │                     │                      │
       └─────────────────────┼──────────────────────┘
                             ▼
                    ANT-CYBER-CORPS
           ┌──────────────────────────────────┐
           │  GRAY-1  GRAY-2  GRAY-3          │
           │  GRAY-4  GRAY-5  (Paralel 0.5B)  │
           └──────────────────────────────────┘
                             │
          ┌──────────────────┴───────────────────┐
          ▼                                      ▼
┌──────────────────────┐             ┌───────────────────────┐
│   EVIDENCE LEDGER    │             │   COCKROACHDB CLOUD   │
│  SHA-256 Kriptografis│             │  semantic_memories    │
│  finding_cards table │             │  finding_cards table  │
│  (Audit Trail)       │             │  evidence_ledger      │
└──────────────────────┘             └───────────────────────┘
```

---

## 🧠 MindBy — Sistem Memori Kognitif

### 1. Arsitektur 4-Tier Memory

| Layer | File/Table | Fungsi |
| :--- | :--- | :--- |
| **Working** | `context.json` | Memori percakapan aktif & task state saat ini |
| **Episodic** | `episodic.json` | Log eksekusi, error debugging, kejadian sistem |
| **Semantic** | `semantic_memories` (CockroachDB + local) | Pengetahuan jangka panjang, 768-dim vector embedding |
| **Core** | `core.json` | Fakta permanen, preferensi user, konstitusi agen |

### 2. Dual-Vault Resilience

```
ONLINE  ──► CockroachDB Serverless  (Vector Indexing, ACID, Multi-region)
OFFLINE ──► Local JSON Vault        (workspace/memories/*.json)
                │
                └── workspace/memories/pending_sync.json  ← antrian offline
                      │
                      └── /sync  ← kirim ke cloud saat kembali online
```

### 3. Embedding Pipeline (Offline-First)

- **Provider utama:** `nomic-embed-text` via Ollama (274 MB, offline, 768-dim)
- **Provider cloud (opsional):** AWS Bedrock Titan / OpenAI `text-embedding-3-small`
- Semua vector disimpan ke CockroachDB dengan `VECTOR(768)` + tag sharding
- **Cosine Similarity Query:**
  ```sql
  SELECT id, content, (1 - (embedding <=> $1::VECTOR(768))) AS score
  FROM semantic_memories
  WHERE embedding IS NOT NULL AND tags && ARRAY['gray-2']::STRING[]
  ORDER BY score DESC LIMIT 5;
  ```

---

## 🐜 ANT-CYBER-CORPS — Pasukan Keamanan Swarm

5 Gray Unit bekerja **paralel** (`Promise.all`) untuk mengaudit ancaman keamanan kode:

| Unit | Nama | Domain Spesialisasi |
| :--- | :--- | :--- |
| GRAY-1 | Memory & Logic Guardian | Buffer Overflow, Memory Leak, Race Condition |
| GRAY-2 | Injection Sifter | SQL Injection, XSS, Command Injection, Path Traversal |
| GRAY-3 | Auth & Identity Architect | IDOR, Broken Auth, JWT Bypass, Privilege Escalation |
| GRAY-4 | Supply Chain Sentinel | CVE, Vulnerable Dependencies, Malicious Packages |
| GRAY-5 | Cloud & Config Auditor | Exposed Secrets, Insecure Config, IAM Misconfiguration |

### Cara Kerja Swarm Audit

```
/swarm src/
      │
      ├── createMission()  →  workspace/missions/<id>.json  (Blackboard)
      │
      ├── Promise.all([
      │     runStaticAudit(GRAY-1, src/),
      │     runStaticAudit(GRAY-2, src/),
      │     runStaticAudit(GRAY-3, src/),
      │     runStaticAudit(GRAY-4, src/),
      │     runStaticAudit(GRAY-5, src/)
      │   ])
      │
      ├── Finding Cards → workspace/missions/<id>.json (local)
      │                → CockroachDB finding_cards table (jika online)
      │
      └── renderSwarmReport()  →  laporan berwarna di terminal
```

### SLM Safety Guard (Anti-Crash & Anti-Halu)

Gray Unit **tidak akan menyentuh** file yang:
- Ukurannya > `ANT_SLM_MAX_FILE_KB` KB (default: **24 KB**, hard ceiling: 64 KB)
- Berekstensi `.min.js`, `.bundle.js`, `.map`, `.lock`, `.jsonl`

File yang diblokir → dicatat ke log → diserahkan ke Commander (LLM besar).

---

## ⚡ Self-Healing (3 Lapisan Eskalasi)

```
Lapisan 1: JSON Repair via System Prompt
  └── Jika model output tidak valid JSON → retry dengan instruksi repair

Lapisan 2: .bak File Rollback (SelfHealer)
  └── healing.ts → restore file dari backup .bak otomatis

Lapisan 3: AntModelMailbox Handover
  └── Jika SLM error berulang → serahkan kontrol ke LLM besar (Commander)
```

---

## 🚀 Quickstart

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
