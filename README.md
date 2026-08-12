# 🐜 ANT — Agentic Native Task (v0.1.0)

> **You Ask. ANT Acts.**  
> A Sovereign, Standalone, On-Device Autonomous Agentic CLI with Inter-Model Mailbox Audit, OS Auto-Adaptation, and High-Trust Security.

---

## 🌟 Overview

**ANT (Agentic Native Task)** is a next-generation autonomous command-line agent derived and evolved from the CLUW Genesis architecture. Built for high performance on local devices (Android Termux, Linux, macOS, and Windows), ANT operates with complete sovereignty, dynamic context continuity, cross-model relay auditing, and self-healing resilience.

---

## ⚡ Key Features & Innovations

### 1. 📬 `AntModelMailbox` (Inter-Model Relay & Audit System)
- **Context Continuity Across Models**: When switching models (e.g. from `gemma4:31b-cloud` to `deepseek-r1`), the departing agent writes a structured handover briefing into `workspace/registry/mailbox/ledger.jsonl`.
- **SHA-256 Hash-Chained Ledger**: Append-only, tamper-evident audit ledger (`entryHash` + `prevHash`) to verify chain integrity.
- **Claim Verifier**: State machine verifying model claims against real execution evidence (`VERIFIED`, `UNVERIFIED`, `CONTRADICTED`, `NEEDS_INDEPENDENT_CHECK`).
- **Circuit Breaker & Rate Limiter**: Atomic persistent rate-limiting (`circuit-state.json`) and operator hard-stop kill-switch.
- **ATK-10 Prompt Injection Protection**: Sanitizes and escapes untrusted handover inputs into `<untrusted_handover>` XML delimiters.
- **ARCR Channel Confinement**: Restricts agent communication channels and logs unauthorized side-channel attempts.

### 2. 🌐 `ANT Adapt` (OS & Environment Auto-Sensing Engine)
- **Cross-Platform Auto-Detection**: Detects Termux Proot, Linux, macOS, Windows CMD/PowerShell, and WSL.
- **Dynamic Operator Profile**: Distinguishes Developer/Creator mode (`Ard`) from Public Operator mode, avoiding `root`/`rootlokal` misconceptions.

### 3. 🛡️ Flexible 3-Way Approval Gate
- **Interactive Approval Options**:
  1. `Yes, approve once` (Sekali ini)
  2. `Yes, approve all for this session` (Setuju semua / Jangan tanya lagi di sesi ini)
  3. `No, reject` (Tolak / Batal)
- **Session Auto-Approve Policy**: Remembers session policy when option 2 is chosen to allow uninterrupted execution.

### 4. 🧠 Multi-Provider AI Gateway & SLM Guard
- Supports Google Gemini, Anthropic Claude, OpenAI, DeepSeek, and local Ollama (`gemma4:31b-cloud`, etc.).
- **SLM Micro-Prompting**: Automatically prunes heavy system prompts for lightweight local models (<3B) on mobile devices to prevent RAM/OOM crashes.

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

### Model Switch & Mailbox Handover

```bash
# In interactive chat:
/model gemma4:31b-cloud
/model deepseek-r1
```

---

## 📐 Project Architecture

```text
src/
├── core/
│   ├── actions/          # Modular action handlers (file, shell, web, skill, browser)
│   ├── ai/               # Multi-provider LLM router (Gemini, Claude, OpenAI, Ollama)
│   │   ├── providers/    # Provider-specific callers (gemini, anthropic, openai)
│   │   └── tiers/        # SLM vs LLM tier routing
│   ├── agentic/          # Sub-agents, HTN planner, reflection loop, branching, mailbox
│   │   └── mailbox/      # AntModelMailbox: fileLock, writer, circuitBreaker, claimVerifier, promptInjector, channelGuard
│   ├── agent_loop/       # Core execution loop, UI loggers, permissions
│   ├── ant_adapt.ts      # OS & Environment auto-sensing engine
│   └── workspace/        # Workspace state and Google Drive/Sheets integration
├── security/             # FS Guard, Trust score gate, Permissions
└── utils/                # Sovereign logger and prompt formatters
```

---

## 🤝 License

MIT License — Created by **Ard** for the ANT Sovereign Ecosystem under the CLUW Genesis heritage.
