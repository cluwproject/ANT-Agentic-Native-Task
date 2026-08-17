# 🤝 Contributing to ANT-CLI

Thank you for your interest in contributing to **ANT-CLI (Agentic Native Task)**.

ANT-CLI is a sovereign, model-agnostic agentic runtime designed around autonomous execution, persistent cognitive memory, security controls, and verifiable evidence.

Contributions are welcome—but changes to the runtime should preserve the core principles of the system:

> **You Ask. ANT Acts. Memory Persists. Evidence Remains.**

---

## 🧭 Core Contribution Principles

Every contribution should preserve these four principles:

### 1. Autonomy

ANT should be able to plan and execute tasks through modular agentic components without turning the runtime into a monolithic system.

### 2. Control

AI-generated intentions must never automatically bypass runtime security, permission gates, or execution boundaries.

### 3. Persistence

Important runtime state and cognitive context should remain compatible with ANT's persistent memory architecture.

### 4. Evidence

Actions should remain observable and verifiable.

> **Claim != Truth.**

If a feature performs an action, it should provide enough information for the runtime to determine what actually happened.

---

# 🛠️ Development Guidelines

## 1. Keep the Architecture Modular

Avoid monolithic files and tightly coupled components.

As a general guideline:

* Avoid new source files exceeding **600 lines** unless there is a strong architectural reason.
* Place system actions in:

```text
src/core/actions/
```

* Place AI provider integrations in:

```text
src/core/ai/providers/
```

* Place agentic capabilities in:

```text
src/core/agentic/
```

* Place evidence-related functionality in:

```text
src/core/agent_loop/
src/evidence/
```

* Place security-related functionality in:

```text
src/security/
```

New functionality should be placed in the layer that owns its responsibility rather than added to unrelated core files.

---

## 2. Preserve Type Safety

All TypeScript code must pass:

```bash
npm run typecheck
```

which should execute:

```bash
tsc --noEmit
```

Do not introduce new TypeScript errors, warnings, unsafe casts, or unnecessary `any` usage.

When adding a new interface, tool, provider, action, or runtime state, define its type explicitly.

---

## 3. Preserve Public Facades

Do not remove or arbitrarily rename compatibility entry points.

Important compatibility facades include:

```text
src/core/actions.ts
src/core/ai.ts
src/core/workspace.ts
```

Internal implementations may evolve, but existing consumers should continue to have a stable interface whenever possible.

If a breaking change is unavoidable, document it clearly in the pull request.

---

## 4. No Destructive Operations by Default

ANT is an autonomous runtime.

That means security boundaries must be treated as part of the architecture—not optional features.

Contributions must not bypass:

* Permission gates
* Security blocklists
* Trust checks
* Shell execution boundaries
* Tool validation
* Evidence recording
* Git checkpoints
* Verification guards

Never introduce a feature that silently converts a restricted operation into an unrestricted operation.

---

# 🔐 Security Guidelines

Security-sensitive changes require additional care.

Do not:

* Disable security checks to make a test pass
* Hard-code credentials or API keys
* Commit `.env` files
* Circumvent permission prompts
* Execute arbitrary shell commands without validation
* Remove evidence generation from destructive operations
* Store secrets inside persistent memory
* Bypass tool schemas

Sensitive configuration belongs in environment variables or approved secure configuration mechanisms.

---

# 🧠 Agentic System Guidelines

ANT is not simply an LLM wrapper.

Agentic components should respect the execution lifecycle:

```text
Intent
  ↓
Planning
  ↓
Tool Selection
  ↓
Permission
  ↓
Execution
  ↓
Evidence
  ↓
Verification
  ↓
Memory / State Update
```

New autonomous capabilities should integrate into this lifecycle rather than creating an independent execution path.

When introducing a new agentic behavior, consider:

* What can the agent decide?
* What can it execute?
* What requires permission?
* What evidence is generated?
* How is failure detected?
* How can the operation be rolled back?
* What state should persist?

---

# 🤖 AI Provider Contributions

ANT is model-agnostic.

New providers should be implemented through the provider abstraction rather than directly coupling the runtime to a specific model vendor.

Provider integrations should:

* Follow the existing provider interface
* Handle authentication securely
* Support failure detection
* Return normalized responses
* Avoid leaking provider-specific behavior into the core runtime
* Work with the existing routing architecture

A provider should be replaceable without rewriting the cognitive kernel or execution engine.

---

# 🗄️ Memory Contributions

