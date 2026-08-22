import { runScaffoldCommand } from '../commands/scaffold.js';

export async function handleScaffoldArgv(args: string[]): Promise<boolean> {
    if (args[0] === 'scaffold') {
        const profileId = args[1];
        const targetDir = args[2];
        
        if (!profileId || !targetDir) {
            console.error('Penggunaan: ant scaffold <profileId> <targetDir>');
            console.error('Contoh: ant scaffold next-prisma ./my-app');
            process.exit(1);
        }

        await runScaffoldCommand(profileId, targetDir);
        return true;
    }
    return false;
}
