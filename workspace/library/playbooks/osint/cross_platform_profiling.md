# OSINT Playbook: Cross-Platform Footprinting

## Objektif
Mencari jejak digital target (username/email/nama) melintasi berbagai platform sosial dan developer untuk memetakan profil identitas secara komprehensif, tanpa memerlukan login otentikasi.

## Target Platform
1. **Developer Hubs:** GitHub, GitLab, NPM, PyPI (Mencari email yang bocor di commit history, username).
2. **Social Video:** TikTok, YouTube (Mencari pola bio, linktree, asosiasi nama).
3. **Professional:** LinkedIn (Mencari perusahaan, afiliasi, public resume).
4. **Forums:** Reddit, StackOverflow (Mencari pola username yang sama).

## Alur Eksekusi (SOP)
1. **Username Enumeration:**
   - Gunakan `web_search` atau script OSINT untuk mengecek ketersediaan username di platform di atas.
   - Kumpulkan URL profil yang berstatus "Ditemukan".

2. **Data Extraction (Tanpa Login):**
   - **GitHub:** Tarik `.patch` dari URL commit publik untuk mengekstraksi alamat email developer. (Paling Akurat)
   - **TikTok/Sosmed:** Scraping deskripsi Bio, tautan eksternal (Linktree/Biolink), dan ID unik sistem.
   - **StackOverflow:** Ekstrak lokasi (Geo), website pribadi, dan repositori proyek.

3. **Identity Correlation (Mengatasi "Blind Username"):**
   - **JANGAN percaya kesamaan username.** Identitas harus diverifikasi melalui *cross-referencing* data konkret:
   - *Correlation by Email:* Jika email di GitHub A sama dengan data WHOIS domain B.
   - *Correlation by Image Hash:* Ekstrak foto profil, hitung *MD5/SHA hash*, cocokkan melintasi platform.
   - *Correlation by PGP/Crypto:* Cocokkan alamat dompet Bitcoin atau *PGP Public Key* di bio.
   - *Correlation by Historical Data:* Gunakan Wayback Machine untuk melihat bio lama sebelum dimanipulasi.

4. **Output Format:**
   - Hasil investigasi dirangkum dengan "Tingkat Kepercayaan" (Confidence Level):
     - LOW: Hanya kesamaan username.
     - HIGH: Kesamaan Email, Hash Foto, atau Tautan Web Langsung.

## Peringatan (Hukum 6 & Etika)
- Dilarang keras melakukan brute-force login.
- Hanya gunakan informasi yang secara publik (Open-Source) tersedia di web.
- Jika platform memblokir (CAPTCHA/403), lewati platform tersebut atau gunakan proxy rotasi (jika tersedia di tools).
