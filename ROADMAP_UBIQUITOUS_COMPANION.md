# 🐜 ANT v0.4: Master Blueprint — Persistent Distributed Agent Runtime

> **Doktrin Inti:** *"Yang sempit kita perluas, yang terlalu luas kita efisienkan dengan hal yang lebih bervisi."*  
> **Origin & Architecture:** CLUW Genesis / ANT Sovereign Runtime  
> **Founder / Operator:** Ard (Renaldy Adri)  
> **Version:** Menuju v0.4.0 (The Distributed & Symbiotic Era)  
> **Status:** Hardened Architectural Blueprint  
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
                               └─────────────────────────────────┘
```

---

### 🚀 Pilar 1: Remote Execution Trust Boundary (Telegram / Webhook Companion)
*   **Threat Model Baru:** Mengubah Telegram dari "chat biasa" menjadi antarmuka eksekusi berdaya tinggi.
*   **Prinsip Keamanan:** Pesan dari Telegram **TIDAK PERNAH dianggap sebagai perintah langsung**, melainkan sebagai **Untrusted Intent**.
*   **Pipeline Eksekusi Aman:**
    ```
    REMOTE INTENT (Telegram)
           ↓
    1. Identity & Signature Verification
           ↓
    2. Intent & Scope Normalization
           ↓
    3. Risk Classification (LOW / MEDIUM / HIGH / CRITICAL)
           ↓
    4. Sovereign Permission Gate (L5 Allowlist)
           ↓
    5. Execution Sandbox (Isolated Process)
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
*   **Solusi:** Memisahkan `MEMORY` dari `EXECUTION STATE`, dan menerapkan **Optimistic Concurrency Control (OCC) + State Leasing**:
*   **Struktur State Terdistribusi:**
    ```ts
    interface DistributedAgentState {
        stateId: string;
        version: number;          // e.g. v42
        parentStateId: string;
        deviceId: 'termux' | 'laptop' | 'cloud';
        leaseOwner: string;       // Unique Session UUID
        leaseExpiresAt: string;   // Heartbeat Lock
        gitAnchorCommit: string;  // SHA-256 Commit Snapshot
        currentMilestone: string;
        pendingTasks: string[];
    }
    ```
*   **Protokol Anti-Konflik:**
    *   Jika Laptop mencoba menulis berdasarkan State `v41`, tapi Termux sudah memajukan state ke `v42` → **Ditolak dengan Conflict Alert**, bukan di-overwrite. Pengguna dipandu melakukan merge/rekonsiliasi state secara aman.

---

### 🛡️ Pilar 3: Event-Driven Ambient Guardian (`ant watch` Mode)
*   **Masalah:** Pemindaian AI pada setiap kali tombol Ctrl+S ditekan akan membebani sistem dan menjadi gangguan berisik (*noisy spam*).
*   **Solusi:** Arsitektur **Event-Driven Escalation Filter**:
    ```
    File Change (Save Event)
           ↓
    [Tier 1] Cheap AST Static Check (< 5ms, Zero LLM Token)
           ↓
    [Tier 2] Heuristic Risk Filter (Ada pola mencurigakan?)
           ↓ (Hanya jika lolos Tier 2)
    [Tier 3] Gray Unit Deep Audit (LLM / Security Scanner)
           ↓ (Hanya jika risiko HIGH / CRITICAL)
    Tactical Friendly Notification ke Developer
    ```

---

### 🔍 Pilar 4: Cryptographic Execution Chain (Bukan Sekadar Hash)
*   **Prinsip:** *"Hash membuktikan integritas teks, tetapi Rantai Eksekusi membuktikan kebenaran tindakan."*
*   **Struktur Rantai Bukti (Evidence Record):**
    ```
    Evidence #204
    ├── Action: npm run test:unit
    ├── Exit Code: 0
    ├── Stdout Digest: 44 tests passed (0 failures)
    ├── Git HEAD: a8f21c...
    ├── Timestamp: 2026-08-22T14:24:00Z
    ├── Parent Evidence: #203 (sha256:77425d2...)
    └── Cryptographic Signature: [EVID:sha256_receipt_xxxx]
    ```

---

### 🧬 Pilar 5: Recovery-First Agent State Machine
```
┌─────────────┐
│    INIT     │ (Capture Git Anchor)
└──────┬──────┘
       ↓
   PLANNING     (Task Decomposition)
       ↓
  EXECUTING     (Specialist Tool Calling)
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

## 🎯 5 Kriteria Kelulusan Mutlak (Acceptance Criteria v0.4)

Sebelum versi `v0.4.0` dirilis secara publik, sistem harus memenuhi 5 gerbang kelulusan:

1. **Remote-Safe:** Pesan dari Telegram/Webhook wajib melewati *Untrusted Intent Sandbox* dan *L5 Allowlist*.
2. **State-Consistent:** Sesi multi-device (Termux ↔ Laptop) memiliki proteksi *Optimistic Concurrency Control (OCC)* untuk mencegah *state overwrite*.
3. **Evidence-Verifiable:** Bukti eksekusi wajib mencakup Exit Code 0, Git Head Anchor, dan rantai parent hash.
4. **Autonomous Recovery:** Agen memiliki loop *Failure → Understand → Auto-Patch → Re-verify → Safe Rollback* jika batas perbaikan habis.
5. **Session Teleport Continuity:** Perpindahan perangkat melanjutkan *Execution State*, bukan sekadar memuat memori riwayat lama.

---

## 🔬 6. Lembar Uji Kritis & Debat (Cross-Model Stress-Test)

Gunakan materi ini untuk menguji arsitektur ANT bersama model frontier lain (Claude 3.7, GPT-5/o3, DeepSeek V4, Gemini 3 Pro):

```text
"Saya sedang merancang arsitektur AI coding agent generasi baru bernama ANT (Agentic Native Task).

ANT berevolusi menjadi Persistent Distributed Agent Runtime dengan 3 fondasi:
1. Cryptographic Execution Chain: Verifikasi tindakan didasarkan pada rantai audit terikat (Exit Code 0 + Git Anchor + Parent Evidence Hash), bukan sekadar LLM self-reflection.
2. Distributed Agent State & Session Teleport: Memisahkan Memory dari Execution State dengan Optimistic Concurrency Control (OCC) & State Leasing agar sesi coding bisa berpindah mulus antara Termux (HP) dan Laptop tanpa race-condition.
3. Remote Trust Boundary: Menerima instruksi via Telegram/Webhook saat mobile, memperlakukannya sebagai Untrusted Intent melalui Sandbox L5 Allowlist dan Recovery-First State Machine (INIT -> PLAN -> EXEC -> VERIFY -> RECOVER -> SECURE -> DONE).

Menurutmu:
a) Di mana bottleneck arsitektural terbesar dari model 'Asynchronous Remote Dispatch' pada coding agent otonom?
b) Bagaimana cara paling elegan menangani State Reconciliation jika user mengedit kode di Laptop saat remote agent di HP sedang menjalankan patch?
c) Apa kelemahan utama dari pendekatan Cryptographic Execution Chain dibanding LLM-as-a-Judge?"
```
