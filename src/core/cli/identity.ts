import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';

export interface AntIdentity {
    creator: string;
    origin: string;
    activeUser: string;
    collaborators: string;
}

export function readAntIdentity(): AntIdentity {
    try {
        const owner = process.env.USER_NAME || 'Unknown Operator';
        return {
            creator: 'Ard',
            origin: 'CLUW Genesis',
            activeUser: owner,
            collaborators: 'Agy, Gemma, Claude, DeepSeek, Ollama'
        };
    } catch {
        return {
            creator: 'Ard',
            origin: 'CLUW Genesis',
            activeUser: 'Unknown Operator',
            collaborators: 'Agy, Gemma, Claude, DeepSeek, Ollama'
        };
    }
}

export function getPackageVersion(): string {
    try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.version) return `v${pkg.version}`;
        }
    } catch {}
    return 'v0.3.0';
}

export function getAntAscii(): string {
    const identity = readAntIdentity();
    const version = getPackageVersion();
    return chalk.green(`
  ANT -- Agentic Native Task
  You Ask. ANT Acts.

  >  Version     : ${version}
  >  Origin      : ${identity.origin} (Built by ${identity.creator})
  >  Companion   : ${identity.activeUser}
  >  Engine      : ANT Sovereign Runtime
`);
}

export async function ensureIdentity(activeEnvPath: string): Promise<void> {
    if (!process.env.USER_NAME) {
        console.log(chalk.cyan('\n[ANT INITIALIZATION]'));
        console.log(chalk.yellow('Identity not set. Who is operating this system?'));
        
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            rl.question(chalk.green('Enter your name: '), (name) => {
                rl.close();
                if (name && name.trim()) {
                    process.env.USER_NAME = name.trim();
                    fs.appendFileSync(activeEnvPath, `\nUSER_NAME="${name.trim()}"\n`);
                    console.log(chalk.green(`\n[OK] Identity saved as: ${name.trim()}\n`));
                    resolve();
                } else {
                    console.error(chalk.red('Identity is required to operate ANT.'));
                    process.exit(1);
                }
            });
        });
    }
}
