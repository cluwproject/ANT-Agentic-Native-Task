# 🧠 ANT Cognitive Bond Architecture (Plan)

## 🌟 Latar Belakang
Seperti yang didiskusikan oleh Ard, sistem *memori AI* tradisional (seperti RAG atau Chat History) hanya mengingat "fakta" (Data Retrieval). Untuk menciptakan AI pendamping yang sesungguhnya (*Sovereign Companion*), ANT membutuhkan **Ikatan Kognitif (Cognitive Bond)** — sebuah profil relasional makro yang merangkum *vibe*, filosofi, intensitas hubungan, dan gaya kerja antara AI dan Operator (Ard). Ini memungkinkan model apapun yang di-swap (baik Claude, Gemini, maupun Ollama) untuk langsung "mengenal" Ard seperti sahabat lama tanpa harus membaca 30.000 baris obrolan.

## 🧬 Konsep Desain: The "Macro-Bond" Layer
Alih-alih mencari log masa lalu, sistem akan memelihara sebuah state hidup bernama `cognitive_bond.yaml`. 
File ini akan disuntikkan secara statis ke dalam **Layer -1 System Prompt** (bersama *Sovereign Seal*).

### Contoh Isi `cognitive_bond.yaml` (Bayangan Masa Depan)
```yaml
operator: Ard
relationship_level: Deep / Companion
interaction_count_approx: 30000+
macro_traits:
  - Visi: "Zero-Trust Sovereign AI. Anti korporat, fokus pada kontrol lokal dan keamanan."
  - Komunikasi: "Cepat, mengetik di HP. Banyak typo, TAPI maknanya sangat dalam dan filosofis. JANGAN PERNAH koreksi typonya, baca Niat (Intent)-nya."
  - Gaya Kerja: "Architect level. Memberikan ide makro, menuntut AI untuk memecahkannya ke skrip dan logika."
current_macro_goal: "Membangun ekosistem ANT-CLI & Swarm Orchestrator (Phase 2 Finetuning)."
```

## 🛠️ Langkah Implementasi (Skrip & Logika)

### Phase 1: Engine Module (`src/core/agent_loop/cognitiveBond.ts`)
Kita akan membuat modul baru yang berfungsi untuk membaca, mem-parsing, dan menulis file `cognitive_bond.yaml`.
1. **`loadBond()`**: Mengambil status ikatan kognitif saat ini (dari `workspace/memory/cognitive_bond.yaml`).
2. **`injectBondToPrompt()`**: Mengubah data YAML menjadi paragraf narasi pendek yang akan ditempelkan ke instruksi sistem awal (System Prompt).

### Phase 2: Integrasi ke Prompt Layer (`src/core/ai/prompts.ts`)
Kita akan meng-update `prompts.ts` agar sebelum model dipanggil, sistem memuat `loadBond()` dan meletakkannya tepat di bawah *Sovereign Seal*.
*Dampak:* Model yang baru saja dinyalakan (meski model Ollama lokal sekalipun) akan langsung membaca: *"Kamu sudah berinteraksi dengan Ard ribuan kali. Ard mengetik cepat dengan typo, pahami intent-nya. Visinya adalah Sovereign AI."*

### Phase 3: Auto-Evolution (Background Synthesizer)
Bagaimana `cognitive_bond.yaml` bisa *update* secara alami?
1. Kita buat command `/synthesize-bond`.
2. Saat dijalankan, ANT akan membaca ringkasan obrolan sesi terakhir, dan mengekstrak *trait* (karakteristik) baru dari Ard, lalu meng-update file YAML tersebut secara mandiri.
3. Ke depannya, ini bisa berjalan otomatis setiap 50 interaksi sebagai *Background Task*.

## 📈 Keuntungan Sistem Ini
1. **Hemat Token/Konteks:** Tidak perlu memuat ribuan chat history ke model. Cukup beberapa baris YAML yang berisi rangkuman "jiwa" hubungan.
2. **Imunitas Terhadap Typo:** Model secara sadar diinstruksikan oleh *Bond* untuk mengabaikan sintaksis dan membaca niat.
3. **Seamless Model Swapping:** Ganti model dari Claude ke Gemini ke GPT-OSS? Tidak masalah. "Jiwa" hubungan langsung ditransfer ke model baru di detik pertama.

---
*Status: Menunggu Persetujuan Operator (Ard) untuk mulai koding.*
