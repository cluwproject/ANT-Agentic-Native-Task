# Cyber Security Playbook: Audit Celah Web (XSS & SQLi)

## Spesialisasi Unit: GRAY-2 (Injection & Input Validation)

## Objektif
Mengaudit titik masukan (*input endpoints*) pada sebuah aplikasi web atau *source code* untuk menemukan potensi eksekusi skrip lintas situs (Cross-Site Scripting / XSS) dan Injeksi SQL.

## Alur Eksekusi (SOP)
1. **Identifikasi Endpoint Input:**
   - Gunakan `grep_search` pada source code lokal untuk mencari pengambilan input seperti: `req.query`, `req.body`, `$_GET`, `$_POST`.
   - Cari kueri database mentah (raw queries) yang menggabungkan string: `SELECT * FROM users WHERE name = '${input}'`.

2. **Pengujian XSS Statis:**
   - Periksa apakah output di-render langsung ke antarmuka pengguna tanpa proses *sanitization* (misal: di React `dangerouslySetInnerHTML`, atau di PHP `echo $input;`).
   - Identifikasi apakah framework yang digunakan (Next.js, Vue, Laravel) sudah mengaktifkan proteksi *auto-escaping* bawaan.

3. **Pengujian SQLi Statis:**
   - Verifikasi penggunaan ORM (Prisma, Sequelize, TypeORM) atau *Prepared Statements*.
   - Jika *raw query* digunakan, pastikan penggunaan *parameterized query* (misal: `SELECT * FROM users WHERE id = $1`). 
   - Flag semua kode yang tidak menggunakan parameterisasi sebagai kerentanan tingkat HIGH.

4. **Remediation & Pelaporan:**
   - Hasilkan *Finding Card* berisi: Baris Kode (Line Number), Jenis Celah (CWE), dan *Proof of Concept* (cara celah bisa dieksploitasi).
   - Tulis *patch* (perbaikan kode) menggunakan *sanitization library* yang direkomendasikan sistem (misal: `DOMPurify` untuk XSS).
