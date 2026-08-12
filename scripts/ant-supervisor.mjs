import { spawn } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const commandArgs = process.argv.slice(2);
if (commandArgs.length === 0) {
    console.error("Usage: node scripts/ant-supervisor.mjs <command>");
    process.exit(1);
}

// If invoked as `npx tsx watch ...`, npx wrapper exits after spawning
// the real child — which then loses its parent watcher. Rewrite to invoke
// tsx's CLI entry directly so the watch subprocess stays alive.
if (commandArgs[0] === 'npx' && commandArgs.includes('tsx') && commandArgs.includes('watch')) {
    const tsxCli = path.join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(tsxCli)) {
        commandArgs.shift(); // drop 'npx'
        const tsxIdx = commandArgs.indexOf('tsx');
        if (tsxIdx >= 0) commandArgs.splice(tsxIdx, 1);
        commandArgs.unshift(tsxCli);
        commandArgs.unshift(process.execPath); // 'node'
        console.log('\x1b[36m[ANT SUPERVISOR] Detected `npx tsx watch` — invoking tsx CLI directly to keep watcher alive.\x1b[0m');
    }
}

const API_KEY = process.env.API_KEY || '';
const PROVIDER = (process.env.AI_PROVIDER || 'Gemini').toLowerCase();
const BASE_URL = process.env.BASE_URL || '';
const MODEL = process.env.CUSTOM_MODEL || '';

async function askAIToHeal(errorLog) {
    console.log('\n\x1b[33m[ANT SUPERVISOR] 🧠 Crash detected! Consulting AI Healer...\x1b[0m');
    try {
        const prompt = `ANT CLI crashed on boot. You are the autonomous supervisor (Self-Healer) written in Node.js.
Here is the raw error log from stderr:

\`\`\`
${errorLog}
\`\`\`

Analyze the error. 
- If it is a missing npm package (e.g., Cannot find module 'lucide-react'), output exactly a JSON block like: {"tool": "shell_exec", "command": "npm install <package>"}
- If it is a TypeScript syntax error (Invalid character, TS1127, etc) or missing type, output exactly: {"tool": "edit_file", "file": "<path_to_file>", "targetContent": "<exact wrong code>", "replacementContent": "<fixed code>"}

Output ONLY valid JSON. No markdown, no explanation. Just the raw JSON block that can be parsed with JSON.parse().`;

        let text = "";
        
        if (PROVIDER === 'ollama' || PROVIDER === 'openai' || PROVIDER === 'deepseek') {
            const endpoint = BASE_URL ? `${BASE_URL.replace(/\/$/, '')}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
            const headers = { 'Content-Type': 'application/json' };
            if (API_KEY && API_KEY !== 'ollama') headers['Authorization'] = `Bearer ${API_KEY}`;
            
            const res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: MODEL || (PROVIDER === 'openai' ? 'gpt-4o' : 'llama3'),
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (data.choices && data.choices[0]) text = data.choices[0].message.content;
            else throw new Error(JSON.stringify(data));
            
        } else if (PROVIDER === 'anthropic' || PROVIDER === 'claude') {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': API_KEY,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: MODEL || 'claude-3-haiku-20240307',
                    max_tokens: 1000,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (data.content && data.content[0]) text = data.content[0].text;
            else throw new Error(JSON.stringify(data));
            
        } else {
            // Default to Gemini
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL || 'gemini-2.5-flash'}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            if (data.candidates && data.candidates[0]) text = data.candidates[0].content.parts[0].text;
            else throw new Error(JSON.stringify(data));
        }
        
        // Bersihkan markdown backticks jika AI bandel
        if (text.includes('\`\`\`')) {
            text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '');
        }
        
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        }
    } catch (e) {
        console.error('\x1b[31m[ANT SUPERVISOR] AI Healing failed:\x1b[0m ' + e.message);
    }
    return null;
}

let activeChild = null;

function startProcess() {
    console.log(`\x1b[36m[ANT SUPERVISOR] Starting System: ${commandArgs.join(' ')}\x1b[0m`);
    
    // Support cross-platform spawning
    const isWin = process.platform === 'win32';
    const cmd = isWin && commandArgs[0] === 'npx' ? 'npx.cmd' : commandArgs[0];
    
    activeChild = spawn(cmd, commandArgs.slice(1), { 
        stdio: ['inherit', 'inherit', 'pipe'], 
        env: { ...process.env, FORCE_COLOR: '1' }
    });
    
    let errorLog = '';

    activeChild.on('error', (err) => {
        console.error(`\n\x1b[31m[ANT SUPERVISOR] Spawn Error: ${err.message}\x1b[0m`);
    });

    activeChild.stderr.on('data', (data) => {
        process.stderr.write(data);
        errorLog += data.toString();
    });

    activeChild.on('close', async (code) => {
        if (code !== 0 && code !== null) {
            console.log(`\n\x1b[31m[ANT SUPERVISOR] Process crashed with exit code ${code}.\x1b[0m`);
            if (API_KEY && errorLog.trim().length > 0) {
                const action = await askAIToHeal(errorLog.substring(0, 5000)); // Limit to 5k chars
                if (action) {
                    console.log(`\x1b[32m[ANT SUPERVISOR] Auto-Heal Action suggested:\x1b[0m`, action);
                    
                    if (action.tool === 'shell_exec' && action.command) {
                        const { execSync } = await import('child_process');
                        console.log(`\x1b[33m[ANT SUPERVISOR] Executing: ${action.command}\x1b[0m`);
                        try {
                            execSync(action.command, { stdio: 'inherit' });
                            console.log(`\x1b[32m[ANT SUPERVISOR] Healing applied. Restarting engine...\x1b[0m\n`);
                            setTimeout(startProcess, 1000);
                        } catch (e) {
                            console.error(`\x1b[31m[ANT SUPERVISOR] Healing command failed.\x1b[0m`);
                            process.exit(1);
                        }
                    } else if (action.tool === 'edit_file' && action.file) {
                         try {
                             let content = fs.readFileSync(action.file, 'utf-8');
                             if (content.includes(action.targetContent)) {
                                 content = content.replace(action.targetContent, action.replacementContent);
                                 fs.writeFileSync(action.file, content);
                                 console.log(`\x1b[32m[ANT SUPERVISOR] File ${action.file} patched successfully. Restarting engine...\x1b[0m\n`);
                                 setTimeout(startProcess, 1000);
                             } else {
                                 console.error(`\x1b[31m[ANT SUPERVISOR] Patch failed: targetContent not found in ${action.file}.\x1b[0m`);
                                 process.exit(1);
                             }
                         } catch(e) {
                             console.error(`\x1b[31m[ANT SUPERVISOR] File patch exception: \x1b[0m` + e.message);
                             process.exit(1);
                         }
                    } else {
                        process.exit(code);
                    }
                } else {
                    process.exit(code);
                }
            } else {
                process.exit(code);
            }
        } else {
            console.log(`\x1b[32m[ANT SUPERVISOR] Process exited cleanly.\x1b[0m`);
            process.exit(0);
        }
    });
}

const handleExit = () => {
    console.log('\n\x1b[33m[ANT SUPERVISOR] Interrupted by user (Ctrl+C). Shutting down gracefully...\x1b[0m');
    if (activeChild && activeChild.pid) {
        try {
            activeChild.kill('SIGTERM');
            setTimeout(() => activeChild.kill('SIGKILL'), 3000);
        } catch (e) {}
    }
    setTimeout(() => process.exit(0), 500);
};

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);

startProcess();
