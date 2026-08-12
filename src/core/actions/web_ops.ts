import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { Logger } from '../../utils/logger.js';

const execAsync = promisify(exec);

export async function handleWebOps(action: string, details: any, workspaceDir: string, baseDir: string) {
    if (action === 'web_request') {
        const response = await axios({ url: details.url, method: details.method || 'GET', data: details.data });
        return { status: 'success', data: response.data };
    }

    if (action === 'fetch_url_content') {
        const response = await axios({ 
            url: details.url, 
            method: 'GET', 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 10000
        });
        let html = response.data;
        if (typeof html !== 'string') html = JSON.stringify(html);
        return { status: 'success', data: html.substring(0, 50000) };
    }

    if (action === 'web_search' || action === 'google_search') {
        const { searchNews } = await import('../ai.js');
        const { getBrainConfig } = await import('../../shared/data.js');
        const config = await getBrainConfig();
        
        try {
            if (!config.tavily_api_key) throw new Error('Tavily API Key belum diset di pengaturan.');
            const results = await searchNews(config.tavily_api_key, details.query);
            return { status: 'success', results };
        } catch (e: any) {
            Logger.log('WARN', `Tavily Search Failed (${e.message}). Engaging Autonomous Playwright Bridge...`, {}, 'SYSTEM');
            
            const { fallbackWebSearch } = await import('../agent_loop/browserTool.js');
            const fallbackResult = await fallbackWebSearch(details.query);
            
            if (fallbackResult.fallback_error) {
                if (fallbackResult.fallback_error === 'BOT_WALL_DETECTED') {
                     return { status: 'error', message: 'BOT_WALL_DETECTED: Pencarian ditahan oleh proteksi anti-bot. Gunakan tool "request_human_rescue" untuk meminta bantuan Ard.' };
                }
                return { status: 'error', message: 'Tavily offline & Fallback Bridge failed: ' + fallbackResult.fallback_error };
            }
            
            return { status: 'success', results: fallbackResult.results, note: 'Results gathered via Autonomous Playwright Bridge (Tavily offline)' };
        }
    }

    if (action === 'tiktok_osint') {
        const { url } = details;
        try {
            const { stdout } = await execAsync(`curl -s "https://www.tikwm.com/api/?url=${url}"`, { maxBuffer: 10 * 1024 * 1024 });
            
            let caption = '';
            let imageUrls: string[] = [];
            let author = '';
            
            try {
                const parsed = JSON.parse(stdout);
                if (parsed.code === 0 && parsed.data) {
                    caption = parsed.data.title || '';
                    author = parsed.data.author?.nickname || parsed.data.author?.unique_id || '';
                    if (parsed.data.images && parsed.data.images.length > 0) {
                        imageUrls = parsed.data.images;
                    } else if (parsed.data.cover) {
                        imageUrls = [parsed.data.cover];
                    }
                }
            } catch (e) {
                const { stdout: htmlOutput } = await execAsync(`curl -sL "${url}"`, { maxBuffer: 10 * 1024 * 1024 });
                const metaMatch = htmlOutput.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
                caption = metaMatch?.[1] || '';
            }

            return { 
                status: 'success', 
                caption: caption,
                author: author,
                total_slides: imageUrls.length,
                images: imageUrls,
                verification: caption ? 'Data successfully extracted via API' : 'TikTok anti-bot protection prevented full extraction.'
            };
        } catch (e: any) {
            return { status: 'error', error: e.message };
        }
    }

    if (action === 'kaggle_action') {
        const subAction = details.subAction || details.type || 'search';
        let cmd = 'kaggle ';
        if (subAction === 'search_datasets' || subAction === 'search') {
            cmd += `datasets list -s "${details.query || 'llm'}"`;
        } else if (subAction === 'download_dataset') {
            const targetDir = details.path ? path.resolve(workspaceDir, details.path) : path.resolve(workspaceDir, 'workspace', 'kaggle_data');
            await fs.mkdir(targetDir, { recursive: true });
            cmd += `datasets download -d "${details.dataset}" -p "${targetDir}" --unzip`;
        } else if (subAction === 'search_competitions') {
            cmd += `competitions list -s "${details.query || ''}"`;
        } else if (subAction === 'download_competition') {
            const targetDir = details.path ? path.resolve(workspaceDir, details.path) : path.resolve(workspaceDir, 'workspace', 'kaggle_data');
            await fs.mkdir(targetDir, { recursive: true });
            cmd += `competitions download -c "${details.competition}" -p "${targetDir}"`;
        } else if (subAction === 'submit_competition') {
            cmd += `competitions submit -c "${details.competition}" -f "${details.file}" -m "${details.message || 'Submission via ANT'}"`;
        } else {
            cmd += `${subAction}`;
        }
        const { stdout, stderr } = await execAsync(cmd, { timeout: 60000 });
        return { status: 'success', subAction, stdout, stderr };
    }

    if (action === 'outreach_verifier') {
        const { firstName, lastName, domain, company } = details;
        const fn = (firstName || 'lead').toLowerCase().trim();
        const ln = (lastName || '').toLowerCase().trim();
        const dom = (domain || company || 'example.com').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim();

        const patterns = [
            `${fn}@${dom}`,
            `${fn}.${ln}@${dom}`,
            `${fn[0]}${ln}@${dom}`,
            `${fn}_${ln}@${dom}`,
            `${ln}.${fn}@${dom}`
        ].filter(Boolean);

        return {
            status: 'success',
            company: company || dom,
            target: `${firstName || ''} ${lastName || ''}`.trim(),
            recommendedEmailPatterns: patterns,
            outreachSender: 'Adri Renaldy & ANT',
            strategy: 'Direct Strike - Sovereign Partnership'
        };
    }

    return null;
}
