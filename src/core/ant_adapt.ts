import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger.js';

export interface EnvironmentInfo {
    platform: 'linux' | 'darwin' | 'win32' | 'unknown';
    isTermux: boolean;
    isProotUbuntu: boolean;
    isWSL: boolean;
    shell: string;
    pathSeparator: string;
    cpuCores: number;
    totalMemoryMB: number;
}

export interface OperatorProfile {
    isCreator: boolean;
    operatorName: string;
    preferredLanguage: string;
    isPublicRelease: boolean;
    authPinRequired: boolean;
}

const BASE_DIR = process.cwd();
const PROFILE_FILE = path.join(BASE_DIR, 'workspace', 'registry', 'operator_profile.json');

export async function detectEnvironment(): Promise<EnvironmentInfo> {
    const rawPlatform = os.platform();
    const platform = (rawPlatform === 'linux' || rawPlatform === 'darwin' || rawPlatform === 'win32') ? rawPlatform : 'unknown';
    
    const isTermux = !!(process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux'));
    const isProotUbuntu = await fs.stat('/root').then(() => true).catch(() => false) && isTermux;
    const isWSL = !!(process.env.WSL_DISTRO_NAME || process.env.IS_WSL);

    let defaultShell = 'bash';
    if (platform === 'win32') {
        defaultShell = process.env.COMSPEC || 'powershell.exe';
    } else if (platform === 'darwin') {
        defaultShell = process.env.SHELL || 'zsh';
    } else {
        defaultShell = process.env.SHELL || 'bash';
    }

    return {
        platform,
        isTermux,
        isProotUbuntu,
        isWSL,
        shell: defaultShell,
        pathSeparator: path.sep,
        cpuCores: os.cpus().length,
        totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024))
    };
}

export async function resolveOperatorProfile(): Promise<OperatorProfile> {
    const isPublicMode = process.env.ANT_PUBLIC_RELEASE === 'true';

    // Jika bukan public release mode, default selamanya ke pencipta (Ard)
    if (!isPublicMode) {
        return {
            isCreator: true,
            operatorName: 'Ard',
            preferredLanguage: 'id',
            isPublicRelease: false,
            authPinRequired: false
        };
    }

    // Untuk Public Release Mode
    try {
        const raw = await fs.readFile(PROFILE_FILE, 'utf-8');
        const profile = JSON.parse(raw);
        return {
            isCreator: false,
            operatorName: profile.operatorName || 'Operator',
            preferredLanguage: profile.preferredLanguage || 'en',
            isPublicRelease: true,
            authPinRequired: !!profile.authPinRequired
        };
    } catch {
        // Fallback detection jika profile.json belum ada di public mode
        const systemUser = os.userInfo().username || 'Operator';
        const cleanName = systemUser === 'root' || systemUser === 'rootlokal' ? 'Operator' : systemUser;
        
        return {
            isCreator: false,
            operatorName: cleanName,
            preferredLanguage: 'en',
            isPublicRelease: true,
            authPinRequired: true
        };
    }
}

export async function printAdaptNotice(): Promise<string> {
    const env = await detectEnvironment();
    const profile = await resolveOperatorProfile();

    Logger.log('INFO', `ANT Adapt Engine initialized. Platform: ${env.platform}, Operator: ${profile.operatorName} (Creator: ${profile.isCreator})`, {}, 'ADAPT');

    return `[ANT ADAPT] Environment: ${env.platform.toUpperCase()} (${env.cpuCores} cores, ${env.totalMemoryMB}MB RAM) | Operator: ${profile.operatorName}`;
}
