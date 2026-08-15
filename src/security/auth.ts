import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import { askUser } from '../core/agent_loop/index.js';
import { resolveOperatorProfile } from '../core/ant_adapt.js';

const BASE_DIR = process.cwd();
const PROFILE_FILE = path.join(BASE_DIR, 'workspace', 'registry', 'operator_profile.json');

function hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
}

export async function enforceAuthGate(): Promise<void> {
    const profile = await resolveOperatorProfile();

    if (!profile.isPublicRelease) {
        return; // No auth needed for Creator mode
    }

    let profileData: any = {};
    try {
        const raw = await fs.readFile(PROFILE_FILE, 'utf-8');
        profileData = JSON.parse(raw);
    } catch {
        // File doesn't exist yet, we will create it below
        await fs.mkdir(path.dirname(PROFILE_FILE), { recursive: true });
    }

    if (!profileData.pinHash) {
        // First time setup
        console.log(chalk.cyan('\n🛡️ [ANT SECURITY GATE] Welcome to ANT Public Release.'));
        console.log(chalk.dim('Let\'s set up your operator profile.'));
        
        let operatorName = await askUser(chalk.yellow('Enter your Operator Name (default: Operator): '));
        operatorName = operatorName.trim() || 'Operator';

        let pin1 = '', pin2 = '';
        while (true) {
            pin1 = await askUser(chalk.yellow('Set a secure 4-6 digit PIN: '));
            pin1 = pin1.trim();
            if (!/^\d{4,6}$/.test(pin1)) {
                console.log(chalk.red('  ❌ PIN must be 4 to 6 digits.'));
                continue;
            }
            pin2 = await askUser(chalk.yellow('Confirm your PIN: '));
            if (pin1 !== pin2.trim()) {
                console.log(chalk.red('  ❌ PINs do not match. Try again.'));
                continue;
            }
            break;
        }

        profileData = {
            operatorName,
            preferredLanguage: 'en',
            authPinRequired: true,
            pinHash: hashPin(pin1)
        };

        await fs.writeFile(PROFILE_FILE, JSON.stringify(profileData, null, 2), 'utf-8');
        console.log(chalk.green(`\n✅ Profile saved. Welcome aboard, ${operatorName}!\n`));
        return;
    }

    if (profileData.authPinRequired) {
        // Enforce PIN
        console.log(chalk.cyan('\n🛡️ [ANT SECURITY GATE] Authentication Required.'));
        let attempts = 3;

        while (attempts > 0) {
            const enteredPin = await askUser(chalk.yellow(`Enter PIN (${attempts} attempts left): `));
            if (hashPin(enteredPin.trim()) === profileData.pinHash) {
                console.log(chalk.green('\n✅ Access Granted.\n'));
                return;
            } else {
                attempts--;
                console.log(chalk.red('  ❌ Incorrect PIN.'));
            }
        }

        console.log(chalk.red.bold('\n[SECURITY LOCKOUT] Too many incorrect attempts. Exiting...'));
        process.exit(1);
    }
}
