import { Logger } from '../../utils/logger.js';

export interface ReflectionResult {
    success: boolean;
    critique: string;
    shouldRetry: boolean;
    suggestedFix?: string;
}

export function reflectOnToolError(toolName: string, errorMsg: string, attemptsCount: number): ReflectionResult {
    Logger.log('WARN', `Reflection Loop: Analyzing failure for '${toolName}' (Attempt ${attemptsCount})...`, { errorMsg }, 'REFLECTION');

    if (errorMsg.includes('ENOENT') || errorMsg.includes('tidak ditemukan')) {
        return {
            success: false,
            critique: `File atau direktori target tidak ditemukan.`,
            shouldRetry: true,
            suggestedFix: `Gunakan 'list_dir' atau 'grep_search' untuk memeriksa path file yang benar sebelum mencoba lagi.`
        };
    }

    if (errorMsg.includes('EDIT_FAILED') || errorMsg.includes('targetContent was not found')) {
        return {
            success: false,
            critique: `targetContent tidak cocok persis dengan isi file.`,
            shouldRetry: true,
            suggestedFix: `Baca isi file dengan 'read_file' terlebih dahulu untuk menyalin substring yang presisi.`
        };
    }

    if (errorMsg.includes('APPROVAL_REQUIRED')) {
        return {
            success: false,
            critique: `Aksi membutuhkan persetujuan manual dari Ard.`,
            shouldRetry: false,
            suggestedFix: `Minta konfirmasi dari Ard sebelum melanjutkan.`
        };
    }

    if (attemptsCount >= 3) {
        return {
            success: false,
            critique: `Gagal 3 kali berturut-turut pada tool '${toolName}'.`,
            shouldRetry: false,
            suggestedFix: `Hentikan percobaan berulang dan laporkan hambatan teknis secara jujur.`
        };
    }

    return {
        success: false,
        critique: `Error tidak terduga pada tool '${toolName}'.`,
        shouldRetry: true,
        suggestedFix: `Coba dengan pendekatan alternatif atau argumen yang disesuaikan.`
    };
}
