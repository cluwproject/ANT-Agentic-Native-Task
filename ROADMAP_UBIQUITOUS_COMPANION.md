# 🐜 ANT v0.4: Master Blueprint — Persistent Sovereign Distributed Agent Runtime

> **Doktrin Inti:** *"Yang sempit kita perluas, yang terlalu luas kita efisienkan — tapi yang belum terbukti, kita validasi dulu sebelum dibangun."*  
> **Origin & Architecture:** CLUW Genesis / ANT Sovereign Runtime  
> **Founder / Operator:** Ard (Renaldy Adri)  
> **Version:** Menuju v0.4.0 (The Validated Symbiosis Era)  
> **Synthesis:** Unified Architectural Triad (Cross-Audited by GPT, Kimi, & Qwen)  
> **Date:** 22 Agustus 2026  

---

## 🧭 0. Empat Prinsip Desain Mutlak (Non-Negotiable)

1. **P1 — Intent Fidelity First:** Setiap fitur harus meminimalkan jarak antara apa yang pengguna maksud dan apa yang agen lakukan. Setiap ambiguitas wajib melewati konfirmasi.
2. **P2 — Prove Before You Build:** Setiap fase wajib divalidasi dan diuji secara nyata (*dogfooding*) oleh operator sebelum melangkah ke pilar berikutnya.
3. **P3 — Boring Technology Wins:** Prioritaskan teknologi sederhana yang terbukti tangguh (Git-First + SQLite) untuk menjaga efisiensi di Android/Termux tanpa ketergantungan database cloud berat.
4. **P4 — Security is a Pillar, Not a Feature:** Keamanan adalah pembatas mutlak di awal desain, bukan sekadar pelengkap di akhir.

---

## 🏛️ 1. Struktur 4+1 Pilar Arsitektur

```
                               ┌─────────────────────────────────┐
                               │    ARD (ARCHITECT / VISION)     │
                               └────────────────┬────────────────┘
                                                │
    ┌──────────────┬────────────────────────────┼────────────────────────────┬──────────────┐
    ▼              ▼                            ▼                            ▼              │
┌────────┐   ┌──────────┐                 ┌──────────┐                 ┌──────────┐         │
│PILAR 0 │   │ PILAR 1  │                 │ PILAR 2  │                 │ PILAR 3  │         │
│SECURITY│   │  REMOTE  │                 │ SESSION  │                 │ AMBIENT  │         │
│ FENCE  │   │ DISPATCH │                 │ TELEPORT │                 │ GUARDIAN │         │
└────┬───┘   └────┬─────┘                 └────┬─────┘                 └────┬─────┘         │
     │            │                            │                            │               │
     └────────────┴────────────────────────────┴────────────────────────────┘               │
                                                ▼                                           │
                               ┌─────────────────────────────────┐                          │
                               │   ANT RUNTIME GOVERNANCE CORE   │                          │
                               ├─────────────────────────────────┤                          │
                               │ • Explicit Deny L5 Allowlist    │                          │
                               │ • Cryptographic Execution Chain │◄─────────────────────────┘
                               │ • Git-First State + SQLite Vault│
                               │ • Recovery-First State Machine  │
                               │ • Procedural Skill Distillation │
                               └─────────────────────────────────┘
```

---

### 🔒 PILAR 0: Security Fence (Dedicated Security Boundary)
*   **Masalah:** Remote daemon, webhook, dan file watcher memperluas *attack surface* sistem.
*   **Komponen Pertahanan:**
    1. **Sandboxed Execution:** Akses sistem file terisolasi ketat di dalam direktori proyek dengan proteksi symlink traversal.
    2. **Secret Isolation:** Kredensial & API Key disuntikkan runtime via Environment Variables; dilarang keras masuk prompt atau memori.
    3. **Telegram Hardening:** Bot hanya merespons `user_id` operator yang di-whitelist, dengan rate limiter (maks 10 perintah/menit).
    4. **Explicit Deny L5 Allowlist:** Deny-by-default untuk semua perintah shell di luar allowlist aman.
    5. **Kill Switch:** Perintah `ant kill` instan untuk mematikan semua daemon dan mencabut seluruh session lease dalam < 1 detik.

