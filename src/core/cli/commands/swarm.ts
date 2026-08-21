import chalk from 'chalk';
import readline from 'readline';
import type { CliContext } from '../types.js';
import { getBrainConfig } from '../../../shared/data.js';

export async function handleSwarmCommands(text: string, ctx: CliContext): Promise<boolean> {
    // ── /swarm ────────────────────────────────────────────────────────
    if (text.startsWith('/swarm')) {
        const parts = text.split(' ');
        const goal = parts.slice(1, -1).join(' ') || 'Audit keamanan dan integritas target';
        const target = parts[parts.length - 1] || 'workspace';

        try {
            const brain = await getBrainConfig();
            if (!process.env.ANT_SWARM_MODEL && brain.custom_model) {
                process.env.ANT_SWARM_MODEL = brain.custom_model;
            }

            const { launchSwarmAudit, renderSwarmReport } = await import('../../agentic/swarm_orchestrator.js');
            console.log(chalk.cyan(`\nMemulai Operasi Swarm 3-Zona untuk target: ${target}`));
            const result = await launchSwarmAudit(goal, [target], brain);
            renderSwarmReport(result);
        } catch (e: any) {
            console.log(chalk.red(`  Swarm Audit Error: ${e.message}`));
        }
        return true;
    }

    // ── /report ───────────────────────────────────────────────────────
    if (text.startsWith('/report')) {
        let missionId = text.replace(/^\/report\s*/, '').trim();
        if (!missionId) {
            const { getLatestMissionId } = await import('../../agentic/latest_mission.js');
            const latest = await getLatestMissionId();
            if (latest) {
                missionId = latest;
                console.log(chalk.cyan(`  [AUTO] Memilih misi terakhir: ${missionId}`));
            } else {
                console.log(chalk.yellow('  Tidak ada misi yang ditemukan. Gunakan: /report <mission_id>'));
                return true;
            }
        }
        try {
            const brain = await getBrainConfig();
            if (!process.env.ANT_SWARM_MODEL && brain.custom_model) process.env.ANT_SWARM_MODEL = brain.custom_model;
            
            const { launchWhiteUnitReport } = await import('../../agentic/white_unit.js');
            const reportData = await launchWhiteUnitReport(missionId, brain);
            
            if (reportData) {
                console.log(chalk.cyan(`\n🔗 Artifact Link: file://${reportData.path}`));
                console.log(chalk.dim('\n' + '═'.repeat(80)));
                console.log(chalk.white(reportData.content));
                console.log(chalk.dim('═'.repeat(80) + '\n'));
            }
        } catch (e: any) {
            console.log(chalk.red(`  Report Error: ${e.message}`));
        }
        return true;
    }

    // ── /osint ────────────────────────────────────────────────────────
    if (text.startsWith('/osint')) {
        const rlOsint = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log(chalk.magenta('\n[OSINT SWARM] Pilih Dimensi Target:'));
        console.log(chalk.dim('1. 👤 Identity & Personnel (Email, Usernames, Phones)'));
        console.log(chalk.dim('2. 🌍 Network & Infra (Domains, IP, Cloud assets)'));
        console.log(chalk.dim('3. 👁️ Digital Forensics (Images, PDFs, Metadata)'));
        console.log(chalk.dim('4. 💰 Blockchain & Crypto (Wallets, TXs)'));
        console.log(chalk.dim('5. 🕸️ Threat Intel (Deep Web Mentions, Malware Hashes)'));
        
        const question = (query: string): Promise<string> => new Promise(res => rlOsint.question(query, res));
        
        const choice = await question(chalk.magenta('> Pilihan Anda (1-5): '));
        
        let targetType = 'Unknown';
        if (choice === '1') targetType = 'Identity (Email/Username)';
        else if (choice === '2') targetType = 'Network (Domain/IP)';
        else if (choice === '3') targetType = 'Forensics (Image/Metadata)';
        else if (choice === '4') targetType = 'Blockchain (Wallet/Crypto)';
        else if (choice === '5') targetType = 'Threat Intel (Deep Web / Malware)';
        else {
            console.log(chalk.red('Pilihan tidak valid.'));
            rlOsint.close();
            return true;
        }

        const targetValue = await question(chalk.magenta(`> Masukkan Target untuk ${targetType}: `));
        rlOsint.close();

        if (!targetValue) {
            console.log(chalk.yellow('Target tidak boleh kosong.'));
            return true;
        }

        try {
            const brain = await getBrainConfig();
            const { launchOsintMission } = await import('../../agentic/purple_unit.js');
            await launchOsintMission(targetType, targetValue, brain);
            console.log(chalk.dim(`\n💡 Tip: Ketik '/report' untuk merangkum temuan OSINT (WHITE Unit).`));
        } catch (e: any) {
            console.log(chalk.red(`  OSINT Error: ${e.message}`));
        }
        return true;
    }

    return false;
}
