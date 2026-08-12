# CLI Agent Loop — Struktur Baru

## Pemetaan file lama → baru

File lama Anda (satu file, ~230 baris) dipecah jadi 10 file:

| File | Tanggung jawab |
|---|---|
| `types.ts` | Semua tipe/interface bersama |
| `ui.ts` | Semua `console.log`/`chalk`/`ora`/`marked` — tidak ada logika keputusan |
| `toolCallParser.ts` | Ekstraksi tool call dari respons model (brace-matching yang benar) |
| `permissions.ts` | Daftar safe-tools + validator argumen + approval flow (+ delegasi browser) |
| `contextManager.ts` | Pemangkasan riwayat pesan & pemotongan hasil tool (opsional) |
| `evidenceLedger.ts` | Hash & metadata bukti dihitung sistem, bukan model (kini dukung Buffer) |
| `verificationGuard.ts` | Menolak teks yang mengklaim bukti tanpa rujukan valid |
| `browserPermissions.ts` | **BARU.** Approval per-domain (Once/Always/Deny) untuk browser tool |
| `browserTool.ts` | **BARU.** Driver Playwright: navigate/click/getText/screenshot/close |
| `agentLoop.ts` | Orkestrasi inti — menggabungkan semua modul di atas + Logger |
| `index.ts` | Entry point, menjaga signature lama tetap kompatibel |

## Browser tool — konteks dan cara pasang

Ini jawaban atas pertanyaan Anda soal fitur in-app browser Claude Code
Desktop (dirilis 10 Juli 2026): apakah bisa dibuat padanan untuk CLUW.
Jawabannya ya, dengan penyesuaian karena CLUW adalah proses CLI/Node, bukan
Electron — jadi tidak ada "panel browser" GUI, tapi kapabilitasnya (Claude
menyuruh Chromium navigate/klik/screenshot dengan model keamanan setara)
sepenuhnya bisa dicapai lewat Playwright.

**Cara pasang:**
```bash
npm install playwright
npx playwright install chromium
```

**PENTING — batas pengujian saya:** sandbox tempat saya menulis kode ini
tidak punya akses ke domain unduhan binary Chromium Playwright, jadi saya
**tidak bisa** menjalankan browser sungguhan untuk uji end-to-end di sini.
Yang sudah saya uji (lihat transkrip): validasi scheme URL, ekstraksi
domain, deteksi local-dev-server, dan — paling penting — bahwa hash
evidence untuk screenshot dihitung dari **byte PNG asli**, cocok persis
dengan hash yang dihitung manual di luar kode ini. Sebelum dipakai
produksi, jalankan sendiri smoke test navigate + screenshot sederhana di
mesin Anda untuk memvalidasi bagian Playwright-nya secara langsung.

**Model keamanan (meniru Claude Code Desktop):**

1. **Approval per-domain, bukan per-nama-tool.** `browser_navigate` selalu
   sama nama tool-nya baik tujuannya `example.com` atau situs sensitif —
   jadi `permissions.ts` mendeteksi tool `browser_*` dengan `args.url` dan
   mendelegasikan ke `browserPermissions.ts`, bukan Y/n generik. User
   memilih **O**nce / **A**lways allow / **D**eny per domain, dan pilihan
   "Always" tersimpan (in-memory per proses; untuk persisten lintas-sesi,
   ganti backing store `alwaysAllowedDomains` di `browserPermissions.ts`).
2. **Default-nya kebalikan dari approval tool biasa.** Approval tool biasa
   di `permissions.ts` (`Y/n`, default kosong = Yes) sengaja beda dari
   approval domain (`O/A/D`, default kosong = **Deny**). Ini disengaja:
   navigasi ke domain eksternal adalah aksi berisiko lebih tinggi dan lebih
   sulit diprediksi dampaknya dibanding tool lokal, jadi default-nya lebih
   konservatif.
3. **Local dev server bypass approval otomatis** (`isLocalDevServer()`) —
   meniru "local dev servers tidak butuh approval" di Claude Code. Sengaja
   dibatasi ke `localhost`/`127.0.0.1`/`0.0.0.0` dengan pola port dev yang
   umum (3000, 5173, 8080, dst), bukan wildcard localhost tanpa batas —
   supaya service internal sensitif yang kebetulan jalan di localhost port
   lain tetap lewat approval normal.
4. **Scheme guard keras di `browserTool.ts`, bukan lewat approval user.**
   Hanya `http:`/`https:` yang diizinkan. `file://`, `chrome://`,
   `javascript:`, `data:` diblokir sebelum sempat sampai ke approval —
   karena `file://` misalnya bisa dipakai untuk membaca filesystem lokal
   lewat "browser", memotong sandbox yang sudah dibangun di tool lain.