---

### 🚀 PILAR 1: Remote Dispatch Bridge (Telegram / Webhook Companion)
*   **Threat Model:** Pesan Telegram adalah **Untrusted Intent**, bukan instruksi terminal langsung.
*   **Mekanisme Teruji:**
    1. **Asynchronous Event Callback:** Membalas `Task Accepted: ID-xxxx` < 1 detik untuk melewati batas timeout 60 detik Telegram, lalu memperbarui status via `edit_message`.
    2. **Milestone Plan Approval Gate:** Untuk instruksi kompleks, ANT mengirimkan ringkasan rencana terlebih dahulu dan menunggu tap tombol `[Lanjut]` / `[Revisi]` sebelum menyentuh kode.
    3. **Git Worktree Isolation:** Setiap tugas asinkron berjalan di Git Worktree terisolasi (`git worktree add ../task-xxx`).
    4. **Pipeline:** `Telegram Intent → HMAC Auth → Disambiguation Gate → Plan Approval → Sandbox Worktree Execution → Verification → Chained Evidence → Telegram Response`.

---

### 🌌 PILAR 2: Session Teleport & Distributed State (Termux ↔ Laptop)
*   **Prinsip:** Git adalah *Source of Truth* status kode; SQLite adalah penyimpan vektor embedding lokal (ringan & hemat RAM Termux).
*   **Mekanisme Teruji:**
    1. **Distributed Lease Lock (TTL 60s):** Device yang aktif memegang lease dengan heartbeat berkala. Device lain yang membuka sesi masuk ke **Read-Only Mirror Mode**.
    2. **Vector Delta Sync:** Hanya menyinkronkan embedding baru (*delta*) saat online, tanpa full database dump.
    3. **Optimistic Concurrency Control (OCC):** Deteksi konflik versi (`State v41` vs `State v42`) untuk mencegah overwrite data antar-perangkat.

---

### 🛡️ PILAR 3: Event-Driven Ambient Guardian (`ant watch` Mode)
*   **Prinsip:** Penjaga hening tanpa kebisingan notifikasi (*Zero Fatigue*).
*   **Mekanisme Teruji:**
    1. **Debounced Watcher (500ms):** Mengabaikan file `node_modules`, `.git`, dan `dist`.
    2. **Escalation Filter:**
       *   *Tier 1 (AST Check < 5ms):* Deteksi syntax error murni tanpa LLM token.
       *   *Tier 2 (Context Filter):* Supresi notifikasi jika user sedang di file test atau proses debugging aktif.
       *   *Tier 3 (Deep Gray Scan):* Hanya memberi peringatan ramah jika ditemukan celah keamanan berstatus **CRITICAL** (misal: kebocoran token atau SQLi).

---

### 🔍 PILAR 4: Cryptographic Execution Chain
*   **Prinsip:** *"Hash membuktikan integritas teks; Rantai Eksekusi membuktikan kebenaran tindakan dan reproduktibilitas lingkungan."*
*   **Format Bukti:** `Action + Exit Code 0 + Environment Snapshot (Node/Lockfile SHA) + Stdout Digest + Git HEAD Anchor + Parent Evidence Hash`.

---

