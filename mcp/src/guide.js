// Flow's modelling method (skills/flow-modelling/SKILL.md): how to
// interview the person, map their system onto Flow, use these tools in the
// right order, and the fatal errors Flow's in-app model builder checks
// (src/llm/model-builder-prompts.js). The schema says what a model may
// contain; this says how to build a good one. The same file is the Claude
// skill, so the assistant gets the method whether or not the skill is
// installed.
import { readFileSync } from 'node:fs';

/* global __FLOW_GUIDE__, URL */
export function loadGuideText() {
  // The bundled server (build.mjs) inlines the file; running from source
  // reads it from the repo.
  const raw = typeof __FLOW_GUIDE__ !== 'undefined'
    ? __FLOW_GUIDE__
    : readFileSync(new URL('../skills/flow-modelling/SKILL.md', import.meta.url), 'utf8');
  return stripFrontmatter(raw);
}

// The skill's YAML header (name, description) is for Claude's skill loader,
// not for the reader.
export function stripFrontmatter(text) {
  return String(text).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '').trim();
}
