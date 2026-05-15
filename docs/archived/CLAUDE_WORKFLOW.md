# Claude + Claude Code App Development Workflow

A practical guide for building production-quality apps using Claude (AI) and Claude Code (CLI).

---

## Overview

The workflow is structured in three phases:

1. **Project Setup** — Define the product, architecture, and initial files
2. **Sprint Cycles** — Build features iteratively with Claude Code
3. **Sprint Completion** — Review, refactor, commit, and plan next sprint

---

## Phase 1: Project Setup

### 1.1 — Start with a Product Brief (Claude Chat)

Before opening Claude Code, clarify the product in Claude.ai chat:

**Prompt:**
```
I want to build [app name]. It's a [type of app] that [core purpose].

Target users: [who uses it]
Core problems it solves: [1-3 bullet points]
Key features for v1: [3-5 features]
Tech stack preference: [React/Vue/Python/Node/etc or "you choose"]

Give me:
1. A recommended tech stack with brief rationale
2. A folder structure
3. A list of 3-5 sprints to reach a working v1
4. A CLAUDE.md file I can drop in the project root
```

### 1.2 — Create the CLAUDE.md file

`CLAUDE.md` is Claude Code's persistent memory — it reads this at the start of every session. Place it in the project root.

**Template:**
```markdown
# [App Name]

## Project Purpose
[One sentence description]

## Tech Stack
- Frontend: [framework + version]
- Backend: [framework + version]
- Database: [db + ORM]
- Styling: [CSS approach]
- Testing: [test framework]

## Architecture Notes
[Key architectural decisions, patterns used, anything non-obvious]

## File Structure
[Paste the agreed folder structure]

## Coding Conventions
- Use [tabs/spaces, 2/4 spaces]
- Component naming: [PascalCase/kebab-case]
- File naming: [convention]
- No comments unless WHY is non-obvious
- [Any other project-specific rules]

## Commands
- Dev server: `npm run dev`
- Tests: `npm test`
- Build: `npm run build`
- Lint: `npm run lint`

## Current Sprint
Sprint [N]: [sprint goal]

## Out of Scope (v1)
- [Feature to defer]
- [Feature to defer]
```

### 1.3 — Scaffold the Project (Claude Code)

Open Claude Code in the project root and run:

**Prompt:**
```
Read CLAUDE.md. Scaffold the project with:
- All config files (package.json, tsconfig, vite.config, eslint, etc.)
- Empty placeholder files for every module in the file structure
- A working dev server with a hello world home page
- Git init with a .gitignore

Don't implement any features yet — just structure and config.
Run the dev server and confirm it works before finishing.
```

---

## Phase 2: Sprint Cycles

Each sprint targets one area of functionality. Sprints should be 1–3 days of work max — small enough to stay focused, large enough to ship something testable.

### 2.1 — Sprint Kickoff Prompt

At the start of each sprint:

```
Read CLAUDE.md. We're starting Sprint [N]: [sprint goal].

This sprint delivers: [2-4 specific deliverables]

Acceptance criteria:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

Constraints:
- Don't touch [module/file] yet — that's Sprint [N+1]
- Keep changes isolated to [folder/module]
- No premature abstraction — implement exactly what's needed

Start by listing the files you'll create or modify, then proceed.
```

### 2.2 — Feature Implementation Prompts

**For a new UI component:**
```
Implement [ComponentName] in [filepath].

It receives: [props or data shape]
It should: [behavior description]
It should look like: [description or "match existing style"]

Use [existing component] as a style reference.
Don't add props or variants we haven't discussed.
```

**For a data/API layer:**
```
Implement the [feature] API layer.

Endpoint: [METHOD] [/path]
Input: [request shape]
Output: [response shape]
Error cases to handle: [list]

Use [existing pattern/file] as a reference for structure.
Add validation only at the API boundary, not internally.
```

**For a state management piece:**
```
Add state management for [feature].

State shape: [describe the data]
Actions needed: [list CRUD or specific operations]
Where it's consumed: [list of components]

Use the existing [store/context/hook] pattern already in the codebase.
```

**For fixing a bug:**
```
Bug: [describe the symptom]
Steps to reproduce: [steps]
Expected: [what should happen]
Actual: [what happens]

Investigate the root cause. Don't patch symptoms — fix the underlying issue.
Show me the root cause before changing code.
```

### 2.3 — Mid-Sprint Check-in Prompt

When Claude Code has been working for a while and you want a status check:

```
Pause. Give me a status update:
1. What's done so far this sprint
2. What's still to do
3. Any decisions you made that I should know about
4. Any blockers or things needing my input

Don't write code yet — just status.
```

### 2.4 — Course Correction Prompt

When output goes off-track:

```
Stop. This is going in the wrong direction.

The problem: [what's wrong with the current approach]
What I actually want: [clarify intent]

Revert to [describe known-good state or file] and try again,
this time [specific constraint or approach].
```

