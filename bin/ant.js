#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const child = spawn(
    process.execPath,
    [join(root, 'node_modules/.bin/tsx'), join(root, 'src/core/cli.ts'), ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env }
);
child.on('exit', code => process.exit(code ?? 0));
