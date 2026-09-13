#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

// Deteksi nama command: antcode → runtime CLI, ant → full CLI
// process.argv[1] bisa berupa symlink (antcode.js) atau nama langsung (antcode)
const rawName = basename(process.argv[1] || 'ant');
const commandName = rawName.replace(/\.js$/, '');
const isAntCode = commandName === 'antcode';

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

// Pilih entrypoint berdasarkan nama command
const entrypoint = isAntCode
    ? join(root, 'src/runtime/cli.ts')
    : join(root, 'src/core/cli.ts');

const child = spawn(
    process.execPath,
    [tsxEntry, entrypoint, ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env }
);
child.on('exit', code => process.exit(code ?? 0));
