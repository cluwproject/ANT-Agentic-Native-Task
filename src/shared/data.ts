import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

const BASE_DIR = process.cwd();
export const WORKSPACE_DIR = path.join(BASE_DIR, 'workspace');
export const PRIVATE_DIR = path.join(BASE_DIR, 'data');
export const APPROVALS_FILE = path.join(PRIVATE_DIR, 'approvals.json');
export const TASKS_FILE = path.join(BASE_DIR, 'workspace', 'tasks.json');
export const SCHEDULES_FILE = path.join(BASE_DIR, 'workspace', 'schedules.json');
export const CREATOR_DRAFTS_FILE = path.join(BASE_DIR, 'workspace', 'creator_drafts.json');
export const WEB_PERMISSIONS_FILE = path.join(BASE_DIR, 'workspace', 'web_permissions.json');

export let tasks: any[] = [];
export let schedules: any[] = [];
export let pendingApprovals: any[] = [];
export let creatorDrafts: any[] = [];
export let webPermissions: { read_urls: string[]; execute_urls: { domain: string; status: 'allow' | 'deny' | 'once' }[] } = {
  read_urls: ['*'],
  execute_urls: []
};

export async function atomicWriteFile(filePath: string, content: string, mode = 0o600) {
  const tmp = filePath + '.tmp';
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(tmp, content, { mode });
    await fs.rename(tmp, filePath);
  } catch (err: any) {
    // Fallback if atomic chmod/rename fails inside some runtime environments
    await fs.writeFile(filePath, content);
  }
}

export async function saveTasks() {
  try {
    await atomicWriteFile(TASKS_FILE, JSON.stringify(tasks, null, 2));
  } catch (e) {
    Logger.log('ERROR', 'Failed to save tasks');
  }
}

export async function saveSchedules() {
  try {
    await atomicWriteFile(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
  } catch (e) {
    Logger.log('ERROR', 'Failed to save schedules');
  }
}

export async function saveApprovals() {
  try {
    await atomicWriteFile(APPROVALS_FILE, JSON.stringify(pendingApprovals, null, 2));
  } catch (e) {
    Logger.log('ERROR', 'Failed to save approvals');
  }
}

export async function saveCreatorDrafts() {
  try {
    await atomicWriteFile(CREATOR_DRAFTS_FILE, JSON.stringify(creatorDrafts, null, 2));
  } catch (e) {
    Logger.log('ERROR', 'Failed to save creator drafts');
  }
}

export async function saveWebPermissions() {
  try {
    await atomicWriteFile(WEB_PERMISSIONS_FILE, JSON.stringify(webPermissions, null, 2));
  } catch (e) {
    Logger.log('ERROR', 'Failed to save web permissions');
  }
}

export async function loadData() {
  try {
    const approvalsData = await fs.readFile(APPROVALS_FILE, 'utf-8');
    pendingApprovals = JSON.parse(approvalsData);
  } catch (e) {
    pendingApprovals = [];
  }

  try {
    const tasksData = await fs.readFile(TASKS_FILE, 'utf-8');
    tasks = JSON.parse(tasksData);
  } catch (e) {
    tasks = []; // Fallback to empty if not found
  }

  try {
    const schedulesData = await fs.readFile(SCHEDULES_FILE, 'utf-8');
    schedules = JSON.parse(schedulesData);
  } catch (e) {
    schedules = [];
  }

  try {
    const draftsData = await fs.readFile(CREATOR_DRAFTS_FILE, 'utf-8');
    creatorDrafts = JSON.parse(draftsData);
  } catch (e) {
    creatorDrafts = [];
  }

  try {
    const permData = await fs.readFile(WEB_PERMISSIONS_FILE, 'utf-8');
    webPermissions = JSON.parse(permData);
  } catch (e) {
    webPermissions = { read_urls: ['*'], execute_urls: [] };
  }
}

export async function getBrainConfig() {
  let envData: Record<string, string> = {};
  let isEnvFilled = false;
  try {
    let rawEnv = await fs.readFile(path.join(BASE_DIR, '.env'), 'utf-8');
    rawEnv = rawEnv.replace(/^\uFEFF/, ''); // Strip BOM
    rawEnv.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        envData[key] = value;
        if (value.length > 0 && key !== 'SOVEREIGN_PIN') {
          isEnvFilled = true;
        }
      }
    });
  } catch (e) {
    // Fallback if no .env
  }

  const getEnv = (key: string) => envData[key] || process.env[key] || '';
  
  // Deteksi mode CLI vs Web dari args yang dijalankan
  const isCli = process.argv[1] && (process.argv[1].endsWith('cli.ts') || process.argv[1].endsWith('cli.js'));
  const prefix = isCli ? 'CLI_' : 'WEB_';
  
  // Ambil env dengan prioritas: (CLI_ / WEB_) > GLOBAL
  const getPrefixedEnv = (key: string) => getEnv(`${prefix}${key}`) || getEnv(key) || '';

  const envKey = getPrefixedEnv('GEMINI_API_KEY');
  
  // Priority: process.env.API_KEY > process.env.GEMINI_API_KEY
  const storedApiKey = getPrefixedEnv('API_KEY') || envKey || '';
  const userName = getEnv('USER_NAME') || 'Ard';
  
  let provider = getPrefixedEnv('AI_PROVIDER') || (storedApiKey.startsWith('AIza') ? 'Google Gemini' : 'Generic AI');
  
  // High-fidelity active provider auto-detection override (respect Ollama if configured)
  const isOllama = provider.toLowerCase().includes('ollama');
  if (!isOllama) {
    const hasDeepSeekUrl = getPrefixedEnv('BASE_URL').toLowerCase().includes('deepseek');
    const hasDeepSeekModel = getPrefixedEnv('CUSTOM_MODEL').toLowerCase().startsWith('deepseek');
    if (hasDeepSeekUrl || hasDeepSeekModel) {
      provider = 'DeepSeek';
    } else if (provider === 'Generic AI' || !provider) {
      if (storedApiKey.startsWith('AIza') || storedApiKey.toUpperCase().includes('GEMINI')) {
        provider = 'Google Gemini';
      } else if (storedApiKey.startsWith('sk-ant')) {
        provider = 'Anthropic Claude';
      } else if (storedApiKey.startsWith('sk-')) {
        provider = 'OpenAI';
      }
    }
  }
  
  return {
    user_name: userName,
    api_key: storedApiKey,
    tavily_api_key: getEnv('TAVILY_API_KEY'),
    telegram_token: getEnv('TELEGRAM_TOKEN'),
    provider: provider,
    custom_model: getPrefixedEnv('CUSTOM_MODEL'),
    custom_model_instinct: getPrefixedEnv('CUSTOM_MODEL_INSTINCT'),
    base_url: getPrefixedEnv('BASE_URL'),
    image_provider: getEnv('IMAGE_PROVIDER') || 'imagen',
    banana_api_key: getEnv('BANANA_API_KEY'),
    user_avatar: getEnv('USER_AVATAR'),
    isActivated: (!!storedApiKey && storedApiKey.length > 5) || isEnvFilled
  };
}

export function setTasks(newTasks: any[]) { tasks = newTasks; }
export function setSchedules(newSchedules: any[]) { schedules = newSchedules; }
export function setApprovals(newApprovals: any[]) { pendingApprovals = newApprovals; }
export function setWebPermissions(newPerms: any) { webPermissions = newPerms; }
