# ADR-002: Distributed Lease Lock Protocol

## 1. Status
**Accepted** (Target Implementasi: FASE 3 - Remote Dispatch)

## 2. Konteks (Masalah)
Pada ANT v0.4, agen tidak lagi hanya berjalan murni dari CLI lokal. Dengan adanya integrasi Telegram Bot (Pilar 1) dan Sinkronisasi Multi-Device (Pilar 2), muncul risiko **Race Condition Kritis**:
Bagaimana jika pengguna memicu perintah dari Telegram secara remote, sementara agen lokal (di Termux/VSCode) sedang menjalankan iterasi *agent loop* yang memodifikasi *worktree* dan memori yang sama? 

Hal ini akan menyebabkan konflik Git (*merge conflict* otomatis gagal), kerusakan JSON file, dan korupsi pada memori semantik.

## 3. Keputusan (Decision)
ANT menggunakan **Distributed Lease Lock Protocol** berbasis tabel SQLite lokal (`leases`), tanpa membutuhkan broker eksternal (seperti Redis) agar tetap ringan dan offline-first.

Setiap entitas yang ingin memodifikasi *state* global (Git atau Memory) wajib memegang *lease*.

### 3.1 Skema Tabel (Sudah diimplementasi di Sprint 2)
```sql
CREATE TABLE leases (
  resource_id    TEXT PRIMARY KEY,  -- contoh: 'agent_loop', 'git_worktree'
  holder_session TEXT NOT NULL,     -- contoh: 'cli-session-123', 'telegram-webhook-456'
  expires_at     TEXT NOT NULL,     -- ISO 8601 Timestamp (TTL)
  pid            INTEGER,           -- OS Process ID pemegang lease
  created_at     TEXT NOT NULL 
);
```

### 3.2 Siklus Hidup Lease (Protokol)
1. **Acquire (Ambil Kunci):**
   Sebelum `runCliAgentLoop()` berjalan, ANT mencoba melakukan `INSERT` ke tabel `leases`. 
   - Jika `resource_id` belum ada → *Acquired* (Sukses).
   - Jika sudah ada, tapi `expires_at` < *Waktu Sekarang* → *Acquired* via `UPDATE` (Sukses ambil alih kunci kadaluarsa).
   - Jika sudah ada dan belum *expired* → **DITOLAK (Locked)**.

2. **Heartbeat (Perpanjangan Kunci):**
   Lease memiliki batas hidup (TTL) maksimal 120 detik. Selama *agent loop* memikirkan respons dari API (yang bisa memakan waktu lama), *scheduler* asinkron (Pilar 3) akan melakukan `UPDATE expires_at` setiap 30 detik untuk mempertahankan kunci.

3. **Release (Pelepasan Kunci):**
   Setelah agen selesai memodifikasi state dan mengembalikan kontrol ke user, ANT menghapus baris dari tabel `leases`.

### 3.3 Degradasi Graceful (Read-Only Mirror)
Jika agen (misal dari Telegram) mencoba memicu *loop* tapi gagal mendapatkan *lease*, maka agen tersebut tidak akan memblokir (*hang*). Sebaliknya, agen tersebut akan merespons:
> *"ANT sedang mengeksekusi misi lain di sesi [cli-session-123]. Perintah ini masuk ke dalam antrean (Read-Only Mode)."*

### 3.4 Mekanisme `ant kill` (Kill Switch)
Jika proses utama terbunuh tanpa sempat merilis kunci (misal OOM Killed atau Force Close di Termux), kunci akan tersisa di database.
- Opsi 1: Tunggu 120 detik (TTL kedaluwarsa otomatis).
- Opsi 2: Operator menjalankan `ant kill`. Perintah ini akan membaca `pid` dari tabel `leases`, mengirim sinyal `SIGTERM/SIGKILL` ke OS untuk memastikan zombie process mati, lalu melakukan `DELETE` pada tabel `leases` secara paksa.

## 4. Konsekuensi
- **Positif:** Mengeliminasi *race condition* 100%. Sinkronisasi aman dilakukan di atas Git. 
- **Positif:** Tetap *offline-first*.
- **Negatif:** Menambah kerumitan pada arsitektur pengiriman event. Modul `events.ts` (EventBus) harus memastikan *heartbeat* berjalan stabil di *background*.
