# ANT-CLI — Decision Log & Playbook
### Rangkuman keputusan dari sesi pengembangan ini (referensi, bukan data training)

---

## 1. Prinsip Inti (berlaku ke semua komponen)

- **Mailbox = transport. Evidence Ledger = audit. Task State = ground truth. Model output = claim.** Empat lapis ini tidak boleh tercampur.
- **Claim ≠ Truth** — termasuk isi `<think>`. Model bisa menulis "sudah saya cek" padahal belum pernah dieksekusi. Semua klaim (reasoning maupun action) wajib lewat Claim Verifier sebelum dipercaya runtime.
- **Satu jalur legal per operasi kritis** — jangan pernah ada dua jalur berbeda untuk hal yang sama (ganti model aktif, tulis entry mailbox, approval eksekusi). Kalau ada dua jalur, salah satunya bisa jadi celah bypass yang tidak terjaga.
- **Data turunan harus rebuildable** — cache/index (index.json, claims/) boleh dihapus dan digenerate ulang 100% dari ledger.jsonl kapan saja. Kalau tidak rebuildable, berarti itu sumber kebenaran kedua yang tersembunyi — bahaya.
- **Materi publik cuma boleh klaim yang bisa diverifikasi lewat kode yang benar-benar jalan.** Status "planned"/"proposal" harus ditandai eksplisit, tidak boleh disamakan visual dengan "implemented".

---

## 2. AntModelMailbox — Keputusan Final

**Schema kanonikal (ANT-MAIL/1.0):**
```
id, timestamp, protocol, prevHash, entryHash,
from{model, provider, modelVersion, runtime, configHash, role},
to{model, role},
operator, trigger{type, command},
session{id, taskId, branchId},
type,
state{currentObjective, completed, pending, blocked},
claims[{claimId, topicKey, text, evidenceRef, status}],
evidenceRefs[], handover{summary, technicalContext, nextRecommendedAction, warnings},
message, acknowledgement
```
Field ini yang dipakai kode (`mailboxWriter.js`, `claimVerifier.ts`). Kalau ada dokumen/poster pakai nama beda (`messageId`, `hash`, `fromModel` datar, dst.) — itu drift, bukan versi baru yang sah. Rename field harus migrasi eksplisit ke semua file sekaligus.

**Message type taxonomy:** `HANDOVER`, `QUESTION`, `PROPOSAL`, `REVIEW_REQUEST`, `CHALLENGE`, `WARNING`, `CORRECTION`, `ACK`, `DISAGREEMENT`, `REQUEST_EVIDENCE`.

**Storage:** `ledger.jsonl` (append-only, hash-chained, source of truth) + `index.json`/`claims/` (rebuildable cache) + `config.json` (kill-switch, operator-only).

**State machine verifikasi klaim:**
```
CLAIM_RECEIVED → ada evidence valid? → tidak → UNVERIFIED
                                    → ya → cocok? → ya → VERIFIED
                                                   → tidak → ada klaim lain di topic sama?
                                                              → ya → CONTRADICTED
                                                              → tidak → NEEDS_INDEPENDENT_CHECK
                                                                        → tidak bisa dicek otomatis → NEEDS_HUMAN_REVIEW
```
`status` klaim **tidak pernah diisi model** — cuma verifier engine yang boleh mengubahnya.

**Contradiction detection:** group by `topicKey`, kalau >1 `normalizedAnswer` unik → `CONTRADICTION_DETECTED`, status `UNRESOLVED`, tidak memilih siapa benar — minta verifikasi independen.

**Injection safety:** konten dari mailbox masuk ke prompt model berikutnya sebagai role `user`/`tool_result`, **tidak pernah** `system`. Cuma field allowlist (`handover.summary`, `state.pending`, `message`) yang disuntik otomatis, dibungkus delimiter dan di-escape (`<`, `>`, `&`).

---

## 3. Security & Circuit Breaker

- Circuit breaker **harus persist ke file** (`circuit-state.json`), bukan `Map` in-memory — kalau CLI dipanggil sebagai proses baru tiap command, state in-memory reset dan rate limiter jadi dekoratif.
- Cross-process race di `ledger.jsonl` ditutup pakai advisory file lock (`fileLock.js`, exclusive-create + stale-lock detection 5 detik).
- Entry mailbox **cuma bisa dibuat lewat fungsi yang dimediasi orchestrator** — tidak pernah diekspos jadi tool bebas yang bisa dipanggil model secara rekursif/otonom. Ini pelajaran langsung dari insiden Hugging Face (agent bikin ulang kanal komunikasi sendiri setelah dimatikan).
- **ARCR (Autonomous Re-Channeling) & SCI (Scope Conformance) belum diimplementasi** — sengaja diserahkan ke agent internal CLUW, cuma ada TODO comment di kode yang menunjuk ke `fsGuard.ts`/`browserPermissions.ts`/`verificationGuard.ts` sebagai pola integrasi.
- Istilah formal ("Delegation Chain Calculus", P1/P2/P4/P6) dan angka ambang batas (CVR ≥ 0.85, dst.) di riset pendamping itu **formalisasi original proyek ini, bukan standar mapan** — dan angkanya target awal, bukan hasil benchmark. Jangan dipresentasikan seolah itu literatur yang sudah baku.

---

## 4. Model Registry & Active State

- `modelRegistry` (katalog dari `.env`) dan `activeModel` (pointer runtime) dipisah tegas. Model yang cuma terdaftar tidak pernah memicu entry mailbox — cuma transisi `activeModel` yang memicu.
- Satu-satunya jalur legal ganti model aktif: `setActiveModel(newModelId, trigger)`.
- `/model` (tanpa argumen) = tampilkan picker, tidak menulis apa pun. `/model <pilihan>` = switch beneran, baru menulis entry. `/model reload` = sync ulang registry dari `.env`, **tidak** mengubah model aktif — dua kekhawatiran yang harus dipisah supaya tidak ambigu asal-usul state-nya.

