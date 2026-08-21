import chalk from 'chalk';
import readline from 'readline';

export async function handleSwarmArgv(args: string[]): Promise<boolean> {
    if (args[0] !== 'swarm') return false;

    const subCommand = args[1];
    
    if (subCommand === 'report') {
        let missionId = args[2];
        if (!missionId) {
            const { getLatestMissionId } = await import('../../agentic/latest_mission.js');
            const latest = await getLatestMissionId();
            if (latest) {
                missionId = latest;
                console.log(chalk.cyan(`\n[AUTO] Memilih misi terakhir: ${missionId}`));
            } else {
                console.error(chalk.red('Error: Tidak ada misi yang ditemukan.'));
                process.exit(1);
            }
        }
        try {
            const { getBrainConfig } = await import('../../../shared/data.js');
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
        } catch (err: any) {
            console.error(chalk.red(`\n[WHITE UNIT ERROR] ${err.message}`));
        }
        process.exit(0);
    }

    if (subCommand === 'osint') {
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
            process.exit(1);
        }

        const targetValue = await question(chalk.magenta(`> Masukkan Target untuk ${targetType}: `));
        rlOsint.close();

        if (!targetValue) {
            console.log(chalk.yellow('Target tidak boleh kosong.'));
            process.exit(1);
        }

        try {
            const { getBrainConfig } = await import('../../../shared/data.js');
            const brain = await getBrainConfig();
            
            const { launchOsintMission } = await import('../../agentic/purple_unit.js');
            await launchOsintMission(targetType, targetValue, brain);
            
            console.log(chalk.dim(`\n💡 Tip: Jalankan 'ant swarm report' untuk merangkum temuan OSINT (WHITE Unit).`));
        } catch (err: any) {
            console.error(chalk.red(`\n[OSINT ERROR] ${err.message}`));
        }
        process.exit(0);
    }

    const goal = args[1];
    const target = args[2];
    if (!goal || !target) {
        console.error(chalk.red('Error: Format salah. Contoh: ant swarm "Investigasi kebocoran" "target.js"'));
        process.exit(1);
    }
    try {
        const { getBrainConfig } = await import('../../../shared/data.js');
        const brain = await getBrainConfig();
        
        if (!process.env.ANT_SWARM_MODEL && brain.custom_model) {
            process.env.ANT_SWARM_MODEL = brain.custom_model;
            console.log(chalk.green(`\n[AUTO-DETECT] Swarm Model disetel ke: ${brain.custom_model} (${brain.provider})`));
        } else if (!process.env.ANT_SWARM_MODEL) {
            console.log(chalk.green(`\n[AUTO-DETECT] Swarm Model fallback: qwen2.5:1.5b (${brain.provider})`));
        }

        const { launchSwarmAudit, renderSwarmReport } = await import('../../agentic/swarm_orchestrator.js');
        console.log(chalk.cyan(`Memulai Operasi Swarm 3-Zona untuk target: ${target}`));
        const result = await launchSwarmAudit(goal, [target], brain);
        renderSwarmReport(result);
    } catch (err: any) {
        console.error(chalk.red(`\n[SWARM ERROR] ${err.message}`));
    }
    process.exit(0);
}
