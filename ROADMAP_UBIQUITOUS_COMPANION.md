# 🐜 ANT v0.4: Master Blueprint — Ubiquitous Sovereign Coding Companion

> **Doktrin Inti:** *"Yang sempit kita perluas, yang terlalu luas kita efisienkan dengan hal yang lebih bervisi."*  
> **Origin & Architecture:** CLUW Genesis / ANT Sovereign Runtime  
> **Founder / Operator:** Ard (Renaldy Adri)  
> **Version:** Menuju v0.4.0 (The Ubiquitous & Symbiotic Era)  
> **Date:** 22 Agustus 2026  

---

## 🧭 1. Visi Strategis: Dari CLI Lokal Menuju Pendamping Universal

Coding agent konvensional (Claude Code, Hermes, OpenClaw) saat ini masih terisolasi sebagai **"alat pasif terminal tunggal"**. Mereka tidak memiliki kontinuitas lintas perangkat, tidak bisa diakses dari luar terminal, dan mudah hilang konteks.

ANT v0.4 mendefinisikan ulang peran AI coding: **Bukan sekadar autocomplete atau terminal runner, melainkan Mitra Simbiosis Kognitif (Anywhere, Anytime) dengan Kedaulatan & Bukti Nyata (Evidence-Based).**

---

## 🏛️ 2. Tiga Pilar Terobosan Arsitektur v0.4

```
                               ┌─────────────────────────────────┐
                               │    ARD (ARCHITECT / VISION)     │
                               └────────────────┬────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
     [PILAR 1: REMOTE DISPATCH]      [PILAR 2: SESSION TELEPORT]     [PILAR 3: AMBIENT GUARDIAN]
     Kirim instruksi via Telegram    Sesi berpindah mulus            Memantau kode hening di
     → ANT eksekusi di server/PC     Termux (HP) ↔ Laptop (PC)       background & cegah celah
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                ▼
                               ┌─────────────────────────────────┐
                               │   ANT RUNTIME GOVERNANCE CORE   │
                               ├─────────────────────────────────┤
                               │ • L5 Allowlist (Anti-Destructive)│
                               │ • SHA-256 Evidence Ledger       │
                               │ • Dual-Vault Memory (Cockroach) │
                               │ • Procedural Skill Distillation │
                               └─────────────────────────────────┘
```

### 🚀 Pilar 1: Remote Dispatch Bridge (Telegram / Webhook Companion)
*   **Masalah:** Mengetik instruksi kompleks di keyboard virtual HP saat di jalan sangat lambat.
*   **Solusi:** ANT Daemon mendengarkan pesan dari Bot Telegram privat pengguna.
*   **Alur:** Pengguna mengirim voice note/chat singkat → ANT menjalankan ReAct agent loop di background server → Memvalidasi tes hingga hijau → Membalas ringkasan diff dan Evidence ID ke Telegram.

### 🌌 Pilar 2: Multi-Device "Session Teleport" (MindBridge Termux ↔ Laptop)
*   **Masalah:** Berpindah perangkat membuat semua konteks ingatan agent ter-reset ke nol.
*   **Solusi:** Menggunakan Dual-Vault Memory (CockroachDB Vector 768-dim + Git Snapshot Anchor).
*   **Alur:** Pengguna merancang ide di Termux HP (`ant plan`) → Buka laptop di rumah dan jalankan `ant resume` → ANT langsung mengenali status proyek terakhir tanpa kehilangan kontinuitas memori.

### 🛡️ Pilar 3: Ambient Silent Guardian (`ant watch` Mode)
*   **Masalah:** Agent coding biasa mengganggu alur fokus pengguna atau baru bersuara saat dipanggil.
*   **Solusi:** Daemon pengawas hening yang membaca file diff saat disimpan (*on-save*).
*   **Alur:** Melakukan AST syntax check dan pemindaian 5 Unit Gray secara pasif. Memberikan notifikasi taktis ramah *hanya jika* mendeteksi kerentanan kritis (seperti SQL Injection atau bocornya API key).

---

## 🔬 3. Lembar Bahan Diskusi & Uji Kritis (Cross-Model Stress-Test)

Gunakan naskah dan pertanyaan ini saat berdiskusi, menggali *insight*, atau mendebat model frontier lain (GPT-5, Claude 3.7, DeepSeek V3/V4, Gemini 3 Pro):

### 📝 Prompt Uji / Bahan Argumen ke Model AI Lain:
```text
"Saya sedang mengembangkan arsitektur AI coding agent bernama ANT (Agentic Native Task). 
Berbeda dari coding agent konvensional yang hanya menunggu perintah di terminal, ANT dirancang sebagai Sovereign Agent Runtime dengan 3 prinsip:
1. Evidence-Based Execution: Setiap tindakan diverifikasi dengan SHA-256 hash receipt di ledger lokal sebelum dipercaya.
2. Dual-Vault Memory & Session Teleport: Menggabungkan local JSON caching (Termux-safe) dengan CockroachDB Vector 768-dim agar sesi coding bisa berpindah mulus dari mobile ke desktop tanpa amnesia konteks.
3. Asynchronous Remote Dispatch: User bisa mendispatch tugas via Telegram/Webhook saat mobile, dan agen mengeksekusi dengan Milestone State Machine (INIT -> SCAFFOLD -> IMPLEMENT -> VERIFY -> SECURE) bergaransi Safe Git Rollback jika tes gagal.

Menurutmu:
a) Di mana bottleneck arsitektural terbesar dari model 'Asynchronous Remote Dispatch' pada coding agent otonom?
b) Bagaimana cara terbaik menjaga agar 'Session Teleport' tidak mengalami race-condition ketika dua perangkat aktif secara bersamaan?
c) Apa kritik terkerasmu terhadap pendekatan Evidence Ledger dibanding standard LLM reflection?"
```

---

## 📅 4. Tahapan Eksekusi (Roadmap Milestones)

- [x] **v0.3.0 Foundation:** L5 Allowlist, Swarm 5-Unit, Milestone Scaffolding, Tool Catalog Injection, Memory Consolidation, & Procedural Skill Distillation.
- [ ] **v0.3.5 Resilience:** Sprint S4 (Dynamic HTTP Healthcheck di VERIFY Gate).
- [ ] **v0.4.0-Alpha:** Pilar 1 (Remote Dispatch Bridge via Telegram Bot Daemon).
- [ ] **v0.4.0-Beta:** Pilar 2 (Session Teleport & Multi-Device State Lock).
- [ ] **v0.4.0-GA:** Pilar 3 (`ant watch` Ambient Guardian & A2A Blackboard Mesh).