Changes involving MindBy or persistent memory require special attention.

Memory-related features should clearly distinguish between:

```text
Working Context
Episodic Memory
Semantic Memory
Core / Identity Memory
```

Do not silently store transient information as permanent memory.

Do not modify immutable identity or sovereignty records without explicit authorization.

Memory changes should also consider:

* Data integrity
* Persistence
* Retrieval accuracy
* Context isolation
* Privacy
* Migration compatibility

---

# 🔎 Evidence & Verification

Actions that modify the environment should remain observable.

Where applicable, contributions should support:

```text
Before State
     ↓
Action
     ↓
After State
     ↓
Diff
     ↓
Evidence
     ↓
Verification
```

For file and repository operations, Git status, diffs, checkpoints, or equivalent evidence should not be unnecessarily removed.

If a feature reports success, there should be a reliable mechanism for verifying that success.

---

# 🧪 Testing Your Changes

Before submitting code, run the following checks.

### 1. Type checking

```bash
npm run typecheck
```

### 2. Production build

```bash
npm run build
```

### 3. CLI boot test

```bash
node bin/ant.js --help
```

### 4. Git status

```bash
git status
```

If the project provides additional test commands, run the relevant test suite as well.

---

# 🧪 Test Before You Commit

A basic contribution workflow is:

```bash
npm run typecheck
npm run build
node bin/ant.js --help
git status
git diff
```

For changes affecting agent execution, tools, memory, security, or evidence, perform additional targeted tests before submitting the change.

---

# 🌿 Git Workflow

Create a dedicated branch for your contribution:

```bash
git checkout -b feature/your-feature-name
```

Keep commits focused and descriptive.

Example:

```text
feat: add provider health detection
fix: prevent invalid tool calls
feat: add memory retrieval filter
fix: preserve permission gate during shell execution
```

Avoid mixing unrelated changes into the same commit.

---

# 📝 Pull Requests

A good pull request should explain:

### What changed?

Describe the feature, fix, or architectural change.

### Why was it needed?

Explain the problem being solved.

### How does it work?

Describe the relevant execution flow or architecture.

### What was tested?

Include the commands you ran and their results.

### Security impact

State whether the change affects:

* Permissions
* Shell execution
* Filesystem access
* Credentials
* Memory
* Tool execution
* Evidence
* Trust mechanisms

If there is no security impact, explicitly state that.

---

# 🚨 Breaking Changes

Breaking changes require additional explanation.

A breaking change should include:

1. The previous behavior
2. The new behavior
3. Why the change is necessary
4. Migration instructions
5. Compatibility considerations

Do not silently break existing runtime interfaces.

---

# 🧹 Code Quality

Keep contributions:

* Small
* Readable
* Typed
* Testable
* Modular
* Observable
* Reversible where possible

Avoid unnecessary abstractions and premature complexity.

The goal is not to make ANT look more complicated.

The goal is to make ANT **more capable without making it less understandable or controllable**.

---

# 🛡️ Sovereignty Rule

ANT-CLI is designed as a sovereign agentic runtime.

Contributors should not introduce architectural dependencies that unnecessarily transfer control of the runtime to a single external provider.

External services may be integrated where appropriate, but the core runtime should remain:

**Model-Agnostic**

**Observable**

**Controllable**

**Recoverable**

**Evidence-Driven**

---

# 🤝 Contribution Checklist

Before opening a pull request:

* [ ] The code is modular and placed in the correct architecture layer.
* [ ] `npm run typecheck` passes.
* [ ] `npm run build` passes.
* [ ] `node bin/ant.js --help` works.
* [ ] Existing compatibility facades remain functional.
* [ ] Security gates have not been bypassed.
* [ ] No secrets or credentials were committed.
* [ ] Agentic actions remain observable.
* [ ] Relevant evidence is preserved.
* [ ] Memory behavior is intentional and documented.
* [ ] Git diff has been reviewed.
* [ ] Breaking changes are documented.
* [ ] The pull request explains what was changed and how it was tested.

---

## Final Principle

ANT-CLI is built around a simple idea:

> **An autonomous agent should not only be capable of acting. It should be capable of explaining, verifying, and accounting for its actions.**

Contributions that strengthen that principle are especially valuable.

**Build carefully.
Act deliberately.
Verify everything.**

**ANT-CLI — Agentic Native Task**

> **You Ask. ANT Acts. Memory Persists. Evidence Remains.**
