---
name: commit-push
description: Git commit with conventional commit format and push
license: MIT
compatibility: opencode
---
## Workflow
1. Run `git status` to see what files changed
2. Run `git diff --stat` for a summary, `git diff` for full diff
3. Run `git log --oneline -5` to see recent commit style
4. Stage with `git add -A`
5. Commit with conventional format: `Sprint N: <description>` for sprint work, `<type>: <description>` for fixes
6. Push with `git push origin <branch>`
## Rules
- Never push to protected branches without confirmation
- Never commit secrets or .env files
- Keep commit messages concise (1-2 sentences)
