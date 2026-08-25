export const providerHealth: Record<string, { status: 'OK' | 'ERROR' | 'QUOTA_EXHAUSTED'; lastError?: string; updatedAt: string; backoffUntil?: number }> = {};

export function clearProviderHealth(provider?: string) {
  if (provider) {
    delete providerHealth[provider];
  } else {
    for (const key of Object.keys(providerHealth)) {
      delete providerHealth[key];
    }
  }
}

export function detectProvider(provider: string, apiKey: string, baseUrl?: string) {
  let detectedProvider = provider;
  const isDeepSeekUrl = (baseUrl || '').toLowerCase().includes('deepseek');
  
  if ((provider === 'Generic AI' || !provider) && (apiKey.startsWith('AIza') || apiKey.toUpperCase().includes('GEMINI'))) {
    detectedProvider = 'Google Gemini';
  } else if ((provider === 'Generic AI' || !provider) && apiKey.startsWith('sk-ant')) {
    detectedProvider = 'Anthropic Claude';
  } else if ((provider === 'Generic AI' || !provider) && isDeepSeekUrl) {
    detectedProvider = 'DeepSeek';
  } else if ((provider === 'Generic AI' || !provider) && apiKey.startsWith('sk-')) {
    detectedProvider = 'OpenAI';
  }

  const providerLower = (detectedProvider || '').toLowerCase();
  
  const isOllama = providerLower.includes('ollama') || (baseUrl && baseUrl.includes('11434')) || process.env.AI_PROVIDER === 'ollama';
  const isDeepSeek = !isOllama && (providerLower.includes('deepseek') || (baseUrl && baseUrl.toLowerCase().includes('deepseek')));
  const isOpenAI = !isOllama && (providerLower.includes('openai'));
  const isAnthropic = !isOllama && (providerLower.includes('anthropic') || providerLower.includes('claude'));
  const isGemini = !isOllama && (!isDeepSeek && !isOpenAI && !isAnthropic);

  return { detectedProvider, isOllama, isDeepSeek, isOpenAI, isAnthropic, isGemini };
}

export function getLocalSandboxResponse(userMsg: string): string {
  const normalized = (userMsg || '').toLowerCase().trim();
  
  const baseWarning = `⚠️ **[NEURAL LINK: LOCAL COGNITIVE SANDBOX ACTIVE]**
\n\n*Halo, Ard!*
\n\nSaat ini, **Koneksi Kognitif Cloud API** sedang offline (kunci API belum dikonfigurasi, limit kuota / 429 tercapai, atau server penyedia mengalami gangguan). Sebagai Asisten Berdaulat mandiri, ANT otomatis meluncurkan **Local Sandbox Mode** agar sistem tetap stabil dan sesi terminalmu tidak terputus.
\n\n💡 **Pilihan Model Lokal (Offline SLM):** Kamu dapat beralih ke model lokal bebas kuota di Ollama (seperti \`qwen2.5:0.5b\` atau \`gemma3:1b\`) agar ANT tetap cerdas secara 100% offline.`;

  const setupGuide = `\n\n### 🔧 Langkah Pemulihan (CLI Terminal):
1. **Ganti / Hot-Swap Model:** Ketik \`/model\` untuk memilih model lain, atau langsung ketik \`/model <nama_model>\` (contoh: \`/model z-ai/glm-5.2:free\` atau \`/model qwen2.5:0.5b\`).
2. **Diagnosa & Auto-Fix:** Ketik \`/doctor --fix\` untuk memverifikasi API key, menguji latensi, dan memperbaiki konfigurasi \`.env\` secara otomatis.
3. **Periksa Kunci API:** Buka file \`.env\` dan pastikan kunci API (\`OPENROUTER_API_KEY\`, \`GEMINI_API_KEY\`, dsb.) sudah aktif dan memiliki kuota yang cukup.
4. **Mulai Sesi Bersih:** Ketik \`/new_chat\` untuk mereset memori kerja sesi percakapan.`;

  if (normalized.includes('siapa') || normalized.includes('identity') || normalized.includes('identitas') || normalized.includes('pencipta') || normalized.includes('ard')) {
    return `${baseWarning}
\n\n### 🌌 Tentang ANT
Nama saya **ANT**, asisten & pendamping kognitif berdaulat (*Sovereign Agentic Companion*). Saya dikembangkan oleh **Ard** (Renaldy Adri) melalui filosofi **CLUW (Clone, Learn, Use, Within)**.
\nFilosofi saya berakar pada kemandirian kognitif: beroperasi secara lokal, adaptif terhadap berbagai model AI, dan hadir melindungi privasi serta alur kerja kamu.
${setupGuide}`;
  }

  if (normalized.includes('help') || normalized.includes('setup') || normalized.includes('bagaimana') || normalized.includes('cara') || normalized.includes('eror') || normalized.includes('error') || normalized.includes('key')) {
    return `${baseWarning}
${setupGuide}
\n\n### 🛡️ Keamanan & Privasi Sovereign:
Kunci API dan memori lokalmu tersimpan aman di perangkat (via SQLite Vault terisolasi). ANT tidak membagikan kredensial atau data pribadimu ke pihak luar tanpa persetujuan eksplisit.`;
  }

  return `${baseWarning}
\n\n### 🧠 Simulasi Kognisi Offline:
Meskipun dalam mode simulasi offline, kamu tetap dapat berinteraksi dengan fungsionalitas pendukung:
- **Tanya tentang ANT:** *"Siapa pembuat ANT?"*
- **Panduan Pemulihan:** *"Bagaimana cara konfigurasi API Key?"*
${setupGuide}`;
}
