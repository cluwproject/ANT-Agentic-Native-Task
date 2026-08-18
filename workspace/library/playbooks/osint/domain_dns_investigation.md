# OSINT Playbook: Domain & Infrastructure Intelligence

## Objektif
Mengumpulkan metadata dari sebuah nama domain atau alamat IP untuk mengungkap kepemilikan, infrastruktur server, dan celah miskonfigurasi.

## Alur Eksekusi (SOP)
1. **WHOIS Lookup:**
   - Dapatkan informasi pendaftar domain (Registrant), tanggal registrasi, dan kedaluwarsa.
   - Analisis apakah data diproteksi oleh layanan privasi atau terbuka publik.

2. **DNS Enumeration:**
   - Query tipe record dasar: `A`, `AAAA`, `MX` (Server Email), `NS` (Name Server), `TXT` (SPF/DKIM/DMARC).
   - Ekstrak TXT record untuk melihat verifikasi domain pihak ketiga (misal: Google Site Verification, AWS SES).

3. **Subdomain Discovery:**
   - Gunakan teknik pencarian pasif (crt.sh / Certificate Transparency Logs) untuk menemukan subdomain yang valid (misal: `api.target.com`, `dev.target.com`).

4. **Tech Stack Profiling:**
   - Jika OSINT mengarah pada investigasi server, gunakan alat analisis header HTTP (`curl -I`) untuk mengungkap versi Web Server (Nginx/Apache), bahasa pemrograman (PHP/Node), atau WAF (Cloudflare).

## Output Format
- Daftar Subdomain.
- Peta Infrastruktur (IP ke ASN, Lokasi Geografis).
- Potensi Kerentanan Terbuka (misal: zona transfer terbuka, atau SPF record lemah).