5. **Profil bersih by default.** Setiap `browser_navigate` memakai
   `browserContext` baru kecuali `args.persistSession: true` diberikan
   eksplisit — sama seperti pilihan "sessions persist" di Claude Code.
6. **Screenshot terhubung langsung ke evidence ledger dengan hash byte
   asli** (lihat perubahan di `evidenceLedger.ts`: `recordEvidence()`
   sekarang menerima `Buffer` dan meng-hash byte-nya langsung, bukan
   `JSON.stringify()` dulu). Ini menutup persis celah yang sama seperti
   insiden laporan subdomain TikTok — screenshot yang diklaim model tanpa
   file nyata tidak akan pernah punya evidence record.

**Yang belum saya buat (di luar scope permintaan ini, tapi perlu Anda
pertimbangkan sebelum produksi):**
- Persistensi `alwaysAllowedDomains` lintas restart proses (saat ini
  hilang tiap CLUW di-restart).
- Rate-limiting untuk `browser_navigate` berulang ke domain yang sama
  (relevan untuk kasus bug-bounty recon Anda — jangan sampai scanning
  lewat browser tool dianggap traffic agresif oleh target).
- Deteksi/pembatalan otomatis kalau halaman menampilkan CAPTCHA atau
  meminta login — Claude Code eksplisit menyebut tidak akan bypass CAPTCHA
  atau login tanpa input Anda; `browserTool.ts` saat ini belum punya
  deteksi itu, jadi masih murni mengikuti approval per-domain saja.

## Kenapa `evidenceLedger.ts` dan `verificationGuard.ts` ditambahkan

Kejadian nyata yang jadi pemicu: dalam satu sesi, model menulis narasi lengkap
"berhasil membaca file" + hash SHA-256 + metadata screenshot, padahal tidak
ada tool yang benar-benar dieksekusi untuk itu. Hash yang ditulis punya pola
mencurigakan (ekor hex naik berurutan `...a2b3c4d5e6f`) — ciri konfabulasi
model, bukan output fungsi kriptografi asli. Karena arsitektur lama menganggap
"tidak ada tool call terdeteksi = respons final, tampilkan apa adanya", narasi
karangan itu lolos begitu saja ke layar sebagai kalau-kalau itu bukti nyata.

**Cara kerja perbaikannya:**

1. `evidenceLedger.ts` — setiap kali `executeAction()` sukses, hasilnya
   dicatat sebagai `EvidenceRecord` dengan hash SHA-256 yang dihitung oleh
   `crypto` di kode kita sendiri (`recordEvidence()`), bukan diserahkan ke
   model untuk "dilaporkan ulang". Setiap record dapat ID pendek unik.
2. Model diinstruksikan (lewat `SYSTEM_INSTRUCTION`) untuk **tidak pernah**
   menulis hash/status file sendiri — hanya merujuknya lewat tag
   `[EVID:xxxxxxxx]` yang diberikan sistem setelah tool dieksekusi.
3. `verificationGuard.ts` memindai setiap teks assistant sebelum ditampilkan:
   - Kalau ada pola klaim bukti (hash mentah, "berhasil dibaca", dimensi
     gambar, dsb) **tanpa** tag `[EVID:id]` sama sekali → ditolak.
   - Kalau ada tag `[EVID:id]` tapi ID-nya tidak ada di ledger (dikarang
     model) → ditolak, **berlaku selalu**, bahkan kalau kalimat di
     sekitarnya terdengar biasa saja tanpa kata kunci mencurigakan lain.
   - Respons yang ditolak dikirim balik ke model dengan instruksi perbaikan
     eksplisit (`buildCorrectionMessage`), maksimal `MAX_VERIFICATION_RETRIES`
     (default 3) kali sebelum loop dihentikan demi keamanan data.
4. Hanya lewat `renderEvidenceTags()` nilai hash/metadata benar-benar
   ditampilkan ke user — nilainya selalu diambil dari ledger, tidak pernah
   dari teks yang ditulis model.

**Sudah diuji** dengan 4 skenario (klaim palsu tanpa tag, teks biasa tanpa
klaim, evidence nyata dengan tag valid, dan ID EVID yang dikarang) — hasilnya
ada di transkrip percakapan yang menyertai kode ini. Skenario ke-4 sempat
menemukan bug di iterasi pertama guard (ID karangan lolos kalau kalimat di
sekitarnya tidak mengandung kata kunci lain) — sudah diperbaiki dan diuji
ulang.

