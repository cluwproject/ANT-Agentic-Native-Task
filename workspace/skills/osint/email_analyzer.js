#!/usr/bin/env node

/**
 * ANT OSINT SKILL: Email Intelligence
 * Description: Menganalisis metadata email, Gravatar, dan DNS MX Records secara pasif.
 * Usage: node email_analyzer.js <email>
 */
import crypto from 'crypto';
import dns from 'dns/promises';

const targetEmail = process.argv[2];

if (!targetEmail || !targetEmail.includes('@')) {
    console.error("Usage: node email_analyzer.js <email_address>");
    process.exit(1);
}

const [localPart, domain] = targetEmail.split('@');
const normalizedEmail = targetEmail.trim().toLowerCase();
const emailHash = crypto.createHash('md5').update(normalizedEmail).digest('hex');

console.log(`\n📧 [OSINT] Memulai Email Intelligence untuk: ${targetEmail}`);
console.log(`---------------------------------------------------------`);
console.log(`[+] Local-Part (Pivot Username) : ${localPart}`);
console.log(`[+] Domain Server               : ${domain}`);
console.log(`[+] MD5 Hash                    : ${emailHash}`);
console.log(`---------------------------------------------------------`);

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

let exportData = {
    email: targetEmail,
    localPart: localPart,
    domain: domain,
    mxRecords: [],
    gravatar: {},
    associatedWebsites: []
};

async function checkMXRecords(domain) {
    console.log(`\n🔍 Mengecek Validitas Domain (MX Records)...`);
    try {
        const records = await dns.resolveMx(domain);
        if (records && records.length > 0) {
            console.log(`[+] DITEMUKAN: Domain aktif dan bisa menerima email.`);
            records.sort((a, b) => a.priority - b.priority).forEach(record => {
                console.log(`    ↳ Mail Server: ${record.exchange} (Priority: ${record.priority})`);
                exportData.mxRecords.push(record.exchange);
            });
        } else {
            console.log(`[-] PERINGATAN: Tidak ada Mail Server. Email ini mungkin palsu atau domain mati.`);
        }
    } catch (e) {
        console.log(`[-] ERROR: Gagal mengecek domain. Domain mungkin tidak terdaftar atau tidak valid. (${e.code})`);
    }
}

async function checkGravatar(hash) {
    console.log(`\n🖼️  Mencari Profil Tersembunyi di Gravatar...`);
    const gravatarUrl = `https://id.gravatar.com/${hash}.json`;
    
    try {
        const response = await fetch(gravatarUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        
        if (response.status === 200) {
            const data = await response.json();
            const profile = data.entry[0];
            
            console.log(`[+] PROFIL DITEMUKAN!`);
            console.log(`    ↳ Display Name : ${profile.displayName || 'N/A'}`);
            console.log(`    ↳ Real Name    : ${profile.name?.formatted || 'N/A'}`);
            console.log(`    ↳ Location     : ${profile.currentLocation || 'N/A'}`);
            console.log(`    ↳ Profile URL  : ${profile.profileUrl || 'N/A'}`);
            
            exportData.gravatar = {
                displayName: profile.displayName || '',
                profileUrl: profile.profileUrl || ''
            };
            
            if (profile.photos && profile.photos.length > 0) {
                console.log(`    ↳ Photo URL    : ${profile.photos[0].value}`);
                console.log(`       *(Gunakan foto ini untuk Reverse Image Search!)*`);
            }
            
            if (profile.accounts && profile.accounts.length > 0) {
                console.log(`    ↳ Connected Accounts:`);
                profile.accounts.forEach(acc => {
                    console.log(`       - ${acc.domain}: ${acc.url}`);
                    exportData.associatedWebsites.push(acc.domain);
                });
            }
        } else if (response.status === 404) {
            console.log(`[-] Tidak ditemukan profil Gravatar untuk email ini.`);
        } else {
            console.log(`[!] Gagal menghubungi Gravatar. Status: ${response.status}`);
        }
    } catch (e) {
        console.log(`[!] Error fetch Gravatar: ${e.message}`);
    }
}

async function runHolehe(email) {
    console.log(`\n🕸️  Memulai Deep Account Profiling (Holehe)...`);
    console.log(`   (Mengecek ke +120 website, mohon tunggu sekitar 15 detik)`);
    
    try {
        // Path to the local venv holehe
        const cmd = `/root/ant-cli/workspace/skills/osint/venv/bin/holehe ${email} --only-used`;
        const { stdout, stderr } = await execAsync(cmd);
        
        console.log(`\n[+] HASIL DEEP PROFILING (Email Terdaftar Di):`);
        const lines = stdout.split('\n');
        let foundAny = false;
        
        lines.forEach(line => {
            if (line.startsWith('[+]')) {
                const site = line.replace('[+]', '').trim();
                // Filter out the summary line
                if (!site.includes('Email used')) {
                    console.log(`    ↳ ${site}`);
                    exportData.associatedWebsites.push(site);
                    foundAny = true;
                }
            }
        });
        
        if (!foundAny) {
            console.log(`    [-] Tidak ada website tambahan yang ditemukan terhubung ke email ini.`);
        }
        
    } catch (e) {
        console.log(`[-] Error saat menjalankan Holehe: ${e.message}`);
        console.log(`   Pastikan Holehe sudah terinstall di workspace/skills/osint/venv/`);
    }
}

async function exportToCSV() {
    const csvPath = `/root/ant-cli/workspace/library/osint_results_${localPart}.csv`;
    
    // Deduplicate websites
    const uniqueSites = [...new Set(exportData.associatedWebsites)];
    
    let csvContent = "Target_Email,Gravatar_Name,MX_Records,Associated_Websites\n";
    csvContent += `"${exportData.email}","${exportData.gravatar.displayName || 'N/A'}","${exportData.mxRecords.join(' | ')}","${uniqueSites.join(' | ')}"\n`;
    
    await fs.writeFile(csvPath, csvContent);
    console.log(`\n💾 Ekspor Data Selesai! File disimpan di: ${csvPath}`);
}

async function run() {
    await checkMXRecords(domain);
    await checkGravatar(emailHash);
    await runHolehe(targetEmail);
    await exportToCSV();
    
    console.log(`\n✅ Pemindaian email pasif selesai.`);
    console.log(`💡 NEXT STEP: Gunakan data situs yang terdaftar (terutama sosmed) untuk dicari username-nya menggunakan cross_platform_scanner.js`);
}

run();
