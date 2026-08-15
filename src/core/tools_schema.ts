export const antToolsSchema = [
  {
    name: "request_human_rescue",
    description: "Digunakan HANYA JIKA tertahan oleh halaman login, CAPTCHA, atau anti-bot (Cloudflare, dll) saat melakukan tugas otonom di web. Ini akan memanggil manusia (Ard) untuk membuka blokir web secara manual di layar mereka.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "list_dir",
    description: "Melihat isi folder. (Kini memiliki akses penuh ke ROOT project).",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    }
  },
  {
    name: "read_file",
    description: "Riset kode. Membaca isi file secara spesifik.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        startLine: { type: "number" },
        endLine: { type: "number" }
      },
      required: ["file"]
    }
  },
  {
    name: "modify_file",
    description: "Buat/Edit file keseluruhan (Workspace jail telah diangkat).",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        content: { type: "string" }
      },
      required: ["file", "content"]
    }
  },
  {
    name: "edit_file",
    description: "Bedah kode presisi tinggi (Patch). targetContent harus sama PERSIS.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        targetContent: { type: "string" },
        replacementContent: { type: "string" }
      },
      required: ["file", "targetContent", "replacementContent"]
    }
  },
  {
    name: "syntax_check",
    description: "Menjalankan typescript linter / typechecker (LSP).",
    parameters: {
      type: "object",
      properties: { file: { type: "string" } }
    }
  },
  {
    name: "git_checkpoint",
    description: "Menyimpan snapshot / commit Git pada repositori proyek saat ini sebagai checkpoint kemajuan tugas.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Pesan checkpoint / commit deskriptif." },
        files: { type: "string", description: "File yang di-stage (default: '.')" },
        path: { type: "string", description: "Direktori repo (opsional)" }
      },
      required: ["message"]
    }
  },
  {
    name: "git_status",
    description: "Melihat status perubahan file pada repositori Git.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } }
    }
  },
  {
    name: "git_diff",
    description: "Melihat perbedaan kode git diff sebelum dan sesudah perubahan.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string" },
        staged: { type: "boolean" }
      }
    }
  },
  {
    name: "git_log",
    description: "Melihat riwayat log commit / checkpoint Git sebelumnya.",
    parameters: {
      type: "object",
      properties: {
        n: { type: "number", description: "Jumlah log commit (default: 5)" }
      }
    }
  },
  {
    name: "shell_exec",
    description: "Eksekusi terminal (Prioritaskan npx, grep, git, tsc, vite).",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"]
    }
  },
  {
    name: "tiktok_osint",
    description: "Mengekstrak data JSON (caption, URL gambar/slide, dll) langsung dari HTML TikTok secara akurat (tanpa browser, tanpa OCR).",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "kaggle_action",
    description: "Mengelola Kaggle (search dataset, download dataset, search competition, submit competition) tanpa perlu mengetik command panjang.",
    parameters: {
      type: "object",
      properties: { 
        subAction: { type: "string", description: "search_datasets, download_dataset, search_competitions, download_competition, submit_competition" },
        query: { type: "string" },
        dataset: { type: "string" },
        competition: { type: "string" },
        path: { type: "string" },
        file: { type: "string" },
        message: { type: "string" }
      },
      required: ["subAction"]
    }
  },
  {
    name: "outreach_verifier",
    description: "Membuat pola email tebakan B2B (Hunter/Apollo pattern) dan menyusun kerangka dokumen proposal partnership untuk klien.",
    parameters: {
      type: "object",
      properties: { 
        firstName: { type: "string" }, 
        lastName: { type: "string" }, 
        domain: { type: "string" }, 
        company: { type: "string" } 
      },
      required: ["domain"]
    }
  },
  {
    name: "gemini_analyze_image",
    description: "Multimodal OCR. Membaca isi teks dalam gambar screenshot browser atau gambar lokal.",
    parameters: {
      type: "object",
      properties: { 
        prompt: { type: "string" },
        image: { type: "string", description: "Absolute path ke file gambar" }
      },
      required: ["prompt", "image"]
    }
  },
  {
    name: "knowledge_add",
    description: "Menambahkan pengetahuan/dokumentasi baru ke dalam Native Knowledge Vault ANT.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        category: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "knowledge_query",
    description: "Mencari dokumen pengetahuan khusus di dalam Native Knowledge Vault ANT.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  },
  {
    name: "memory_store",
    description: "Simpan memori neural.",
    parameters: {
      type: "object",
      properties: { key: { type: "string" }, value: { type: "string" } },
      required: ["key", "value"]
    }
  },
  {
    name: "memory_recall",
    description: "Ambil memori kognitif.",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } }
    }
  },
  {
    name: "browser_launch",
    description: "Buka browser dengan URL.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" }, visible: { type: "boolean" } },
      required: ["url"]
    }
  },
  {
    name: "browser_click",
    description: "Klik elemen di browser aktif.",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" } },
      required: ["selector"]
    }
  },
  {
    name: "browser_type",
    description: "Ketik di form browser.",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" }, text: { type: "string" } },
      required: ["selector", "text"]
    }
  },
  {
    name: "browser_snapshot",
    description: "Ekstrak snapshot teks dari browser aktif.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "browser_close",
    description: "Tutup sesi browser.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "ant_skill_create",
    description: "Menulis dan mendaftarkan custom skill (Node.js .js atau Python .py) baru.",
    parameters: {
      type: "object",
      properties: { fileName: { type: "string" }, code: { type: "string" } },
      required: ["fileName", "code"]
    }
  },
  {
    name: "ant_skill_execute",
    description: "Menjalankan custom skill.",
    parameters: {
      type: "object",
      properties: {
        fileName: { type: "string" },
        args: { type: "array", items: { type: "string" } }
      },
      required: ["fileName"]
    }
  },
  {
    name: "web_search",
    description: "Mencari informasi real-time di internet (Tavily Search).",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  },
  {
    name: "fetch_url_content",
    description: "Mengambil teks/HTML dari sebuah URL secara langsung (Berguna untuk membaca link spesifik tanpa menggunakan shell_exec).",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "image_generate",
    description: "Menghasilkan gambar (hanya untuk Gemini).",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        aspect_ratio: { type: "string", enum: ["1:1", "16:9", "9:16"] }
      },
      required: ["prompt"]
    }
  },
  {
    name: "mexc_get_balance_futures",
    description: "Mengecek saldo dompet MEXC Futures.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "mexc_get_ticker_futures",
    description: "Mengecek harga pair futures.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"]
    }
  },
  {
    name: "mexc_get_open_positions",
    description: "Melihat SEMUA posisi Futures yang sedang terbuka.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "mexc_get_open_orders",
    description: "Melihat order yang masih pending/aktif.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } }
    }
  },
  {
    name: "mexc_get_order_history",
    description: "Riwayat order yang sudah selesai.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" }, pageSize: { type: "number" } },
      required: ["symbol"]
    }
  },
  {
    name: "mexc_get_index_price",
    description: "Mengecek harga index & fair price.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"]
    }
  },
  {
    name: "mexc_get_risk_info",
    description: "Melihat info risiko akun.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "mexc_cancel_order",
    description: "Membatalkan order yang masih aktif.",
    parameters: {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"]
    }
  },
  {
    name: "mexc_close_position_market",
    description: "Menutup SEMUA posisi terbuka pada simbol tersebut.",
    parameters: {
      type: "object",
      properties: { symbol: { type: "string" } },
      required: ["symbol"]
    }
  },
  {
    name: "mexc_place_order_futures",
    description: "Eksekusi order MEXC Futures.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string" },
        price: { type: "number" },
        vol: { type: "number" },
        side: { type: "number" },
        type: { type: "number" }
      },
      required: ["symbol", "price", "vol", "side", "type"]
    }
  },
  {
    name: "generate_trading_ea",
    description: "Menghasilkan kode MQL4/MQL5 Expert Advisor.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["MT4", "MT5"] },
        strategy: { type: "string" },
        parameters: { type: "string" }
      },
      required: ["platform", "strategy", "parameters"]
    }
  },
  {
    name: "security_check_ssl",
    description: "Memeriksa SSL certificate.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string" }, port: { type: "number" } },
      required: ["domain"]
    }
  },
  {
    name: "security_dns_analyze",
    description: "Analisis DNS records.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string" }, record_type: { type: "string" } },
      required: ["domain"]
    }
  },
  {
    name: "security_check_headers",
    description: "Audit HTTP security headers.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "security_network_scan",
    description: "Port scan via nmap.",
    parameters: {
      type: "object",
      properties: { target: { type: "string" }, ports: { type: "string" } },
      required: ["target"]
    }
  },
  {
    name: "security_osint_harvest",
    description: "Kumpulkan subdomain dan WHOIS.",
    parameters: {
      type: "object",
      properties: { domain: { type: "string" }, include_whois: { type: "boolean" } },
      required: ["domain"]
    }
  },
  {
    name: "security_zap_spider",
    description: "Jalankan ZAP spider.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "security_zap_scan",
    description: "Jalankan ZAP active scan.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "security_zap_alerts",
    description: "Ambil laporan temuan ZAP.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" }, risk: { type: "string" } },
      required: ["url"]
    }
  },
  {
    name: "security_full_report",
    description: "Laporan komprehensif SSL + DNS + Headers + OSINT.",
    parameters: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"]
    }
  },
  {
    name: "bb_parse_scope",
    description: "Parse dan simpan scope program bug bounty.",
    parameters: {
      type: "object",
      properties: {
        scope_text: { type: "string" },
        program_name: { type: "string" },
        platform: { type: "string" }
      },
      required: ["scope_text", "program_name"]
    }
  },
  {
    name: "bb_get_scope",
    description: "Tampilkan scope program yang aktif.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "bb_validate_target",
    description: "Validasi apakah target masuk dalam scope aktif.",
    parameters: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"]
    }
  },
  {
    name: "bb_suggest_recon",
    description: "Dapatkan rencana rekon metodis.",
    parameters: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"]
    }
  },
  {
    name: "bb_run_recon",
    description: "Jalankan pipeline rekon lengkap.",
    parameters: {
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"]
    }
  },
  {
    name: "bb_add_finding",
    description: "Catat temuan kerentanan.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        severity: { type: "string", enum: ["Critical", "High", "Medium", "Low", "Informational"] },
        target: { type: "string" },
        description: { type: "string" },
        steps_to_reproduce: { type: "string" },
        impact: { type: "string" },
        evidence: { type: "string" }
      },
      required: ["title", "severity", "target", "description", "steps_to_reproduce", "impact"]
    }
  },
  {
    name: "bb_list_findings",
    description: "Tampilkan semua temuan yang dicatat.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "bb_draft_report",
    description: "Buat laporan kerentanan.",
    parameters: {
      type: "object",
      properties: { finding_id: { type: "string" } },
      required: ["finding_id"]
    }
  },
  {
    name: "ant_eyes",
    description: "Periksa berkas frontend/visual/layout (Eyes).",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "whatsapp_send_message",
    description: "Kirim pesan WhatsApp.",
    parameters: {
      type: "object",
      properties: { to: { type: "string" }, text: { type: "string" } },
      required: ["to", "text"]
    }
  },
  {
    name: "open_browser",
    description: "Buka URL di browser sistem Ard.",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"]
    }
  }
];

export function getGeminiToolDeclarations() {
  return [{ functionDeclarations: antToolsSchema }];
}

export function getAnthropicToolDeclarations() {
  return antToolsSchema.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters
  }));
}

export function getOpenAIToolDeclarations() {
  return antToolsSchema.map(t => ({
    type: "function",
    function: t
  }));
}
