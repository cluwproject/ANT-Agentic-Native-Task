#!/usr/bin/env node

/**
 * ANT OSINT SKILL: Cross-Platform Profiling
 * Description: Memindai ketersediaan username di berbagai platform tanpa otentikasi.
 * Usage: node cross_platform_scanner.js <username>
 */

const targetUser = process.argv[2];

if (!targetUser) {
    console.error("Usage: node cross_platform_scanner.js <username>");
    process.exit(1);
}

const platforms = [
    { name: 'GitHub', url: `https://github.com/${targetUser}` },
    { name: 'GitLab', url: `https://gitlab.com/${targetUser}` },
    { name: 'TikTok', url: `https://www.tiktok.com/@${targetUser}` },
    { name: 'Linktree', url: `https://linktr.ee/${targetUser}` }
];

console.log(`\n🔍 [OSINT] Memulai Cross-Platform Footprinting untuk target: @${targetUser}\n`);

async function checkPlatform(platform) {
    try {
        if (platform.name === 'GitHub') {
            const apiRes = await fetch(`https://api.github.com/users/${targetUser}`);
            if (apiRes.status === 200) {
                const data = await apiRes.json();
                console.log(`[+] DITEMUKAN   : ${platform.name} -> ${platform.url}`);
                console.log(`    ↳ Name    : ${data.name || 'N/A'}`);
                console.log(`    ↳ Bio     : ${data.bio || 'N/A'}`);
                console.log(`    ↳ Blog/Web: ${data.blog || 'N/A'}`);
                
                let email = data.email;
                if (!email) {
                    // Try to extract hidden email from recent public events/commits
                    const eventsRes = await fetch(`https://api.github.com/users/${targetUser}/events/public`);
                    if (eventsRes.status === 200) {
                        const events = await eventsRes.json();
                        const pushEvent = events.find(e => e.type === 'PushEvent' && e.payload && e.payload.commits && e.payload.commits.length > 0);
                        if (pushEvent) {
                            const commit = pushEvent.payload.commits.find(c => c.author && c.author.email && !c.author.email.includes('noreply.github.com'));
                            if (commit) {
                                email = `${commit.author.email} (Extracted from commit: ${commit.sha.substring(0,7)})`;
                            }
                        }
                    }
                }
                
                console.log(`    ↳ Email   : ${email || 'N/A (No public commits found to patch)'}`);
            } else {
                console.log(`[-] Tidak ada  : ${platform.name}`);
            }
            return;
        }

        const response = await fetch(platform.url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (response.status === 200) {
            console.log(`[+] DITEMUKAN   : ${platform.name} -> ${platform.url}`);
            console.log(`    ↳ [WARNING] Confidence LOW: Blind Username Match. Verifikasi silang diperlukan.`);
        } else {
            console.log(`[-] Tidak ada  : ${platform.name}`);
        }
    } catch (e) {
        console.log(`[!] Error      : ${platform.name} (${e.message})`);
    }
}

async function run() {
    const checks = platforms.map(p => checkPlatform(p));
    await Promise.all(checks);
    console.log(`\n⚠️  PERINGATAN IDENTITAS: Username yang sama tidak berarti orang yang sama.`);
    console.log(`✅  Pemindaian awal selesai. Rujuk ke playbook osint untuk mengekstraksi PGP, Image Hash, atau Email.`);
}

run();