### 🧬 PILAR 5: Recovery-First Agent State Machine
```
┌─────────────┐
│    INIT     │ (Capture Git Anchor & Environment Snapshot)
└──────┬──────┘
       ↓
   PLANNING     (Task Decomposition & Plan Approval Gate)
       ↓
  EXECUTING     (Specialist Tool Calling in Isolated Worktree)
       ↓
  VERIFYING     (Tests / Typecheck / Healthcheck)
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

## 📝 Architecture Decision Records (ADRs)

### ADR-001: Git-First State Store + Local SQLite Vector Vault
*   **Status:** ACCEPTED
*   **Context:** Session Teleport membutuhkan sinkronisasi status yang andal lintas perangkat (Termux HP & Laptop) dan bekerja offline tanpa biaya overhead cloud tinggi.
*   **Decision:** Gunakan Git sebagai penyimpan status utama + SQLite lokal untuk vektor memori. CockroachDB tetap didukung sebagai opsi sinkronisasi cloud sekunder.
*   **Consequences:**
    *   ✅ Sederhana, zero-dependency cloud wajib, 100% Termux-friendly.
    *   ✅ Bebas biaya database cluster bulanan saat offline.
    *   ⚠️ Penanganan konflik multi-device ditangani via Lease Lock + Git branch merge.

---

## ⚠️ Risk Register

| ID | Risiko Potensial | Probabilitas | Dampak | Strategi Mitigasi |
| :--- | :--- | :---: | :---: | :--- |
| **R1** | Over-engineering / Scope Creep | Tinggi | Tinggi | Prinsip P2: *Prove Before You Build*. Kunci roadmap per fase, validasi via dogfooding 2 minggu. |
| **R2** | Telegram Token Leak / Unauthorized Access | Sedang | Kritis | Pilar 0: Hardcoded `user_id` whitelist, rate limiter, kill-switch instan (`ant kill`). |
| **R3** | Prompt Injection via Telegram Input | Sedang | Tinggi | Pilar 0: Sanitasi ketat semua remote intent sebelum masuk context window model. |
| **R4** | Multi-Device Conflict saat Session Teleport | Sedang | Sedang | Pilar 2: Distributed Lease Lock (TTL 60s) + Read-Only Mirror Mode. |
| **R5** | Alert Fatigue pada Ambient Guardian | Tinggi | Sedang | Pilar 3: Debounce 500ms, Tier 1 AST filter, hanya notify untuk risiko CRITICAL. |

---

## 🎯 5 Kriteria Kelulusan Mutlak (Acceptance Criteria v0.4)

1. **Remote-Safe:** Remote intent melewati *Untrusted Intent Sandbox*, *Plan Approval Gate*, dan *L5 Allowlist*.
2. **State-Consistent:** Sesi multi-device terlindungi oleh *Distributed Lease Lock (TTL 60s)* dan *OCC*.
3. **Evidence-Verifiable:** Bukti eksekusi menyertakan Exit Code 0, Git Head Anchor, dan rantai parent hash.
4. **Autonomous Recovery:** State machine memiliki loop *Fail → Recover → Re-verify → Safe Rollback*.
5. **Session Teleport Continuity:** Melanjutkan *Execution State* nyata antar-perangkat, bukan sekadar riwayat chat.

---

## 📅 Tahapan Eksekusi Bertahap (Phased Validation Roadmap)

- [x] **FASE 1 — FOUNDATION (v0.3.0):** L5 Allowlist, Swarm 5-Unit, Tool Catalog, Memory Consolidation, & Procedural Distillation.
- [ ] **FASE 2 — RESILIENCE (v0.3.5):** Sprint S4 (Dynamic HTTP Healthcheck & Response Contract Testing di VERIFY Gate).
- [ ] **FASE 3 — REMOTE DISPATCH (v0.4.0-Alpha):** Pilar 0 (Security Fence) + Pilar 1 (Telegram Bot Daemon, Plan Approval Gate, Worktree Isolation).
- [ ] **FASE 4 — SESSION TELEPORT (v0.4.0-Beta):** Pilar 2 (Git-First State Sync, Lease Lock Heartbeat, Vector Delta Sync).
- [ ] **FASE 5 — AMBIENT GUARDIAN (v0.4.0-GA):** Pilar 3 (`ant watch` Mode, Event-Driven Escalation, Open Standard MCP Support).
