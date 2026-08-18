# OSINT Playbook: Email Intelligence

## Objektif
Mengekstrak informasi maksimal dari sebuah alamat email tunggal, termasuk profil terkait (Avatar/Gravatar), validitas domain, dan potensi keterlibatan dalam kebocoran data (Data Breaches).

## Target Data
1. **Validasi Eksistensi:** Memastikan domain email memiliki server penerima (MX Records).
2. **Avatar & Profil Web:** Menggunakan Gravatar (Globally Recognized Avatar) untuk menemukan foto wajah, nama asli, atau tautan profil yang terkait dengan email tersebut (banyak situs seperti WordPress, GitHub, dan Slack menggunakan Gravatar).
3. **Pola Penamaan (Username Generation):** Memisahkan bagian depan email untuk digunakan sebagai *pivot* ke alat pencarian Username.

## Alur Eksekusi (SOP)
1. **Analisis Sintaksis:**
   - Pisahkan email menjadi dua bagian: `Local-Part` (sebelum @) dan `Domain`.
   - Simpan `Local-Part` sebagai bahan *pivot* untuk OSINT Username (`cross_platform_scanner.js`).

2. **Validasi Domain Server (MX Record Check):**
   - Query DNS untuk MX Record pada `Domain`.
   - Jika MX Record tidak ada, email kemungkinan palsu atau tidak dapat menerima pesan.

3. **Gravatar Profiling (Tanpa Otentikasi):**
   - Hapus spasi dan ubah email menjadi huruf kecil semua (lowercase).
   - Buat *hash* SHA-256 dari email tersebut.
   - Akses API publik: `https://id.gravatar.com/hash.json`.
   - Ekstrak *Display Name*, *Photos*, *Profile URLs*, dan lokasi geografis jika tersedia.

4. **Korelasi Identitas:**
   - Jika foto ditemukan di Gravatar, lakukan *Reverse Image Search* (Yandex/Google) untuk menemukan akun media sosial lainnya.

5. **Deep Account Profiling (Menggunakan Holehe):**
   - Mengetahui apakah email terdaftar di suatu situs (Twitter, Instagram, dll) adalah kunci.
   - Gunakan alat *Holehe* yang mengecek ratusan situs melalui fitur *Forgot Password* tanpa memberitahu target.
   - Jalankan: `workspace/skills/osint/venv/bin/holehe <email>`
   - Abaikan baris berlabel `[x]` (Rate limit). Fokus hanya pada baris `[+]` yang memastikan email tersebut terdaftar.

## Peringatan Khusus
- Jangan pernah mengirim email (*phishing/social engineering*) ke alamat target. Selalu gunakan pengecekan pasif (DNS MX, Gravatar, dan metode forgot-password Holehe).
