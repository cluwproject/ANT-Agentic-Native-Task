# 🐜 ANT — Agentic Native Task

> **You Ask. ANT Acts.**  
> A Sovereign, Lightweight, Standalone Autonomous Agentic CLI built for Termux, Linux, and Cloud Environments.

---

## 🌟 Overview

**ANT (Agentic Native Task)** is a next-generation autonomous command-line agent derived and refactored from the CLUW Genesis architecture. It provides an intelligent, self-healing, agentic environment capable of understanding goals, generating multi-step execution plans, delegating to specialized sub-agents, performing tool execution, and auto-correcting code errors.

---

## ⚡ Key Features

- 🧠 **Sovereign AI Router**: Support for Google Gemini, Anthropic Claude, OpenAI, DeepSeek, and local Ollama models with automatic fallback & health tracking.
- 🛠️ **Autonomous Tool Execution**: High-trust file ops, precision patching, AST syntax checks, git management, and interactive terminal paste protection.
- 🤖 **Sub-Agent Delegation**: Spawn specialized child agents (`researcher`, `coder`, `tester`, `planner`) to solve complex sub-tasks.
- 📋 **HTN Planning & Reflection Loop**: Automatic goal decomposition into High-Level Task Networks and self-reflection on errors.
- 🔀 **Conversation Branching**: Save checkpoints and branch conversations (`/branch`) without losing context.
- 🛡️ **Self-Healing Kernel**: Built-in environment diagnostic, trust-score gate, and automatic error resolution.

---

## 🚀 Quick Start

### Installation

```bash
# Clone or navigate to the ant-cli directory
cd /root/ant-cli

# Install dependencies
npm install

# Perform typecheck & build production bundle
npm run typecheck
npm run build
```

### Usage

```bash
# Start interactive CLI mode
npm run ant
# or
node bin/ant.js

# One-shot command execution mode
node bin/ant.js -p "Inspect the src directory and report file structure"

# Show help menu
node bin/ant.js --help
```

---

## 📜 Available NPM Scripts

- `npm run ant` — Boot interactive ANT CLI.
- `npm run typecheck` — Perform strict TypeScript type checking (`tsc --noEmit`).
- `npm run build` — Compile TypeScript to `dist/` bundle with declarations and sourcemaps.
- `npm run clean` — Remove `dist/` directory.

---

## 📐 Project Architecture

```text
src/
├── core/
│   ├── actions/          # Modular action handlers (file, shell, web, skill, browser)
│   ├── ai/               # Multi-provider LLM router (Gemini, Claude, OpenAI, Ollama)
│   │   ├── providers/    # Provider-specific call implementations
│   │   └── tiers/        # SLM vs LLM tier routing
│   ├── agentic/          # Sub-agents, HTN planner, reflection loop, branching
│   ├── agent_loop/       # Core execution loop, UI loggers, permissions
│   └── workspace/        # Workspace state and Google Drive/Sheets integration
├── security/             # FS Guard, Trust score gate, Permissions
└── utils/                # Sovereign logger and prompt formatters
```

---

## 🤝 License

MIT License — Created by Ard (Renaldy Adri) for the ANT Sovereign Ecosystem.