**Catatan jujur soal batasan:** guard ini adalah lapisan pertahanan
struktural (memaksa alur bukti → ledger → tag), bukan classifier semantik
sempurna. Pola `EVIDENCE_CLAIM_PATTERNS` di `verificationGuard.ts` masih
berbasis regex heuristik untuk mendeteksi "ini sepertinya klaim bukti" —
kemungkinan perlu Anda perluas polanya seiring waktu kalau menemukan bentuk
klaim lain yang lolos. Pertahanan sesungguhnya bukan di ketepatan regex-nya,
tapi di aturan keras "hash tidak pernah datang dari teks model" + validasi
ID tanpa syarat.

## Cara pasang

1. Salin folder `src/cli/` ini menimpa lokasi file lama Anda (sesuaikan path
   relatif `../core/...` dan `../../shared/...` jika struktur folder Anda beda).
2. Pemanggil existing (mis. `main.ts`) **tidak perlu diubah** — `runCliAgentLoop`,
   `closeCli`, `askUser` tetap punya signature yang sama seperti sebelumnya.
3. Cek `agentLoop.ts` bagian `safeLog()` — saya menebak method Logger Anda
   bernama `.info/.warn/.error/.debug`. Kalau implementasi asli
   `utils/logger.js` Anda beda (misal `Logger.log(level, msg)`), tinggal ubah
   satu fungsi itu saja.

## Perubahan perilaku yang perlu Anda tahu (bukan cuma refactor kosmetik)

1. **Logger sekarang benar-benar dipanggil.** Dulu diimpor tapi tidak pernah
   dipakai. Sekarang setiap tool call (approved/denied/blocked/sukses/gagal)
   dicatat. Kalau method Logger Anda beda nama, lihat poin di atas.

2. **Tool call parser diganti total.** Dulu pakai `indexOf('{')` sampai
   `lastIndexOf('}')` — bisa salah tangkap kalau ada lebih dari satu blok
   `{...}` dalam teks. Sekarang pakai brace-counting yang menghormati string
   literal dan nested object. Sudah saya uji dengan 4 skenario termasuk kasus
   yang jadi kelemahan versi lama — hasilnya di transkrip percakapan ini.

3. **`MAX_ATTEMPTS` yang habis sekarang memberi tahu user** (banner merah),
   bukan diam-diam berhenti seperti versi lama.

4. **Ctrl+C (SIGINT) ditangani dengan bersih** lewat `process.once('SIGINT', ...)`
   — loop berhenti di iterasi saat ini, bukan mematikan proses secara paksa
   di tengah eksekusi tool.

5. **Argumen tool sekarang selalu ditampilkan**, termasuk untuk tool yang ada
   di `SAFE_TOOLS`. Dulu argumen hanya ditampilkan untuk tool yang butuh
   konfirmasi manual.

6. **Validator argumen (`ARG_VALIDATORS`) baru ditambahkan** di
   `permissions.ts` — contoh: `shell_exec` sekarang dicek dulu terhadap
   beberapa pola berbahaya (`rm -rf /`, fork bomb, `mkfs`/`dd` ke device)
   sebelum sampai ke prompt konfirmasi. Ini baru contoh awal — silakan
   tambah validator lain sesuai kebutuhan CLUW (mis. domain whitelist untuk
   `web_request`).

7. **Hasil tool yang dipotong sekarang punya penanda eksplisit** (`[HASIL
   DIPOTONG: N karakter tersembunyi]`) — dulu dipotong diam-diam di 5000
   karakter, model tidak tahu datanya terpotong.

8. **Context bounding tersedia tapi opt-in.** Kalau Anda tidak mengisi
   `options.maxContextMessages`, perilakunya identik dengan versi lama (tidak
   ada pemangkasan). Untuk mengaktifkan:
   ```ts
   runCliAgentLoop(msg, ctx, { maxContextMessages: 40 })
   ```

## Yang SENGAJA belum saya ubah

- **Tool-calling masih berbasis text-parsing**, bukan native structured
  tool_use dari provider. Ini karena saya tidak tahu apakah `tieredChat()`
  Anda (routing ke DeepSeek/Gemini/Claude API) sudah mendukung native
  function calling di semua tier. Kalau sudah, jalur upgrade berikutnya
  adalah mengganti `parseToolCall()` di `agentLoop.ts` dengan pembacaan
  langsung field `tool_use` dari response API — `toolCallParser.ts` bisa
  dipensiunkan sepenuhnya.
- **Daftar `SAFE_TOOLS` tidak saya ubah isinya**, hanya saya pindahkan.
  Silakan Anda yang menilai apakah semua endpoint `mexc_get_*` di situ
  benar-benar read-only murni.
