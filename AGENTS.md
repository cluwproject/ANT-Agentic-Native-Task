# AGENTS.md — ANT-Code Branch Context

> ⚠️ **BRANCH: `antcode`** — Refactoring target from `antcli` → `antcode`
> **DO NOT MODIFY** core antcli system internals (ai/, agent_loop/, actions/, security/).
> Only add/modify files in `src/runtime/`, `config/`, `.ant/`, and documentation.

---

## 🎯 Scope: Runtime Agent Code (`src/runtime/`)

This branch is for **runtime agent code** refactoring. The `src/runtime/` module is the public-facing API layer that wraps the core agent loop. It must remain decoupled from internal system changes.

### Runtime Files (`src/runtime/`)
- `index.ts` — Public API exports
- `runtime.ts` — `AgenticRuntime` class + `CognitiveStateSchema`
- `executor.ts` — `executeTask()` ReAct loop
- `events.ts` — `RuntimeEventBus` + `runtimeBus`
- `types.ts` — `Task`, `Turn`, `TaskStatus`, `RuntimeOptions`
- `cli.ts` — Pure CLI runner entry point

---

## 🔴 Known Issues (Runtime Layer)

> Status per 2026-09-13 (Fase 1 selesai): `[x]` = fixed di branch ini,
> `[~]` = partial / documented, `[→]` = dipindah ke branch `fix/core-p0`.

| # | Issue | File | Priority | Status |
|---|-------|------|----------|--------|
| 1 | **Trust file path mismatch** — `actions/index.ts` reads `workspace/registry/trust.json` & `workspace/core/trust.shadow.json` but files are at `workspace/trust.json` & `workspace/trust.shadow.json` | `src/core/actions/index.ts` | P0 | [→] `fix/core-p0` (core, dilarang di branch ini) |
| 2 | **Missing `config/soul.yaml`** — `prompts.ts` falls back to DEFAULT_SOUL | `config/soul.yaml` | P0 | [~] template `config/soul.yaml.example` ditambah; file asli tetap per-install (di-ignore) |
| 3 | **Missing `config/ant_identity.json`** — `agentLoop.ts` falls back to default system instruction | `config/ant_identity.json` | P1 | [~] template `config/ant_identity.json.example` ditambah |
| 4 | **Missing `ANT.md`** — Project memory not loaded | `ANT.md` or `.ant/ANT.md` | P1 | [~] template `ANT.md.example` ditambah |
| 5 | **`executor.ts` `turns` array** — Multiple tool calls per turn each get separate entry with same `turnNum` | `src/runtime/executor.ts` | P1 | [~] count event `taskComplete` diperbaiki via `lastTurnNum`; agregasi per-turn entry masih terbuka |
| 6 | **`parseError` ignored** — Tool call parse errors not checked in executor | `src/runtime/executor.ts` | P2 | [x] emit `system:log WARN` saat `parseError` |
| 7 | **`bridge.js` uses CJS `require` in ESM** — Fragile, should use ESM imports | `src/core/ai/bridge.js` | P0 | [→] `fix/core-p0` (core, dilarang di branch ini) |
| 8 | **`runInteractive()` UI** — `process.stderr` conflicts with readline prompt | `src/runtime/runtime.ts` | P2 | [~] dicatat TODO di kode; refactor UI besar ditunda. Race condition (`busy` guard) + shutdown natural [x] |

---

## 📋 Rules for Agents Working on `antcode`

1. **Stay on branch `antcode`** — verify with `git branch --show-current` (must print `antcode`)
2. **Never modify** `src/core/ai/`, `src/core/agent_loop/`, `src/core/actions/`, `src/core/security/` internals
3. **Only modify** `src/runtime/` for runtime-layer changes
4. **Create config files** in `config/` or `.ant/` as needed (don't modify existing)
5. **Commit message format**: `antcode(runtime): <description>`
6. **Do NOT push to `main`** — all work stays on `antcode` branch
7. **Runtime tests**: `npm run test:unit` — baseline 232/232 passing (235/235 sejak test `isFatalError` ditambah Fase 1)
8. **Typecheck**: `npm run typecheck` — must pass with 0 errors
9. **Build**: `npm run build` — must produce clean `dist/`

---

## 🔄 Git Workflow (antcode only)

Daily cycle — always from branch `antcode`:

```bash
git branch --show-current   # must print: antcode
git status                  # check changes
git add <files>             # stage (prefer specific files over `git add .`)
git commit -m "antcode(runtime): <description>"
git push                    # tracked → origin/antcode (no args needed)
git pull                    # tracked ← origin/antcode
```

Upstream is pre-configured: `branch.antcode.remote=origin`, `branch.antcode.merge=refs/heads/antcode`.

### ⛔ Forbidden (auto-blocked by local pre-push hook)

```bash
git push origin main        # BLOCKED — hook rejects refs/heads/main
git push origin HEAD:main   # BLOCKED
```

Note: `.git/hooks/pre-push` is local-only (not committed to repo).
Each agent/machine must install it once if missing.

---

## 🔗 Related Files

- `ARCHITECTURE.md` — System architecture documentation
- `src/core/cli/index.ts` — Main CLI entry (NOT to be modified)
- `src/core/ai/index.ts` — AI provider hub (NOT to be modified)
- `src/core/agent_loop/agentLoop.ts` — Core ReAct loop (NOT to be modified)
- `src/runtime/` — **THE** working directory for this branch

---

## 🧪 Test Baseline

- Unit tests: **235 passing** (232 baseline + 3 `isFatalError`, Fase 1)
- Typecheck: **0 errors**
- Lint: **0 errors, 684 warnings** (warnings only)

---

## 📌 Last Updated

2026-09-13 — Fase 0–1 selesai di branch `antcode`: repo hygiene, REPL race fix,
dead-code removal, FATAL markers + test, CLI renderer wrap + SIGINT,
BrainConfig diperketat, template `.example`. Issue #1 & #7 dipindah ke
`fix/core-p0` (di luar branch ini).
