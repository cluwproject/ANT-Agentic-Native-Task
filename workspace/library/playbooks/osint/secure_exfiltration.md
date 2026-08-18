# OSINT & Deep Web Data Exfiltration (Stealth Protocol)

## Objektif
Menetapkan jalur aman (Secure Exfiltration) untuk mengumpulkan, menyimpan, dan mengeluarkan (exfiltrate) intelijen yang didapat dari Surface, Deep, dan Dark Web tanpa memicu alarm keamanan target atau merusak anonimitas agen (GRAY units).

## Arsitektur Tiga Zona
1. **Surface Web (Zona Terang) - GRAY-2 & GRAY-4**
   - Area: Sosial Media, GitHub, DNS, Whois.
   - Risiko: Rendah.
   - Pengumpulan: Menggunakan HTTP Request biasa dengan rotasi User-Agent.

2. **Deep Web (Zona Abu-abu) - GRAY-3**
   - Area: Holehe API, Gravatar, Database Breach.
   - Risiko: Sedang (Rate limiting dan deteksi bot).
   - Pengumpulan: Eksekusi script secara asinkron dengan jeda (sleep) untuk menghindari Rate Limit.

3. **Dark Web (Zona Gelap) - GRAY-5**
   - Area: Jaringan Tor (.onion), Forum tersembunyi.
   - Risiko: Tinggi (Pelacakan Balik, Exit Node Sniffing).
   - Pengumpulan: Melalui proxy SOCKS5 (Tor) lokal. Tidak ada koneksi langsung.

## Protokol Penyelundupan Data (Exfiltration) Dua Arah

### 1. Dari Agen ke Komandan (Inbound Exfiltration)
Saat agen (GRAY) beroperasi di Dark/Deep Web, mereka **TIDAK BOLEH** mengirim data langsung ke internet (Surface) atau API publik karena bisa di-sniff.
**Metode:**
- **Blackboard File Drop (Air-Gapped Logic):** GRAY-5 (Dark Web) menulis hasil temuannya ke dalam *local file* berekstensi `.lock` di dalam `workspace/missions/`.
- **Enkripsi Lokal:** Sebelum di-drop, data sensitif (seperti kredensial target atau log onion) harus di-enkripsi menggunakan PGP atau AES-256 lokal menggunakan kunci publik komandan.

### 2. Dari Komandan ke Zona Gelap (Outbound Injection)
Saat Komandan ingin mengirim *payload* atau informasi ke Deep/Dark web tanpa terdeteksi (misalnya mengirim kunci dekripsi ke forum).
**Metode:**
- **Steganografi:** Menyisipkan data rahasia ke dalam metadata file gambar (`.jpg` / `.png`). Gambar tersebut di-upload ke Surface Web (imgur/dll), lalu agen di Dark Web akan mengunduh gambar tersebut dan mengekstrak pesannya.
- **Dead Drop (Pastebin Anonim):** Menulis pesan terenkripsi PGP ke situs *Pastebin* yang anonim atau IPFS, lalu agen hanya perlu membaca URL tersebut.

## Aturan Keselamatan (Rules of Engagement)
- **TIDAK ADA koneksi Database Cloud langsung dari GRAY-5.** Jika GRAY-5 berjalan, `mindby_cockroach.ts` dinonaktifkan sementara untuk mencegah kebocoran IP server ke Exit Node Tor.
- Semua data harus di-"cuci" (sanitized) di dalam `workspace/library/osint_results_*.csv` sebelum dibaca secara manual oleh Operator.
