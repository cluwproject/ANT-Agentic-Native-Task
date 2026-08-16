/**
 * ════════════════════════════════════════════════════════════════════
 * ANT — MODEL DISCOVERY & SELECTION ENGINE
 * ════════════════════════════════════════════════════════════════════
 * Automatically discovers active local & cloud Ollama models, parses
 * environment configuration, and renders an interactive, clean model
 * selection interface matching modern agentic CLI standards.
 * ════════════════════════════════════════════════════════════════════
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export interface ModelEntry {
    name: string;
    description: string;
    isCurrent?: boolean;
    isDefault?: boolean;
    badge?: string;
    size?: string;
}

/**
 * Heuristic model description generator based on model family & architecture
 */
export function getModelDescription(modelName: string): { description: string; badge?: string } {
    const m = modelName.toLowerCase();

    if (m.includes('minicpm') || m.includes('vision') || m.includes('llava')) {
        return {
            description: 'Local multimodal vision model for visual grounding & inspection.',
            badge: 'local Vision'
        };
    }
    if (m.includes('nomic-embed') || m.includes('embed') || m.includes('bge-')) {
        return {
            description: '768-dim vector embedding engine for neural cognitive memory.',
            badge: 'Embedding'
        };
    }
    if (m.includes('0.5b') || m.includes('1b') || m.includes('1.5b') || m.includes('ant:1b') || m.includes('tiny')) {
        return {
            description: 'Native ultra-low latency on-device SLM for swarm security & offline tasks.',
            badge: 'local SLM'
        };
    }
    if (m.includes('kimi') || m.includes('coder') || m.includes('code') || m.includes('starcoder')) {
        return {
            description: 'Specialized code generation, debugging, and deep refactoring model.',
            badge: 'Code Expert'
        };
    }
    if (m.includes('120b') || m.includes('70b') || m.includes('gpt-oss') || m.includes('pro:cloud') || m.includes('frontier')) {
        return {
            description: 'Heavyweight frontier reasoner for complex planning & architecture.',
            badge: 'Frontier'
        };
    }
    if (m.includes('deepseek-v4-flash') || (m.includes('deepseek') && m.includes('flash'))) {
        return {
            description: 'Fast cloud reasoning engine for general agentic tasks.',
            badge: 'Cloud Fast'
        };
    }
    if (m.includes('minimax') || m.includes('m2.5') || m.includes('m2.7')) {
        return {
            description: 'Large-context frontier model for extended workflows and long context.',
            badge: 'Long Context'
        };
    }
    if (m.includes('nemotron') || m.includes('nemo')) {
        return {
            description: 'Frontier reasoning model for structured agentic workflows and coding.',
            badge: 'Cloud Frontier'
        };
    }
    if (m.includes('gemma') || m.includes('31b') || m.includes('27b')) {
        return {
            description: 'Balanced agentic coding model for everyday work & high precision.',
            badge: 'Balanced'
        };
    }
    if (m.includes('gemini-2.0-flash') || m.includes('gemini-1.5')) {
        return {
            description: 'Ultra-fast multimodal reasoning engine with broad world knowledge.',
            badge: 'Cloud'
        };
    }
    if (m.includes('claude-sonnet') || m.includes('claude-opus')) {
        return {
            description: 'State-of-the-art agentic reasoner for autonomous development.',
            badge: 'Cloud'
        };
    }

    return {
        description: 'Agentic AI model for reasoning, planning, and task execution.',
        badge: undefined
    };
}

/**
 * Fetch all installed models directly from local/remote Ollama instance
 */
export async function fetchOllamaModels(baseUrl?: string): Promise<Array<{ name: string; size?: string }>> {
    const rawUrl = baseUrl || process.env.BASE_URL || process.env.AI_BASE_URL || 'http://localhost:11434';
    const cleanUrl = rawUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`${cleanUrl}/api/tags`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) return [];
        const data = await res.json();
        if (data && Array.isArray(data.models)) {
            return data.models.map((m: any) => {
                let sizeStr: string | undefined;
                if (m.size) {
                    const mb = m.size / (1024 * 1024);
                    sizeStr = mb > 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
                }
                return {
                    name: m.name || m.model,
                    size: sizeStr
                };
            }).filter((m: any) => !!m.name);
        }
    } catch {
        // Ollama offline or unreachable
    }
    return [];
}

