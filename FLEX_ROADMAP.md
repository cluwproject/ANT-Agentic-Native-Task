# 🌐 ANT Flexibility Roadmap (Fase 6)

> ⛔ **GATE**: Roadmap ini BARU boleh dieksekusi setelah Fase 0–5 lolos semua acceptance gate
> (`tsc` 0 error, `test:unit` hijau, build sukses + dist drift kosong, lint 0 error).
> Prinsip "Prove Before You Build" berlaku penuh di sini.

## 🎯 Visi

ANT menjadi asisten yang **fleksibel dalam mode operasi** (otonom ↔ kolaboratif),
**intent-aligned dengan pengguna**, dan **hadir di mana pun / kapan pun** — tanpa
mengorbankan prinsip inti: evidence-based, sovereign, dan RAM-friendly (Termux).

Filosofi ekspansi: *"yang sempit kita perluas dengan fleksibilitas yang efisien"* —
setiap subsistem baru wajib reuse komponen yang sudah terbukti, bukan menumpuk tumpukan baru.

---

## F6-1 · Tri-Mode Operation + Intent Engine

| Mode | Perilaku | Risiko |
|------|----------|--------|
| `SOLO` | Otonom penuh dalam sandbox allowlist (tugas rutin low-risk) | Tinggi |
| `CO-PILOT` | Approval gate per aksi berisiko (default saat ini) | Rendah |
| `OBSERVER` | Agen hanya menyarankan; user yang mengeksekusi | Minimal |

- **Intent Engine** mengklasifikasikan niat + skor risiko → memilih mode & tier model
  (SLM lokal untuk rutin via `tiered_ai.ts`, cloud LLM untuk kompleks).
- ⚠️ **Prasyarat keras**: Intent Engine wajib lulus eval akurasi klasifikasi risiko
  (dataset berlabel, target precision/recall ditetapkan sebelum implementasi)
  SEBELUM diberi hak memberikan akses SOLO. False negative = hardening Fase 2 percuma.
- Reuse: `permissions.ts` (policy), `allowlist.ts` (gate), `tiered_ai.ts` (routing).

## F6-2 · Headless Mode (`ant run "<task>" --auto --budget N`)

- Eksekusi non-interaktif untuk scripting/CI dengan budget token maksimal & `--dry-run`.
- Reuse: agent loop yang sama, approval gate diganti policy file (`ant.policy.json`).
- Paling murah diimplementasi, dampak langsung untuk otomasi.

## F6-3 · Presence Layer (di mana pun, kapan pun)

- Formalisasi channel adapter: CLI REPL (ada) → headless (F6-2) → Telegram/Web.
- Semua channel berbagi session & memory via MindBy vault.
- **Session Teleport lintas device WAJIB reuse Distributed Lease Lock + OCC (Pilar 2)**,
  bukan mekanisme sinkronisasi baru.

## F6-4 · Graph-Based Mission Orchestration (ala LangGraph)

- Generalisasi Milestone Runner menjadi DAG misi: node = langkah, edge = kondisi,
  checkpoint/resume per node.
- Reuse: `planner.ts` (HTN), `branching.ts` (checkpoint), `milestone_runner.ts`.

## F6-5 · Group-Chat Multi-Agent Roundtable (ala AutoGen)

- Planner ↔ Coder ↔ Critic berdebat hingga konsensus via mailbox.
- ⚠️ **Prasyarat keras**: regression test mailbox (race condition + prompt injection
  yang baru dipatch) harus establish dulu; token cost roundtable harus dibudget.

## F6-6 · Skill Distiller (self-improving)

- Distill pola sesi sukses → skill baru otomatis via `skillLifecycle.ts`.
- Setiap skill hasil distill wajib lulus verification guard sebelum aktif.

---

## Urutan Eksekusi (setelah gate lolos)

1. **F6-2 Headless** (termurah, dampak langsung)
2. **F6-1 Tri-Mode + Intent Engine** (dengan eval akurasi sebagai gerbang internal)
3. **F6-4 Graph Orchestration**
4. **F6-3 Presence Layer** (butuh F6-2)
5. **F6-5 Roundtable** (butuh regression test mailbox)
6. **F6-6 Skill Distiller**

---
*Status: PLANNED — belum dieksekusi. Dibuat pada Fase 5 refactor sprint.*
---
## STATUS UPDATE (23 Agustus 2026)
- [x] GATE prerequisite: Fase 0-5 acceptance gates SEMUA HIJAU (tsc 0 error, test 93/93, build sukses, lint 0 error).
- [ ] F6-2 Headless Mode - belum dimulai
- [ ] F6-1 Tri-Mode + Intent Engine - belum dimulai (butuh eval akurasi dulu)
- [ ] F6-4 Graph Orchestration - belum dimulai
- [ ] F6-3 Presence Layer - belum dimulai
- [ ] F6-5 Roundtable Multi-Agent - belum dimulai (butuh regression mailbox)
- [ ] F6-6 Skill Distiller - belum dimulai
