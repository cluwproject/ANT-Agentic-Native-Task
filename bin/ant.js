#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Resolusi lintas-platform: .bin/tsx adalah sh script (rusak di Windows CMD).
// Pakai entrypoint JS asli dari paket tsx, fallback ke .bin untuk lingkungan
// unix yang lama.
const require_ = createRequire(import.meta.url);
let tsxEntry = '';
try {
    tsxEntry = require_.resolve('tsx/cli.mjs');
} catch {
    const candidates = [
        join(root, 'node_modules/tsx/dist/cli.mjs'),
        join(root, 'node_modules/.bin/tsx')
    ];
    tsxEntry = candidates.find(p => existsSync(p)) || candidates[0];
}

const child = spawn(
    process.execPath,
    [tsxEntry, join(root, 'src/core/cli.ts'), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env }
);
child.on('exit', code => process.exit(code ?? 0));
