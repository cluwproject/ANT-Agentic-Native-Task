# 🐜 ANT v0.4: Master Blueprint — Persistent Distributed Agent Runtime

> **Doktrin Inti:** *"Yang sempit kita perluas, yang terlalu luas kita efisienkan dengan hal yang lebih bervisi."*  
> **Origin & Architecture:** CLUW Genesis / ANT Sovereign Runtime  
> **Founder / Operator:** Ard (Renaldy Adri)  
> **Version:** Menuju v0.4.0 (The Distributed & Symbiotic Era)  
> **Status:** Hardened Distributed Systems Specification (Cross-Audited by GPT & Kimi)  
> **Date:** 22 Agustus 2026  

---

## 🧭 1. Visi Strategis: Dari CLI Lokal Menuju Distributed Agent Runtime

Coding agent konvensional (Claude Code, Hermes, OpenClaw) saat ini masih terisolasi sebagai **"alat pasif terminal tunggal"**. Mereka tidak memiliki kontinuitas lintas perangkat, tidak bisa diakses dari luar terminal, dan mudah mengalami amnesia konteks.

ANT v0.4 mendefinisikan ulang posisi sistem: **Bukan sekadar autocomplete atau CLI tool, melainkan Persistent Distributed Agent Runtime yang aman, memiliki kontinuitas eksekusi antar-perangkat, dan memverifikasi setiap tindakan melalui rantai bukti kriptografis.**

---

## 🏛️ 2. Arsitektur Terdistribusi & 3 Pilar Terobosan

```
                               ┌─────────────────────────────────┐
                               │    ARD (ARCHITECT / VISION)     │
                               └────────────────┬────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
     [PILAR 1: REMOTE DISPATCH]      [PILAR 2: SESSION TELEPORT]     [PILAR 3: AMBIENT GUARDIAN]
      Remote Trust Boundary           Distributed State Leasing       Event-Driven Escalation
      (Untrusted Intent → Sandbox)    (OCC Version Lock & Anchor)    (Silent AST → Alert on Critical)
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                ▼
                               ┌─────────────────────────────────┐
                               │   ANT RUNTIME GOVERNANCE CORE   │
                               ├─────────────────────────────────┤
                               │ • L5 Allowlist (Anti-Destructive)│
                               │ • Cryptographic Execution Chain │
                               │ • Dual-Vault Memory (Cockroach) │
                               │ • Recovery-First State Machine  │
                               │ • Standard MCP Client/Server    │
                               └─────────────────────────────────┘
```

---

### 🚀 Pilar 1: Remote Execution Trust Boundary (Telegram / Webhook Companion)
*   **Threat Model Baru:** Mengubah Telegram dari "chat biasa" menjadi antarmuka eksekusi berdaya tinggi.
*   **Prinsip Keamanan:** Pesan dari Telegram **TIDAK PERNAH dianggap sebagai perintah langsung**, melainkan sebagai **Untrusted Intent**.
*   **Engineering Rules (Solusi Bottleneck Kimi):**
    1. **Asynchronous Event-Driven Callback:** Mengatasi timeout 60 detik Telegram Webhook. ANT langsung mengirim balasan `Task Accepted: ID-xxxx` dalam < 1 detik, lalu melakukan push pembaruan progres/diff secara bertahap via Telegram `edit_message`.
    2. **Interactive Intent Disambiguation Loop:** Untuk instruksi ambigu ("Tolong perbaiki bug auth kemarin"), ANT memeriksa memori dan meminta konfirmasi eksplisit sebelum bertindak: *"Apakah maksudmu bug token JWT di `src/auth.ts` baris 45 (Issue #12)? [Y/N]"*.
    3. **Git Worktree Isolation per Task:** Setiap task asinkron dieksekusi di *Git Worktree* terpisah (`git worktree add ../task-xxx`) agar tidak terjadi tabrakan file jika ada beberapa task berjalan bersamaan.
    4. **Pipeline Eksekusi:**
       ```
       REMOTE INTENT (Telegram)
              ↓
       1. Identity & HMAC Signature Verification
              ↓
       2. Disambiguation & Scope Confirmation
              ↓
       3. Risk Classification (LOW / MEDIUM / HIGH / CRITICAL)
              ↓
       4. Sovereign Permission Gate (L5 Allowlist)
              ↓
       5. Worktree Execution Sandbox
              ↓
       6. Verification & Test Suite
              ↓
       7. Cryptographic Evidence Generation
              ↓
       Response (Verified Diff + Evidence Receipt)
       ```

---

### 🌌 Pilar 2: Distributed Agent State & Session Teleport (Termux ↔ Laptop)
*   **Masalah:** Sinkronisasi multi-device rawan *Race Condition* dan *Overwrite Conflict* jika HP dan Laptop aktif bersamaan.
*   **Solusi:** Memisahkan `MEMORY` dari `EXECUTION STATE`, dan menerapkan **Distributed Lease Lock + Optimistic Concurrency Control (OCC)**:
*   **Struktur State Terdistribusi:**
    ```ts
    interface DistributedAgentState {
        stateId: string;
        version: number;          // e.g. v42
        parentStateId: string;
        deviceId: 'termux' | 'laptop' | 'cloud';
        leaseOwner: string;       // Unique Session UUID
        leaseExpiresAt: string;   // Heartbeat Lock (TTL 60s)
        gitAnchorCommit: string;  // SHA-256 Commit Snapshot
        currentMilestone: string;
        pendingTasks: string[];
    }
    ```
