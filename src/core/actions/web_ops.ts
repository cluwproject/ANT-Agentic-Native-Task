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

        // ── LAYER 1: AUTHORITY DOMAIN FILTER ─────────────────────────────────
        // ANT prioritizes authoritative technical sources over random blogs/opinions.
        // Tier 1 = Official docs & specs. Tier 2 = Reputable community & repos.
        const AUTHORITY_DOMAINS: Record<string, string[]> = {
            tier1: [
                'developer.mozilla.org', 'docs.python.org', 'nodejs.org/api',
                'kotlinlang.org', 'docs.oracle.com', 'learn.microsoft.com',
                'docs.github.com', 'pkg.go.dev', 'docs.rs',
                'reactjs.org', 'nextjs.org', 'vuejs.org', 'angular.io',
                'docs.docker.com', 'kubernetes.io/docs', 'docs.aws.amazon.com',
                'cloud.google.com/docs', 'docs.anthropic.com', 'platform.openai.com/docs',
            ],
            tier2: [
                'github.com', 'stackoverflow.com', 'npmjs.com',
                'pypi.org', 'crates.io', 'pkg.go.dev',
                'huggingface.co', 'arxiv.org', 'research.google',
            ],
        };

        // Detect query category to dynamically select relevant domains
        const q = (details.query || '').toLowerCase();
        const isCoding = /javascript|typescript|python|rust|go|node|npm|pip|docker|kubernetes|api|library|package|framework|error|exception|syntax/.test(q);
        const isAI = /model|llm|fine.?tun|lora|gguf|ollama|huggingface|transformers|pytorch|tensor/.test(q);

        let enrichedQuery = details.query;
        let domainHint = '';
        if (isCoding) {
            domainHint = AUTHORITY_DOMAINS.tier1.slice(0, 5).concat(AUTHORITY_DOMAINS.tier2.slice(0, 3)).join(' OR site:');
            enrichedQuery = `${details.query} site:${domainHint}`;
        } else if (isAI) {
            domainHint = 'huggingface.co OR site:arxiv.org OR site:github.com OR site:pytorch.org OR site:docs.anthropic.com';
            enrichedQuery = `${details.query} site:${domainHint}`;
        }
        // ─────────────────────────────────────────────────────────────────────

        const searchQuery = enrichedQuery || details.query;

        try {
            if (!config.tavily_api_key) throw new Error('Tavily API Key belum diset di pengaturan.');
            const results = await searchNews(config.tavily_api_key, searchQuery);

            // ── LAYER 2: SOURCE AUTHORITY RANKING ────────────────────────────
            // Tag each result with its authority tier so the model can prioritize.
            const allDomains = [...AUTHORITY_DOMAINS.tier1, ...AUTHORITY_DOMAINS.tier2];
            const ranked = (results || []).map((r: any) => {
                const url = (r.url || r.link || '').toLowerCase();
                const isTier1 = AUTHORITY_DOMAINS.tier1.some(d => url.includes(d));
                const isTier2 = AUTHORITY_DOMAINS.tier2.some(d => url.includes(d));
                return {
                    ...r,
                    authority_tier: isTier1 ? 1 : isTier2 ? 2 : 3,
                    authority_note: isTier1
                        ? '[OFFICIAL DOCS — High Trust]'
                        : isTier2
                        ? '[Community / Repo — Medium Trust]'
                        : '[Unknown Source — Verify Before Use]',
                };
            }).sort((a: any, b: any) => a.authority_tier - b.authority_tier);
            // ─────────────────────────────────────────────────────────────────

            return {
                status: 'success',
                results: ranked,
                ant_search_note: 'Results ranked by source authority. Trust Tier 1 (Official Docs) first. Cross-reference Tier 2/3 findings with Tier 1 before executing any code.',
            };
        } catch (e: any) {
            Logger.log('WARN', `Tavily Search Failed (${e.message}). Engaging Autonomous Fallback Bridge...`, {}, 'SYSTEM');
            
            try {
                const { fallbackWebSearch } = await import('../agent_loop/browserTool.js');
                const fallbackResult = await fallbackWebSearch(searchQuery);
                
                if (fallbackResult && !fallbackResult.fallback_error && fallbackResult.results && fallbackResult.results.length > 0) {
                    return {
                        status: 'success',
                        results: fallbackResult.results,
                        note: 'Results gathered via Autonomous Playwright Bridge (Tavily offline). Verify sources manually.',
                    };
                }
            } catch {}

            // ── LAYER 3: NATIVE ZERO-DEPENDENCY HTTP SEARCH (HN + WIKIPEDIA) ──
            const nativeResults = await nativeHttpSearchFallback(details.query || searchQuery);
            if (nativeResults.length > 0) {
                return {
                    status: 'success',
                    results: nativeResults,
                    note: 'Results gathered via Native HTTP Bridge (Hacker News & Wikipedia) as Tavily & Playwright were unavailable.',
                };
            }

            return {
                status: 'error',
                message: 'Semua mesin pencari (Tavily, Browser Bridge, Native HTTP) tidak dapat dihubungi saat ini.'
            };
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

async function nativeHttpSearchFallback(query: string): Promise<any[]> {
    const results: any[] = [];
    const cleanQuery = query.replace(/site:[^\s]+/g, '').replace(/OR/g, '').trim();

    // 1. Hacker News Algolia Search (Tech, AI, Models, Agentic CLI, Tools, Repos)
    try {
        const hnRes = await axios.get(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(cleanQuery)}&hitsPerPage=6`, {
            timeout: 6000,
            headers: { 'User-Agent': 'ANT-Native-Agent/1.0' }
        });
        if (hnRes.data && Array.isArray(hnRes.data.hits)) {
            for (const h of hnRes.data.hits) {
                if (!h.title) continue;
                results.push({
                    title: h.title,
                    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
                    content: `[HN Points: ${h.points || 0} | Date: ${(h.created_at || '').slice(0, 10)}] ${h.story_text || h.title}`,
                    source: 'Hacker News (Algolia)'
                });
            }
        }
    } catch (e: any) {
        Logger.log('WARN', `HN Search Fallback failed: ${e.message}`, {}, 'WEB_OPS');
    }

    // 2. Wikipedia Search (Concepts, Knowledge, Specs, Overview)
    try {
        const wikiRes = await axios.get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&utf8=&format=json`, {
            timeout: 6000,
            headers: { 'User-Agent': 'ANT-Native-Agent/1.0 (https://github.com/cluwproject/ANT-Agentic-Native-Task)' }
        });
        const wikiItems = wikiRes.data?.query?.search || [];
        for (const item of wikiItems.slice(0, 4)) {
            const cleanSnippet = (item.snippet || '').replace(/<[^>]+>/g, '');
            results.push({
                title: item.title,
                url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
                content: cleanSnippet,
                source: 'Wikipedia'
            });
        }
    } catch (e: any) {
        Logger.log('WARN', `Wikipedia Search Fallback failed: ${e.message}`, {}, 'WEB_OPS');
    }

    return results;
}
