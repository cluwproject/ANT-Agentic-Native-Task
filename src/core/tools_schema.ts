/**
 * ════════════════════════════════════════════════════════════════════
 * ANT — CURATED CORE TOOLS SCHEMA (v0.2.0 Hardened)
 * ════════════════════════════════════════════════════════════════════
 * Clean, production-grade JSON-Schema definitions for all native,
 * verified built-in tools. Specialized domain tools (MEXC, OSINT, BugBounty)
 * are managed dynamically as On-Demand Custom Skills via `ant_skill_*`.
 * ════════════════════════════════════════════════════════════════════
 */

export const antToolsSchema = [
  // ── FILE OPERATIONS & CODE EDITING ─────────────────────────────────
  {
    name: "read_file",
    description: "Membaca isi berkas/file di workspace atau project root.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path file yang ingin dibaca" },
        startLine: { type: "number", description: "Baris awal (opsional, 1-indexed)" },
        endLine: { type: "number", description: "Baris akhir (opsional, inclusive)" }
      },
      required: ["file"]
    }
  },
  {
    name: "list_dir",
    description: "Melihat daftar file dan sub-folder di direktori yang ditentukan.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path direktori (default: '.')" }
      }
    }
  },
  {
    name: "write_file",
    description: "Menulis atau membuat file baru dengan konten lengkap di workspace.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path file target" },
        content: { type: "string", description: "Konten teks lengkap file" }
      },
      required: ["file", "content"]
    }
  },
  {
    name: "modify_file",
    description: "Mengubah isi file yang sudah ada dengan konten baru.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path file target" },
        content: { type: "string", description: "Konten teks baru" }
      },
      required: ["file", "content"]
    }
  },
  {
    name: "edit_file",
    description: "Bedah kode presisi tinggi (surgical patch). Mengganti targetContent dengan replacementContent.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path file target" },
        targetContent: { type: "string", description: "Potongan teks lama yang persis sama" },
        replacementContent: { type: "string", description: "Potongan teks pengganti baru" }
      },
      required: ["file", "targetContent", "replacementContent"]
    }
  },
  {
    name: "delete_file",
    description: "Menghapus file di dalam workspace.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path file yang ingin dihapus" }
      },
      required: ["file"]
    }
  },

  // ── GIT VERSION CONTROL & CHECKPOINTING ────────────────────────────
  {
    name: "git_checkpoint",
    description: "Menyimpan snapshot / commit Git pada repositori proyek saat ini sebagai checkpoint kemajuan tugas.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Pesan checkpoint / commit deskriptif" },
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
      properties: {
        path: { type: "string", description: "Direktori repo (opsional)" }
      }
    }
  },
  {
    name: "git_diff",
    description: "Melihat perbedaan kode git diff sebelum dan sesudah perubahan.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File spesifik (opsional)" },
        staged: { type: "boolean", description: "Cek perubahan staged (--cached)" }
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

  // ── TERMINAL, SHELL & DIAGNOSTICS ──────────────────────────────────
  {
    name: "shell_exec",
    description: "Mengeksekusi perintah shell langsung di terminal sistem (npm, git, find, node, dsb).",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Perintah shell tunggal yang ingin dijalankan" }
      },
      required: ["command"]
    }
  },
  {
    name: "run_tests",
    description: "Menjalankan test proyek yang relevan setelah perubahan kode. Gunakan tanpa argumen untuk menjalankan npm test; command opsional hanya untuk test Node.js yang lebih spesifik.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Perintah test Node.js opsional, misalnya 'npm run typecheck'." }
      }
    }
  },
  {
    name: "grep_search",
    description: "Mencari pola teks / string / regex di dalam file proyek dengan ripgrep.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Kata kunci atau regex yang dicari" },
        path: { type: "string", description: "Direktori target (opsional)" },
        include: { type: "string", description: "Filter ekstensi file (misal: *.ts)" },
        case_insensitive: { type: "boolean", description: "Pencarian tidak peka huruf besar/kecil" }
      },
      required: ["query"]
    }
  },
  {
    name: "syntax_check",
    description: "Menjalankan TypeScript linter / compiler typecheck (tsc --noEmit) untuk verifikasi kode.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "File spesifik atau kosongkan untuk seluruh proyek" }
      }
    }
  },
  {
    name: "execute_js",
    description: "Mengeksekusi kode JavaScript di dalam sandbox VM terisolasi untuk kalkulasi cepat.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "Potongan kode JavaScript untuk dieksekusi" }
      },
      required: ["code"]
    }
  },
  {
    name: "env_check",
    description: "Memeriksa versi Node.js, NPM, dan package dependencies proyek aktif.",
    parameters: {
      type: "object",
      properties: {}
    }
  },

  // ── WEB EXTRACTION & BROWSER AUTOMATION ────────────────────────────
  {
    name: "fetch_url_content",
    description: "Mengambil teks atau HTML dari sebuah URL secara langsung tanpa membuka browser.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL website target" }
      },
      required: ["url"]
    }
  },
  {
    name: "web_search",
    description: "Mencari informasi real-time di internet (Tavily Search Engine).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Query pencarian web" }
      },
      required: ["query"]
    }
  },
  {
    name: "open_browser",
    description: "Membuka browser Playwright untuk inspeksi halaman web dinamis / interaktif.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL yang ingin dibuka" }
      },
      required: ["url"]
    }
  },
  {
    name: "browser_click",
    description: "Melakukan klik pada elemen selector di browser aktif.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector elemen target" }
      },
      required: ["selector"]
    }
  },
  {
    name: "browser_type",
    description: "Mengetikkan teks ke input form pada browser aktif.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector field input" },
        text: { type: "string", description: "Teks yang ingin diketikkan" }
      },
      required: ["selector", "text"]
    }
  },
  {
    name: "browser_snapshot",
    description: "Mengambil snapshot teks atau teks terstruktur dari browser aktif.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "browser_close",
    description: "Menutup sesi browser Playwright yang sedang terbuka.",
    parameters: {
      type: "object",
      properties: {}
    }
  },

  // ── DYNAMIC SKILL ENGINE (EXTENSIBLE PLUGINS) ──────────────────────
  {
    name: "ant_skill_create",
    description: "Menulis dan mendaftarkan custom skill (Node.js .js atau Python .py) baru di workspace.",
    parameters: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Nama file skill (misal: port_scanner.cjs)" },
        code: { type: "string", description: "Kode script skill lengkap" }
      },
      required: ["fileName", "code"]
    }
  },
  {
    name: "ant_skill_execute",
    description: "Menjalankan custom skill yang telah terdaftar.",
    parameters: {
      type: "object",
      properties: {
        fileName: { type: "string", description: "Nama file skill yang ingin dieksekusi" },
        args: { type: "array", items: { type: "string" }, description: "Daftar argumen CLI untuk skill" }
      },
      required: ["fileName"]
    }
  },
  {
    name: "ant_skill_list",
    description: "Melihat daftar seluruh custom skills yang tersedia di workspace.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "request_human_rescue",
    description: "Meminta bantuan manusia (Ard) jika agen tertahan oleh CAPTCHA atau login manual.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL halaman yang membutuhkan intervensi manual" }
      },
      required: ["url"]
    }
  }
];

export function getGeminiToolDeclarations() {
  return [{ functionDeclarations: [...antToolsSchema, ...getMcpToolSchemas()] }];
}

export function getAnthropicToolDeclarations() {
  return [...antToolsSchema, ...getMcpToolSchemas()].map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters
  }));
}

export function getOpenAIToolDeclarations() {
  return [...antToolsSchema, ...getMcpToolSchemas()].map(t => ({
    type: "function",
    function: t
  }));
}

// MCP bridge: tools dari server eksternal (.ant/mcp.json) otomatis masuk ke
// schema SEMUA provider sehingga SEMUA model bisa memanggilnya. Import statis
// aman — registry tidak bergantung balik ke tools_schema.
import { getMcpToolSchemas } from './mcp/registry.js';

