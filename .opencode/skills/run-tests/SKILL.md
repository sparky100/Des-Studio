---
name: run-tests
description: Standardized test workflow with Vitest and build verification
license: MIT
compatibility: opencode
---
## Workflow
1. Run the focused test file first: `npx vitest run <test path>`
2. If it fails, diagnose and fix, then re-run
3. If it passes, run `npm run build` to verify no compilation errors
4. If both pass, report the results
## Rules
- Always check build before declaring a fix complete
- Use `npm test -- --run` for the full suite, `npx vitest run <path>` for a specific file
- Pre-existing failures should be noted but not gate progress