---

## Phase 3: Sprint Completion

### 3.1 — Sprint Review Prompt

Before committing, run a review pass:

```
The sprint is feature-complete. Before we commit:

1. Read every file you created or modified this sprint
2. Check for:
   - Dead code or unused imports
   - Hardcoded values that should be constants or env vars
   - Missing error handling at system boundaries (user input, API calls)
   - Any console.log or debug code left in
   - Inconsistencies with conventions in CLAUDE.md
3. Fix anything you find
4. List what you changed in the review pass
```

### 3.2 — Test Coverage Prompt

```
Write tests for the [feature/module] built this sprint.

Test the following cases:
- Happy path: [describe]
- Edge cases: [list 2-3]
- Error cases: [list 1-2]

Use the existing test setup in [test file/folder].
Don't test implementation details — test behavior.
Run the tests and confirm they pass.
```

### 3.3 — CLAUDE.md Update Prompt

    ```
    Update CLAUDE.md to reflect what changed this sprint:
    - Update "Current Sprint" to Sprint [N+1]: [next goal]
    - Add any new architectural decisions made
    - Add any new commands or environment variables
    - Note anything future-Claude should know about this module

    Show me the diff before writing it.
    ```

### 3.4 — Commit Prompt

```
Create a git commit for Sprint [N].

Summarize the changes accurately. Format:
- Subject line: imperative mood, under 70 chars, no period
- Body: bullet points of what changed and why (not how)
- No "fixed bug" or "added feature" — be specific

Stage only the files changed this sprint. Show me the staged files and
commit message before committing.
```

### 3.5 — Sprint Retrospective Prompt (Claude Chat)

After committing, take a step back in Claude.ai chat:

```
We just finished Sprint [N] of [app name].

Completed: [brief list of what shipped]
What worked well: [observations]
What was messy: [friction points]

Given where we are, help me refine the plan for Sprint [N+1].
What should we tackle first, and are there any risks or dependencies
I should resolve before starting?
```

---

## Key Files Reference

### `.claude/settings.json` — Permissions & hooks

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run dev)",
      "Bash(npm test)",
      "Bash(npm run build)",
      "Bash(npm run lint)",
      "Bash(git add:*)",
      "Bash(git status)",
      "Bash(git diff:*)"
    ]
  }
}
```

### `.claude/commands/sprint-start.md` — Custom slash command

Create this file to use `/sprint-start` in Claude Code:

```markdown
Read CLAUDE.md and confirm the current sprint goal.
List the files in scope for this sprint.
Ask me for the acceptance criteria before writing any code.
```

### `.claude/commands/review.md` — Pre-commit review slash command

```markdown
Review all files changed since the last commit.
Check for dead code, debug statements, missing boundary validation,
and deviations from CLAUDE.md conventions.
Report findings before making any changes.
```

---

## Anti-Patterns to Avoid

| Anti-pattern | Better approach |
|---|---|
| "Build the whole app" in one prompt | Break into sprints with clear scope |
| Vague prompts ("make it better") | Specific criteria and acceptance tests |
| Skipping CLAUDE.md updates | Update at end of every sprint |
| Large commits across many features | One commit per sprint or logical unit |
| Adding features mid-sprint | Log them, finish the sprint, add to backlog |
| Accepting output without reviewing | Always run the review prompt before committing |

---

## Sprint Planning Template

```
Sprint [N]: [Goal]
Duration: [X days]

Deliverables:
- [ ] [Feature or module 1]
- [ ] [Feature or module 2]
- [ ] [Feature or module 3]

Files in scope:
- [file or folder]
- [file or folder]

Out of scope this sprint:
- [thing to defer]

Depends on: [Sprint N-1 output / nothing]
Blocked by: [external thing / nothing]
```

---

## Example Sprint Breakdown (Generic SaaS App)

| Sprint | Goal | Key Deliverables |
|---|---|---|
| 0 | Scaffold | Config, folder structure, dev server working |
| 1 | Auth | Sign up, log in, JWT/session, protected routes |
| 2 | Core data model | DB schema, migrations, seed data, base API |
| 3 | Core UI | Main layout, nav, primary list/detail views |
| 4 | Core feature | The main thing the app does (CRUD, workflow, etc.) |
| 5 | Polish + error states | Loading states, empty states, error handling |
| 6 | Testing + hardening | Test coverage, security review, perf check |

---

## Quick Reference Card

**Session start:**
> "Read CLAUDE.md. We're continuing Sprint [N]. Here's where we left off: [2 sentences]."

**Staying on track:**
> "Before continuing, confirm: what file are you about to edit and why?"

**When lost:**
> "Stop coding. Describe the current state of [module] and what you think needs to happen next."

**Wrapping up:**
> "Sprint [N] is done. Run the review prompt, then update CLAUDE.md, then commit."
