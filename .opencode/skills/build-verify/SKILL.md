---
name: build-verify
description: Build verification gate — run before declaring any changes complete
license: MIT
compatibility: opencode
---
## Workflow
1. Run `npm run build`
2. If build fails, diagnose and fix errors, then re-run
3. If build succeeds, run `npm test -- --run` (or the relevant subset)
4. Report pass/fail status
## Rules
- The `dist/` directory is gitignored — no need to commit
- Chunk size warnings are informational only, not errors
- Test timeouts over 300s may indicate an infinite loop — check for unbound engine tests
