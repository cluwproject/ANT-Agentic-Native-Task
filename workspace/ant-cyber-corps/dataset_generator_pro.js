/**
 * ════════════════════════════════════════════════════════════════════
 * ANT-CYBER-CORPS — PROFESSIONAL DATASET GENERATOR PRO (OLLAMA MODE)
 * ════════════════════════════════════════════════════════════════════
 * High‑scale SFT dataset generator that works with a local Ollama server.
 * It no longer requires an external API key – it calls the Ollama
 * HTTP API (http://localhost:11434) directly.
 * ════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
    // Ollama endpoint – biasanya http://localhost:11434
    OLLAMA_ENDPOINT: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
    // Model yang akan dipakai. Ard menyebut dua model, pilih salah satu.
    // Prioritas: gpt-oss:120b-cloud, fallback ke nemotron-3-super:cloud
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'gpt-oss:120b-cloud',
    BASE_DIR: path.resolve(process.cwd(), 'datasets'),
    UNITS: ['gray-1', 'gray-2', 'gray-3', 'gray-4', 'gray-5'],
    BATCH_SIZE: 10
};

class DatasetGenerator {
    constructor() {
        this.setupDirectories();
    }

    setupDirectories() {
        if (!fs.existsSync(CONFIG.BASE_DIR)) {
            fs.mkdirSync(CONFIG.BASE_DIR, { recursive: true });
        }
        CONFIG.UNITS.forEach(unit => {
            const unitDir = path.join(CONFIG.BASE_DIR, unit);
            if (!fs.existsSync(unitDir)) {
                fs.mkdirSync(unitDir, { recursive: true });
            }
        });
    }

    /**
     * Call Ollama model with a prompt and return the raw response string.
     */
    async callOllamaModel(prompt) {
        try {
            const response = await axios.post(
                `${CONFIG.OLLAMA_ENDPOINT}/api/generate`,
                {
                    model: CONFIG.OLLAMA_MODEL,
                    prompt: prompt,
                    max_tokens: 1500,
                    stream: false
                },
                { headers: { 'Content-Type': 'application/json' } }
            );
            // Ollama returns { response: '...', done: true, ... }
            return response.data.response;
        } catch (err) {
            console.error('❌ Ollama API error:', err.message);
            return null;
        }
    }

    /**
     * Generate a number of samples for a given unit using a prompt template.
     */
    async generateForUnit(unitId, promptTemplate, count = 1) {
        console.log(`🚀 Generating ${count} samples for ${unitId.toUpperCase()} using Ollama model ${CONFIG.OLLAMA_MODEL}`);
        const targetFile = path.join(CONFIG.BASE_DIR, unitId, 'train.jsonl');
        let success = 0;
        for (let i = 0; i < count; i++) {
            const finalPrompt = promptTemplate.replace(/{{index}}/g, i + 1);
            const raw = await this.callOllamaModel(finalPrompt);
            if (!raw) {
                console.warn(`⚠️ No response for sample ${i + 1}, skipping.`);
                continue;
            }
            try {
                const json = JSON.parse(raw);
                fs.appendFileSync(targetFile, JSON.stringify(json) + '\n', 'utf8');
                success++;
                console.log(`✅ ${unitId} sample ${i + 1}/${count} saved`);
            } catch (e) {
                console.warn(`⚠️ Invalid JSON from Ollama for sample ${i + 1}.`);
            }
            // gentle pause
            await new Promise(r => setTimeout(r, 500));
        }
        console.log(`🎯 Finished ${unitId}: ${success}/${count} samples stored.`);
    }
}

const generator = new DatasetGenerator();
export default generator;