/**
 * Collect all candidate models from Ollama + .env + Built-in defaults
 */
export async function getDiscoverableModels(
    currentModel: string,
    defaultModel: string,
    envContent: string
): Promise<ModelEntry[]> {
    const modelMap = new Map<string, { size?: string }>();

    // 1. Discover from Ollama live API
    const ollamaModels = await fetchOllamaModels();
    for (const om of ollamaModels) {
        modelMap.set(om.name, { size: om.size });
    }

    // 2. Parse from .env content
    const modelRegex = /(?:AI_MODEL|CUSTOM_MODEL|CLI_CUSTOM_MODEL|ANT_SWARM_MODEL|ANT_GRAY_[0-9]_MODEL)[A-Z_]*=([^\n\r#]+)/g;
    let match;
    while ((match = modelRegex.exec(envContent)) !== null) {
        const cleaned = match[1]?.trim();
        if (cleaned && !cleaned.includes('<') && !cleaned.includes('your_') && !modelMap.has(cleaned)) {
            modelMap.set(cleaned, {});
        }
    }

    // 3. Fallback defaults if list is still empty
    if (modelMap.size === 0) {
        const defaults = [
            'gemma4:31b-cloud',
            'gpt-oss:120b-cloud',
            'nemotron-3-super:cloud',
            'deepseek-v4-flash:cloud',
            'kimi-k2.7-code:cloud',
            'qwen2.5:0.5b',
            'minicpm-v4.6:latest'
        ];
        defaults.forEach(d => modelMap.set(d, {}));
    }

    // Ensure currentModel is always in the list
    if (currentModel && !modelMap.has(currentModel)) {
        modelMap.set(currentModel, {});
    }

    const result: ModelEntry[] = [];
    for (const [name, meta] of modelMap.entries()) {
        const info = getModelDescription(name);
        result.push({
            name,
            description: info.description,
            badge: info.badge,
            size: meta.size,
            isCurrent: name.toLowerCase() === currentModel.toLowerCase(),
            isDefault: name.toLowerCase() === defaultModel.toLowerCase()
        });
    }

    // Sort: Current model first, then default, then prioritize gemma4, gpt-oss, nemotron, cloud models
    result.sort((a, b) => {
        if (a.isCurrent) return -1;
        if (b.isCurrent) return 1;
        if (a.isDefault) return -1;
        if (b.isDefault) return 1;
        const priority = (name: string) => {
            const n = name.toLowerCase();
            if (n.includes('gemma4') && n.includes('cloud')) return 0;
            if (n.includes('gpt-oss') && n.includes('cloud')) return 1;
            if (n.includes('nemotron') && n.includes('cloud')) return 2;
            if (n.includes('cloud')) return 3;
            if (n.includes('0.5b') || n.includes('1b')) return 4;
            return 5;
        };
        const priorityDiff = priority(a.name) - priority(b.name);
        return priorityDiff !== 0 ? priorityDiff : a.name.localeCompare(b.name);
    });

    return result;
}

/**
 * Render formatted model selector header & options matching user specification
 */
export function renderModelSelectorHeader(): void {
    console.log(chalk.bold.white('\n  Select Model and Effort'));
    console.log(chalk.dim('  Access legacy or custom models by running /model <model_name> or in your .env\n'));
}

export function formatModelEntryLine(entry: ModelEntry, index: number, maxNameWidth: number = 32): string {
    const numPrefix = `${index + 1}.`.padEnd(4);
    const pointer = entry.isCurrent ? chalk.cyan.bold('› ') : '  ';

    let tag = '';
    if (entry.isCurrent) {
        tag = chalk.cyan('(current)');
    } else if (entry.isDefault) {
        tag = chalk.green('(default)');
    } else if (entry.badge) {
        tag = chalk.dim(`(${entry.badge})`);
    }

    const nameCol = `${chalk.bold.white(entry.name)} ${tag}`.trimEnd();
    // Raw length without ANSI codes for proper column alignment
    const rawNameLen = entry.name.length + (entry.isCurrent ? 10 : entry.isDefault ? 10 : entry.badge ? entry.badge.length + 3 : 0);
    const padding = Math.max(2, maxNameWidth - rawNameLen);

    const descText = chalk.dim(entry.description);
    return `${pointer}${chalk.dim(numPrefix)}${nameCol}${' '.repeat(padding)}${descText}`;
}
