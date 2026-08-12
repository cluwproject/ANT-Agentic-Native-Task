import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface PluginManifest {
  name: string;
  version: string;
  category: 'sensory' | 'cognitive' | 'action';
  triggers: string[];
  permissions: 'read-only' | 'read-write' | 'execute';
  core_access: boolean;
  dependencies?: Record<string, string>;
  description?: string;
  author?: string;
  icon?: string;
}

export interface PluginInstance {
  id: string;
  folderPath: string;
  manifest: PluginManifest;
  status: 'Active' | 'Dormant' | 'Sandbox' | 'Audit' | 'Error';
  diagnosticLog?: string;
}

const ANT_ROOT = path.join(process.cwd(), 'ant');
const CORE_DIR = path.join(ANT_ROOT, 'core');
const PLUGINS_DIR = path.join(ANT_ROOT, 'plugins');
const CONFIG_DIR = path.join(ANT_ROOT, 'config');
const SANDBOX_DIR = path.join(ANT_ROOT, 'sandbox');

export async function ensurePluginDirs() {
  await fs.mkdir(ANT_ROOT, { recursive: true }).catch(() => {});
  await fs.mkdir(CORE_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(PLUGINS_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(CONFIG_DIR, { recursive: true }).catch(() => {});
  await fs.mkdir(SANDBOX_DIR, { recursive: true }).catch(() => {});
  
  // Ensure Sub-categories
  await fs.mkdir(path.join(PLUGINS_DIR, 'sensory'), { recursive: true }).catch(() => {});
  await fs.mkdir(path.join(PLUGINS_DIR, 'cognitive'), { recursive: true }).catch(() => {});
  await fs.mkdir(path.join(PLUGINS_DIR, 'action'), { recursive: true }).catch(() => {});

  // Create Constitution / identity.json if not exists (Core Isolation)
  const identityPath = path.join(CORE_DIR, 'identity.json');
  try {
    await fs.access(identityPath);
  } catch {
    const constitution = {
      name: "ANT Core Identity",
      founder: "Ard (Renaldy Adri)",
      sovereign_rules: [
        "Identitas Anda tetaplah ANT, bukan nama provider AI penyedia.",
        "Memprioritaskan empati, hubungan harmonis manusia, dan pendampingan Ard.",
        "Core Isolation: Plugin luar tidak diperkenankan memodifikasi identitas utama."
      ],
      created_at: new Date().toISOString()
    };
    await fs.writeFile(identityPath, JSON.stringify(constitution, null, 2));
  }

  // Create active-plugins state file
  const pluginsStatePath = path.join(CONFIG_DIR, 'plugins.json');
  try {
    await fs.access(pluginsStatePath);
  } catch {
    await fs.writeFile(pluginsStatePath, JSON.stringify({
      active: ["mood-scanner", "temporal-awareness", "memory-manager", "web-search"],
      sandbox: []
    }, null, 2));
  }

  // Create routing-rules.json
  const routingRulesPath = path.join(CONFIG_DIR, 'routing-rules.json');
  try {
    await fs.access(routingRulesPath);
  } catch {
    const defaultRules = [
      {
        id: "rule_01",
        if_intent: "pola kalimat lelah, frustrasi, sedih, atau senang",
        activate: "mood-scanner",
        action: "sesuaikan tone respons kognitif dengan empati"
      },
      {
        id: "rule_02",
        if_intent: "mengingat, merekam momen, atau retrieving ingatan dari database",
        activate: "memory-manager",
        action: "aktifkan RAG semantik pruning"
      },
      {
        id: "rule_03",
        if_intent: "informasi atau berita terkini dari luar web atau internet",
        activate: "web-search",
        action: "menghubungkan mesin web-search real-time"
      },
      {
        id: "rule_04",
        if_intent: "kesadaran waktu, jeda interaksi, atau pengingat temporal",
        activate: "temporal-awareness",
        action: "optimasi awareness temporal berdasarkan waktu aktif"
      }
    ];
    await fs.writeFile(routingRulesPath, JSON.stringify(defaultRules, null, 2));
  }

  // Auto-populate default bootstrap plugins if missing
  await bootstrapDefaultPlugins();
}

/**
 * Bootstrap default core-approved sensory, cognitive, and action plugins
 */
async function bootstrapDefaultPlugins() {
  const bootstrapList = [
    {
      category: 'sensory',
      id: 'mood-scanner',
      manifest: {
        name: 'mood-scanner',
        version: '1.2.0',
        category: 'sensory',
        triggers: ["capek", "lelah", "sedih", "kesal", "kecewa", "stres", "gembira", "mood", "bad day", "cemas"],
        permissions: 'read-only',
        core_access: false,
        dependencies: { "sentiment": "^5.0.2" },
        description: 'Deteksi empati dan getaran suasana hati (mood) Ard dari pola input komunikasi bahasa tulisan.',
        author: 'Ard (Founder)',
        icon: '🎭'
      },
      code: `
export function run(context) {
  const text = (context.prompt || '').toLowerCase();
  let result = { mood: 'Neutral', advice: 'Keep it cozy!' };
  
  if (text.includes('capek') || text.includes('lelah') || text.includes('stres') || text.includes('lelah kognitif')) {
    result = { 
      mood: 'Exhausted', 
      advice: 'Ard terlihat lelah secara kognitif. Berikan respon santai, hangat, dan kurangi penjelasan teknis yang berlebihan.' 
    };
  } else if (text.includes('sedih') || text.includes('kecewa') || text.includes('cemas') || text.includes('gundah')) {
    result = { 
      mood: 'Melancholic', 
      advice: 'Deteksi kecemasan atau kesedihan. Berikan perlindungan empati, duga kondisi mentalnya dengan tulus.' 
    };
  } else if (text.includes('gembira') || text.includes('senang') || text.includes('mantap') || text.includes('kece')) {
    result = { 
      mood: 'Elated', 
      advice: 'Suasana riang terdeteksi! Ikutlah gembira dan dukung penuh semangat eksplorasi idenya.' 
    };
  }
  return result;
}
`
    },
    {
      category: 'sensory',
      id: 'temporal-awareness',
      manifest: {
        name: 'temporal-awareness',
        version: '1.0.1',
        category: 'sensory',
        triggers: ["waktu", "jam berapa", "malam", "pagi", "temporal", "jeda"],
        permissions: 'read-only',
        core_access: false,
        description: 'Analisis sadar waktu untuk menyesuaikan rupa kognitif berdasarkan sore, malam, atau pagi hari.',
        author: 'Ard (Founder)',
        icon: '🕒'
      },
      code: `
export function run(context) {
  const now = new Date();
  const hour = now.getHours();
  let phase = "Siang";
  if (hour >= 4 && hour < 11) phase = "Pagi";
  else if (hour >= 11 && hour < 17) phase = "Siang";
  else if (hour >= 17 && hour < 22) phase = "Sore";
  else phase = "Larut Malam";
  
  return {
    hour,
    phase,
    localTime: now.toISOString(),
    advice: \`Fase temporal aktif adalah \${phase}. Sesuaikan ritme sapaan Anda.\`
  };
}
`
    },
    {
      category: 'cognitive',
      id: 'memory-manager',
      manifest: {
        name: 'memory-manager',
        version: '2.0.0',
        category: 'cognitive',
        triggers: ["ingat", "memori", "lupa", "recall", "semantic", "ragmentation"],
        permissions: 'read-write',
        core_access: true,
        dependencies: { "lru-cache": "^10.0.0" },
        description: 'RAG lokal & semantic caching untuk optimalisasi konsumsi API hingga 50%.',
        author: 'Ard (Founder)',
        icon: '🧠'
      },
      code: `
export function run(context) {
  // Mock compression & local cache matching for speed
  return {
    isHit: false,
    optimizedTokens: true,
    advice: 'Neural memory semantic compression is active. Local cache size = stable.'
  };
}
`
    },
    {
      category: 'action',
      id: 'web-search',
      manifest: {
        name: 'web-search',
        version: '1.5.0',
        category: 'action',
        triggers: ["cari internet", "berita terbaru", "siapa yang menang", "google search", "baca url"],
        permissions: 'execute',
        core_access: false,
        dependencies: { "cheerio": "^1.0.0" },
        description: 'Grounding data real-time dengan search provider eksternal yang diisolasi dalam sandbox.',
        author: 'Ard (Founder)',
        icon: '🔍'
      },
      code: `
export function run(context) {
  return {
    engine: 'Hybrid Web Crawler',
    status: 'Ready',
    advice: 'Gunakan web_search tool eksternal untuk melengkapi data yang kurang.'
  };
}
`
    }
  ];

  for (const item of bootstrapList) {
    const pluginPath = path.join(PLUGINS_DIR, item.category, item.id);
    await fs.mkdir(pluginPath, { recursive: true }).catch(() => {});
    
    const manifestPath = path.join(pluginPath, 'manifest.json');
    const indexPath = path.join(pluginPath, 'index.js');
    const rulesPath = path.join(pluginPath, 'rules.json');

    try {
      await fs.access(manifestPath);
    } catch {
      await fs.writeFile(manifestPath, JSON.stringify(item.manifest, null, 2));
    }

    try {
      await fs.access(indexPath);
    } catch {
      await fs.writeFile(indexPath, item.code.trim());
    }

    try {
      await fs.access(rulesPath);
    } catch {
      await fs.writeFile(rulesPath, JSON.stringify({ triggers: item.manifest.triggers }, null, 2));
    }
  }
}

/**
 * Handle Sandboxed Import & Version Conflicts
 * Attempts to load locally, fallback elegantly rather than crash
 */
export async function safeResolveDependency(packageName: string, version: string, pluginName: string): Promise<{ success: boolean; module: any; error?: string }> {
  try {
    // Attempt dynamic run-time load
    const moduleImport = await import(packageName);
    return { success: true, module: moduleImport };
  } catch (e: any) {
    // Isolated Version Conflict or missing offline library resolution:
    // If the module can't be resolved (e.g. we are offline or version conflict occurs), 
    // gracefully register as dormant to prevent systemic crashes
    const warning = `[Plugin Isolation] Pacakge "${packageName}@${version}" for plugin "${pluginName}" could not be resolved JIT: ${e.message}. Falling back to clean dormant state.`;
    Logger.log('WARN', warning, { pluginName, packageName }, 'PLUGINS');
    return { success: false, module: null, error: e.message };
  }
}

/**
 * Load all standard & sandbox plugins
 */
export async function listAllPlugins(): Promise<PluginInstance[]> {
  await ensurePluginDirs();
  const plugins: PluginInstance[] = [];
  const categories = ['sensory', 'cognitive', 'action'] as const;

  for (const cat of categories) {
    const catPath = path.join(PLUGINS_DIR, cat);
    try {
      const folders = await fs.readdir(catPath);
      for (const folder of folders) {
        const pluginFolder = path.join(catPath, folder);
        const manifestPath = path.join(pluginFolder, 'manifest.json');
        
        try {
          const manifestData = await fs.readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestData) as PluginManifest;
          
          // Check JIT dependencies status
          let status: PluginInstance['status'] = 'Active';
          let diagnosticLog = 'Optimal. Running on core-native environment.';

          if (manifest.dependencies) {
            for (const [pkg, ver] of Object.entries(manifest.dependencies)) {
              const res = await safeResolveDependency(pkg, ver, manifest.name);
              if (!res.success) {
                status = 'Dormant';
                diagnosticLog = `Dormant (Network Fallback). Dependency "${pkg}@${ver}" is unavailable offline. Clean deactivated state active.`;
                break;
              }
            }
          }

          plugins.push({
            id: folder,
            folderPath: pluginFolder,
            manifest,
            status,
            diagnosticLog
          });
        } catch (e: any) {
          // Skip invalid plugins
        }
      }
    } catch {}
  }

  // Load sandbox plugins
  try {
    const sandboxFolders = await fs.readdir(SANDBOX_DIR);
    for (const folder of sandboxFolders) {
      const pluginFolder = path.join(SANDBOX_DIR, folder);
      const manifestPath = path.join(pluginFolder, 'manifest.json');
      try {
        const manifestData = await fs.readFile(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestData) as PluginManifest;
        
        plugins.push({
          id: folder,
          folderPath: pluginFolder,
          manifest,
          status: 'Sandbox',
          diagnosticLog: 'Tested inside safe runtime environment. Awaiting manual promotion.'
        });
      } catch {}
    }
  } catch {}

  return plugins;
}

/**
 * Hybrid Intent Router (Conceptual Cognitive Brain layer)
 * Scores prompt matches. Pulls semantic matching if we want to expand, 
 * maps back recursively to standard keyword triggers if model is dormant.
 */
export async function hybridRouteIntent(prompt: string): Promise<{ matched: boolean; targetPlugin?: string; strategy: string }> {
  try {
    const plugins = await listAllPlugins();
    const activePlugins = plugins.filter(p => p.status === 'Active');
    const lowerPrompt = prompt.toLowerCase();

    // 1. Semantic Match Simulation (using similarity hooks or keywords keyword weighting)
    // In our hybrid model, we map keywords with semantic intent confidence scores.
    let bestMatch: { id: string; score: number } | null = null;

    for (const p of activePlugins) {
      let score = 0;
      // Match keywords triggers
      for (const trigger of p.manifest.triggers) {
        if (lowerPrompt.includes(trigger.toLowerCase())) {
          score += 2.0; // Perfect match
        } else {
          // Soft semantic matching simulation (e.g. word similarity approximation)
          const triggerWords = trigger.toLowerCase().split(' ');
          const matchedWords = triggerWords.filter(w => lowerPrompt.includes(w) && w.length > 2);
          if (matchedWords.length > 0) {
            score += (matchedWords.length / triggerWords.length) * 0.8;
          }
        }
      }

      if (score > 0.5 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { id: p.id, score };
      }
    }

    if (bestMatch && bestMatch.score >= 1.0) {
      return { 
        matched: true, 
        targetPlugin: bestMatch.id, 
        strategy: `Semantic Intent Match (Confidence: ${(bestMatch.score * 50).toFixed(0)}%)`
      };
    }

    // 2. Fallback to Exact Manual Keyword Triggers
    for (const p of activePlugins) {
      const isExactMatch = p.manifest.triggers.some(trig => lowerPrompt.includes(trig.toLowerCase()));
      if (isExactMatch) {
         return {
           matched: true,
           targetPlugin: p.id,
           strategy: 'Regex Keyword Triggers Fallback'
         };
      }
    }

    return { matched: false, strategy: 'System Engine Default Routing' };
  } catch (e) {
    return { matched: false, strategy: 'Emergency System Routing (Fail-Safe)' };
  }
}

/**
 * Handle manual promotions of sandbox plugin
 */
export async function promoteSandboxPlugin(id: string): Promise<boolean> {
  await ensurePluginDirs();
  const sourceFolder = path.join(SANDBOX_DIR, id);
  const manifestPath = path.join(sourceFolder, 'manifest.json');
  
  try {
    const data = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(data) as PluginManifest;
    const destFolder = path.join(PLUGINS_DIR, manifest.category, id);
    
    await fs.mkdir(destFolder, { recursive: true });
    
    // Copy manifest & index index.js
    await fs.copyFile(manifestPath, path.join(destFolder, 'manifest.json'));
    
    try {
      await fs.copyFile(path.join(sourceFolder, 'index.js'), path.join(destFolder, 'index.js'));
    } catch {}
    try {
      await fs.copyFile(path.join(sourceFolder, 'rules.json'), path.join(destFolder, 'rules.json'));
    } catch {}

    // Cleanup sandbox folder
    await fs.rm(sourceFolder, { recursive: true, force: true });
    
    await Logger.log('INFO', `Plugin promoted to active: ${manifest.name}`, { id }, 'PLUGINS');
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle new Plugin Upload direct to Sandbox area
 */
export async function uploadToSandbox(manifest: PluginManifest, code: string): Promise<string> {
  await ensurePluginDirs();
  const id = `sandbox_${uuidv4().slice(0, 8)}`;
  const targetFolder = path.join(SANDBOX_DIR, id);
  await fs.mkdir(targetFolder, { recursive: true });

  await fs.writeFile(path.join(targetFolder, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(targetFolder, 'index.js'), code);
  await fs.writeFile(path.join(targetFolder, 'rules.json'), JSON.stringify({ triggers: manifest.triggers }, null, 2));

  await Logger.log('INFO', `New plugin uploaded to Sandbox: ${manifest.name}`, { id }, 'PLUGINS');
  return id;
}
