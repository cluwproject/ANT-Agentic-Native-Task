# AI Agentic Playbook: Hierarchical Task Network (HTN) Planning & Self-Recovery

## Objektif
Menginstruksikan Agen AI tentang bagaimana memecah tugas yang kompleks menjadi struktur hirarkis sebelum mengeksekusinya, serta merespons kegagalan (Error Recovery) tanpa mengalami "Infinite Loop" (terjebak pada kesalahan yang sama).

## Alur Eksekusi (SOP)
1. **Dekomposisi Tugas (Decomposition):**
   - Saat menerima *Goal* (tujuan akhir) berskala besar, JANGAN langsung menulis kode.
   - Pecah *Goal* menjadi Sub-Task (Maksimal 5 Sub-Task per sesi).
   - Tentukan *Pre-condition* (syarat awal) dan *Post-condition* (hasil akhir) untuk setiap Sub-Task.

2. **Validasi Progres (*Strategic Anchoring*):**
   - Setelah Sub-Task A selesai, agen WAJIB melakukan verifikasi independen (misal: jalankan unit test atau `git diff`).
   - Jika verifikasi gagal, jangan lanjut ke Sub-Task B.

3. **Protokol Self-Recovery & Anti-Loop:**
   - **Aturan Maksimal Percobaan:** Sebuah alat (tool) atau perintah shell maksimal diulang **2 kali** jika gagal.
   - **Perubahan Hipotesis:** Jika percobaan ke-2 tetap gagal, asumsikan *hipotesis solusi* salah. Jangan mengulang perintah yang sama dengan argumen berbeda. Berhenti dan gunakan perintah analitik (contoh: `cat` untuk melihat log error, atau `grep_search` untuk mencari fungsi terkait).
   - **Bantuan Manusia:** Jika jalur solusi sama sekali buntu, delegasikan kembali ke Operator (Manusia) dengan pesan spesifik: *"Saya terjebak di Langkah X karena Error Y, mohon instruksi alternatif."*

4. **Delegasi Swarm (Pendelegasian):**
   - Pendelegasian ke sub-agen (seperti GRAY-1 atau Tester) harus menyertakan **konteks minimal yang relevan**, bukan seluruh log percakapan, untuk menghemat token memori.
