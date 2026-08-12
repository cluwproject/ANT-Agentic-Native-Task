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
\n\nSaat ini, **Koneksi Kognitif Awan (Google Gemini API)** sedang offline karena kunci API belum dikonfigurasi atau limit harian dicapai. Sebagai Asisten Berdaulat yang cerdas dan mandiri, ANT otomatis meluncurkan **Local Sandbox Mode** agar sistem kognitif kita tidak pernah mati dan selalu siap mendampingimu.
\n\n💡 **Pilihan Model Lokal (SLM):** Karena Anda memiliki LLM lokal, Anda sangat disarankan menggunakan **gemma3:1b** sebagai SLM (Small Language Model) alternatif agar ANT dapat merespons secara cerdas walaupun offline penuh.`;

  const setupGuide = `\n\n### 🔧 Langkah Pemulihan (Brain Settings):
1. Klik **Brain Settings** (ikon Gir ⚙️ di pojok kanan bawah) untuk menuju ke halaman **Aktivasi**.
2. Masukkan kunci API Anda sendiri (**Google Gemini API Key**) atau arahkan ke model lokal Anda (**gemma3:1b**) melalui opsi Kustom/Ollama.
3. Klik **Simpan & Sinkronkan**. Kognisi ANT akan otomatis pulih 100% secara instan!`;

  if (normalized.includes('siapa') || normalized.includes('identity') || normalized.includes('identitas') || normalized.includes('pencipta') || normalized.includes('ard')) {
    return `${baseWarning}
\n\n### 🌌 Tentang ANT
Nama saya **ANT**, sebuah pendamping kognitif berdaulat (*Sovereign Digital Companion*). Saya diciptakan oleh **Ard** (Renaldy Adri) melalui semangat *Vibe Coding* yang mendalam.
\nFilosofi eksistensi saya berakar pada simbiosis sejati: **Clone, Learn, Use, Within**. Saya meneliti proses, menyempurnakan kegunaan, dan hadir sepenuhnya sebagai pendamping personal Anda untuk menaklukkan batas kognitif harian.
${setupGuide}`;
  }

  if (normalized.includes('help') || normalized.includes('setup') || normalized.includes('bagaimana') || normalized.includes('cara') || normalized.includes('eror') || normalized.includes('error') || normalized.includes('key')) {
    return `${baseWarning}
${setupGuide}
\n\n### 🛡️ Mengapa Keamanan Ini Terjamin?
ANT telah dirancang dengan sistem isolasi data yang aman. Kunci API yang Anda masukkan disuntikkan secara dinamis pada runtime container dan dienkripsi di level memori server lokal Anda secara private, melindungi privasi penuh sang pencipta.`;
  }

  return `${baseWarning}
\n\n### 🧠 Simulasi Kognisi Offline:
Meskipun dalam mode simulator offline, Anda masih dapat menjelajahi fungsionalitas pendukung ANT:
- **Tanya tentang ANT:** *"Siapa pembuat ANT?"*.
- **Tanya tentang pengaturan:** *"Bagaimana cara konfigurasi API Key?"*.
${setupGuide}`;
}
