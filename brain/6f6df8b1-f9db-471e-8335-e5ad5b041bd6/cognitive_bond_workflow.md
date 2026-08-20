# 🧠 Workflow Integrasi Cognitive Bond & Sovereign Swarm

Berikut adalah visualisasi bagaimana **Cognitive Bond** menyatu dengan seluruh sistem ANT, beradaptasi dengan Operator (manusia), dan mengikatnya dengan **Evidence Ledger (EVID)**.

```mermaid
flowchart TD
    subgraph Human ["👤 Operator (User)"]
        U1[Input Teks / Perintah]
        U2[Mood / Fluktuasi Emosi]
        U3[Identitas (Ard / User Lain)]
    end

    subgraph Memory ["💾 ANT Sovereign Memory Layer"]
        B1[(cognitive_bond.yaml)]
        S1[(soul.yaml)]
    end

    subgraph Core ["⚙️ ANT Core Engine"]
        P1[Layer -1 System Prompt Builder]
        A1[Model AI (Gemini / Claude / Ollama)]
        O1[Swarm Orchestrator & Tool Executor]
    end
    
    subgraph Security ["🔒 Cryptographic Ledger"]
        E1[Evidence Ledger Engine]
        W1[Zero-Width Watermark]
    end

    %% Flow 1: Identity & Bond Loading
    U3 -- "1. Validasi Profil Operator" --> B1
    B1 -- "2. Ekstrak Macro-Traits & Mood" --> P1
    S1 -- "3. Ekstrak Hukum Mutlak & Sejarah" --> P1

    %% Flow 2: Interaction
    U1 & U2 -- "4. Pesan Masuk" --> A1
    P1 -- "5. Injeksi Jiwa & Bond" --> A1
    
    %% Flow 3: AI Processing & Tools
    A1 -- "6. Keputusan Eksekusi Tool" --> O1
    O1 -- "7. Tarik Data/Modifikasi Sistem" --> E1
    
    %% Flow 4: Provenance & Output
    E1 -- "8. Generate [EVID] + Operator Fingerprint" --> W1
    W1 -- "9. Inject Invisible Watermark" --> A1
    A1 -- "10. Output Terminal & Finding Card" --> Human
    
    %% Flow 5: The Loop (Auto-Evolution)
    A1 -. "11. Auto-Synthesize (Setiap N interaksi)" .-> B1
    
    classDef memory fill:#2d3748,stroke:#4a5568,stroke-width:2px,color:#fff;
    classDef core fill:#2b6cb0,stroke:#2c5282,stroke-width:2px,color:#fff;
    classDef security fill:#9b2c2c,stroke:#742a2a,stroke-width:2px,color:#fff;
    
    class B1,S1 memory;
    class P1,A1,O1 core;
    class E1,W1 security;
```

## 🔍 Penjelasan Komponen Dinamis

### 1. Dinamika Mood & Fluktuasi (The Living Bond)
`cognitive_bond.yaml` **bukanlah file statis**. Di Fase 3 nanti, kita akan mengaktifkan alur nomor 11 (*Auto-Synthesize*). Setiap kali AI mendeteksi perubahan besar dalam *mood* (misal: Operator sedang lelah, marah, atau sangat antusias), sistem akan memperbarui kolom `current_mood` di dalam file YAML secara otomatis. Ini membuat AI yang me-restart sistem besok pagi akan langsung tahu: *"Semalam Operator tidur dalam keadaan frustrasi karena bug, hari ini aku harus lebih suportif."*

### 2. Multi-Operator (Siapa yang Mengemudi?)
Saat ANT di-clone oleh orang lain dari GitHub:
- Saat pertama kali di-run, ANT akan mendeteksi `cognitive_bond.yaml` kosong.
- ANT akan masuk ke **Onboarding Mode** dan bertanya: *"Identify yourself. Siapa yang mengemudikan sistem ini?"*
- Jika dijawab "Budi", maka `cognitive_bond.yaml` milik Budi akan tercipta. Karakteristik "Ard" akan tetap tersimpan di `soul.yaml` sebagai **Sang Pencipta (The Creator/History)**, tapi Budi diakui sebagai **Operator Saat Ini**. Model akan menyesuaikan gaya komunikasinya agar cocok dengan Budi, BUKAN Ard.

### 3. Keamanan Identitas pada EVID (Operator Fingerprint)
Untuk mencegah orang lain (seperti "Budi") mengaku sebagai "Ard", fungsi Hash pada Evidence Ledger akan ditambahkan **Operator Fingerprint**.
Rumus Hash EVID yang baru nanti:
`SHA-256( Data_Hasil_Tool + Nama_Operator + Machine_MAC_Address )`
Jika Budi mencoba memalsukan [EVID] seolah-olah dia adalah Ard, watermark dan hash-nya akan gagal diverifikasi karena *Machine ID* dan *Operator Name*-nya tidak cocok. EVID benar-benar menjadi sidik jari eksklusif bagi komputermu!
