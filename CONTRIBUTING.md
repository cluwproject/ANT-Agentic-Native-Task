# 🤝 Contributing to ANT-CLI

Thank you for your interest in contributing to **ANT (Agentic Native Task)**!

---

## 🛠️ Development Guidelines

1. **Keep Code Modular**: Avoid monolithic files >600 lines. Place new actions in `src/core/actions/`, AI providers in `src/core/ai/providers/`, and agentic features in `src/core/agentic/`.
2. **Type Safety**: All TypeScript code must pass `npm run typecheck` (`tsc --noEmit`) without errors or warnings.
3. **Preserve Compatibility**: Keep entry point facades (`src/core/actions.ts`, `src/core/ai.ts`, `src/core/workspace.ts`) intact for backwards compatibility.
4. **No Destructive Operations**: Ensure security blocklists and Trust Score checks remain active.

---

## 🧪 Testing Your Changes

Before submitting code:

```bash
# 1. Check TypeScript types
npm run typecheck

# 2. Build production bundle
npm run build

# 3. Test CLI boot
node bin/ant.js --help
```