*   **Protokol Anti-Konflik & Lease Heartbeat:**
    *   **Active Lease:** Device A (misal: Laptop) memegang lease dengan heartbeat 30 detik.
    *   **Read-Only Mirror Mode:** Jika Device B (Termux) membuka `ant resume` saat lease masih dipegang Device A, Device B otomatis masuk mode *Read-Only Mirror* (bisa memantau state tanpa risiko menimpa data).
    *   **Bandwidth-Efficient Vector Delta Sync:** Hanya menyinkronkan *vektor embedding 768-dim baru* (delta) melalui jaringan mobile Termux, bukan dump database penuh.
    *   **Time-Travel State Rollback:** Memanfaatkan query CockroachDB `AS OF SYSTEM TIME` untuk memulihkan state jika terjadi anomali.

---

### 🛡️ Pilar 3: Event-Driven Ambient Guardian (`ant watch` Mode)
*   **Masalah:** Pemindaian AI pada setiap kali tombol Ctrl+S ditekan akan membebani CPU dan memicu *alert fatigue* (notifikasi berisik).
*   **Solusi:** Arsitektur **Debounced Event-Driven Escalation Filter**:
    ```
    File Change (Save Event)
           ↓ (Debounce 500ms + Ignore node_modules, .git, dist)
    [Tier 1] Cheap AST Static Check (< 5ms, Zero LLM Token)
           ↓
    [Tier 2] Context & Taint Risk Filter (Bukan file test yang sengaja di-fail?)
           ↓ (Hanya jika lolos Tier 2)
    [Tier 3] Gray Unit Deep Audit (LLM / Security Scanner)
           ↓ (Hanya jika risiko HIGH / CRITICAL)
    Tactical Friendly Notification ke Developer
    ```

---

### 🔍 Pilar 4: Cryptographic Execution Chain (Authenticity & Reproducibility)
*   **Prinsip:** *"Hash membuktikan integritas teks, tetapi Rantai Eksekusi membuktikan kebenaran tindakan dan reproduktibilitas lingkungan."*
*   **Struktur Rantai Bukti (Evidence Record):**
    ```
    Evidence #204
    ├── Action: npm run test:unit
    ├── Exit Code: 0
    ├── Environment: { node: "v22.14.0", lockfile_sha: "9f82ab...", os: "linux" }
    ├── Stdout Digest: 44 tests passed (0 failures)
    ├── Git HEAD Anchor: a8f21c...
    ├── Timestamp: 2026-08-22T14:24:00Z
    ├── Parent Evidence: #203 (sha256:77425d2...)
    └── Cryptographic Signature: [EVID:sha256_receipt_xxxx]
    ```

---

### 🧬 Pilar 5: Recovery-First Agent State Machine
```
┌─────────────┐
│    INIT     │ (Capture Git Anchor & Environment Snapshot)
└──────┬──────┘
       ↓
   PLANNING     (Task Decomposition & Intent Confirmation)
       ↓
  EXECUTING     (Specialist Tool Calling in Isolated Worktree)
       ↓
  VERIFYING     (Tests / Typecheck / Contract Response Healthcheck)
  ↙       ↘
FAILED   PASSED
  ↓         ↓
RECOVER   SECURE (Gray Units 5-Tier Audit)
  │         │
  └────┬────┘
       ↓
   EVIDENCE     (Chained SHA-256 Receipts)
       ↓
    COMMIT      (Atomic Git Commit)
       ↓
     DONE       (Procedural Gold Standard Distillation)
```

---

## 🎯 5 Kriteria Kelulusan Mutlak (Acceptance Criteria v0.4)

Sebelum versi `v0.4.0` dirilis secara publik, sistem harus memenuhi 5 gerbang kelulusan:

1. **Remote-Safe:** Pesan dari Telegram/Webhook wajib melewati *Untrusted Intent Sandbox*, *Disambiguation Confirmation*, dan *L5 Allowlist*.
2. **State-Consistent:** Sesi multi-device (Termux ↔ Laptop) memiliki proteksi *Distributed Lease Lock (TTL 60s)* dan *OCC* untuk mencegah *state overwrite*.
3. **Evidence-Verifiable:** Bukti eksekusi wajib mencakup Exit Code 0, Git Head Anchor, Environment Lockfile Hash, dan rantai parent hash.
4. **Autonomous Recovery:** Agen memiliki loop *Fail → Understand → Auto-Patch → Re-verify → Safe Rollback* jika batas perbaikan habis.
5. **Session Teleport Continuity:** Perpindahan perangkat melanjutkan *Execution State*, bukan sekadar memuat memori riwayat lama.

---

## 📅 Tahapan Eksekusi Roadmap

- [x] **v0.3.0 Foundation:** L5 Allowlist, Swarm 5-Unit, Milestone Scaffolding, Tool Catalog Injection, Memory Consolidation, & Procedural Skill Distillation.
- [ ] **v0.3.5 Resilience:** Sprint S4 (Dynamic HTTP Healthcheck & Response Contract Testing di VERIFY Gate).
- [ ] **v0.4.0-Alpha:** Pilar 1 (Remote Dispatch Bridge via Telegram Bot Daemon + Worktree Isolation).
- [ ] **v0.4.0-Beta:** Pilar 2 (Session Teleport, Distributed Lease Heartbeat, & Vector Delta Sync).
- [ ] **v0.4.0-GA:** Pilar 3 (`ant watch` Ambient Guardian & Open Standard MCP Client/Server).