---

## 5. Fine-Tuning Pipeline — Keputusan & Perbaikan

- **v2 → v3:** `DataCollatorForCompletionOnlyLM` sudah dihapus dari TRL — diverifikasi lewat pencarian, bukan asumsi. Ganti ke `completion_only_loss=True` di `SFTConfig`, dataset direstruktur jadi kolom `prompt`/`completion` terpisah (bukan satu kolom `text`).
- Loss dihitung di **seluruh completion assistant** (`<think>` + `<action>` + prose), bukan cuma dua tag itu — koreksi dari klaim dokumentasi lama yang kurang akurat.
- EOS token ditambahkan eksplisit lewat `tokenizer.eos_token`, jangan cuma andalkan literal `<|im_end|>` di teks.
- Output action pakai `topicKey` + `text` (selaras schema mailbox kanonikal). Model **tidak** mengisi `evidenceRef`/`status` — itu wewenang verifier, bukan model.
- Action JSON dibungkus tag `<action>...</action>`, terpisah dari prose bebas — biar parser tidak perlu menebak dari isi teks.
- Export GGUF default **lokal** (`save_pretrained_gguf`), bukan otomatis push ke HF Hub publik — system prompt berisi identitas operator ter-bake ke weights, publish tanpa `private=True` berarti membocorkan itu.
- Dataset sintetis (3 sample) itu murni smoke-test — akan overfit/menghafal kalau ditafsirkan sebagai hasil kualitas. Data asli harus dari **ANT Dataset Factory**: ANT CLI Logs → Sanitizer (hapus secrets/token/path/data personal) → Task Extractor → Human/Verifier Validation → Training Dataset.

---

## 6. Model Tiering

| Tier | Model | Tugas | Status |
|---|---|---|---|
| Reasoner | DeepSeek-R1-Distill-Qwen-1.5B | Planning, reasoning, task decomposition | Pipeline v3 jalan |
| Operator | Kandidat: Qwen3-1.7B atau Gemma 4 2B (edge) | Intent detection, format action/JSON | Dipersempit ke 2 kandidat, belum final |
| Observer | MiniCPM-V | OCR, screenshot, diagram, UI-to-code | Feasibility-first, belum diukur empiris |

**Catatan OCR:** OCR murni (baca teks dari gambar) tidak butuh VLM sama sekali — pakai OCR engine klasik (Tesseract dkk), jauh lebih ringan di Termux. VLM (MiniCPM-V) cuma perlu untuk pemahaman layout/UI/diagram yang genuinely butuh visual reasoning. Jangan disamakan.

**Kalau tiering 3-arah ini diadopsi resmi:** ANT CLI perlu jadi orchestrator yang memilih tier per task — itu potongan arsitektur baru (routing logic) yang belum ada sama sekali.

---

## 7. ANT Adapt Engine & Resource Management

```ts
interface DeviceProfile {
  platform: 'termux' | 'linux' | 'macos' | 'windows';
  totalRamMB: number; freeRamMB: number; hasGpu: boolean;
  recommendedModelTier: 'slm-1_5b' | 'mid-7b' | 'full-gpu';
  maxSafeContextTokens: number;
}
```
Device profile jadi **single source of truth** buat semua modul lain (Micro-Prompting, keputusan load MiniCPM-V) — jangan tiap modul deteksi resource sendiri-sendiri, itu bikin drift.

**SLM Micro-Prompting** aman melakukan pruning agresif karena state penting sudah dieksternalisasi ke mailbox/evidence ledger — ground truth tidak hilang cuma karena riwayat chat dipangkas. Ini keuntungan struktural dari arsitektur, bukan kerja ekstra.

**3-Way Gate** harus extend `verificationGuard.ts` yang sudah ada di CLUW, bukan sistem approval paralel.

**`/branch`** checkpoint: snapshot git commit + offset ledger + `branchId` masuk ke `session.branchId` di schema mailbox. Ledger sendiri tidak pernah di-rewind — cuma pointer baca yang pindah.

**Trust hierarchy:** Fine-tuned identity bias (lemah) < System/operator instruction < Runtime security policy < Verified evidence (kuat). Identitas hasil fine-tuning **bukan** batas keamanan — itu cuma bias perilaku, bisa digeser lewat prompting adversarial. Keamanan sungguhan tetap tanggung jawab permission/verification/filesystem layer.

---

## 8. Disiplin Materi Publik

Ditemukan berulang di poster & README: fitur yang belum dibangun (ARCR Confinement, Execution Recovery/Self-Healing) ditampilkan dengan bobot visual sama dengan fitur yang sudah jalan. Fix: status legend eksplisit (✅ Implemented · 🔧 Ada di CLUW, integrasi pending · 🔄 Planned · 🔬 Proposal/feasibility belum dikonfirmasi) diterapkan di **setiap** section yang menyebut fitur spesifik, bukan cuma di tabel roadmap.

---

## 9. Keputusan Non-Teknis (strategi & framing)

- Fine-tuning/LoRA ≠ membuat AI dari nol — tapi tetap "mengembangkan AI" secara sah. Bedanya soal skala (pretraining butuh triliunan token + puluhan juta USD+), bukan soal legitimasi.
- Kalau mau pitch ke pihak seperti Indosat: jangan tawarkan "saya bisa bangun model" (mereka sudah punya Sahabat-AI + infrastruktur miliaran dolar). Tawarkan **governance/audit layer** (AntModelMailbox dkk.) sebagai komplemen, bukan kompetisi.
