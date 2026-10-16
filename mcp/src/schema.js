// The Flow model schema reference (docs/model-schema-for-llm.md) — the same
// document the in-app prompt pack exports — served in pieces, because the
// whole thing is ~230 KB and an assistant rarely needs more than a few
// sections at once.
import { readFileSync } from 'node:fs';

/* global __FLOW_SCHEMA__ */
export function loadSchemaText() {
  // The bundled server (build.mjs) inlines the document; running from source
  // reads it from the repo.
  if (typeof __FLOW_SCHEMA__ !== 'undefined') return __FLOW_SCHEMA__;
  return readFileSync(new URL('../../docs/model-schema-for-llm.md', import.meta.url), 'utf8');
}

// Splits the document on its level-2 headings.
// → { preamble, sections: [{ title, number, text }] }
export function splitSchema(text) {
  const lines = text.split('\n');
  const sections = [];
  const preamble = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    if (!inFence && /^## /.test(line)) {
      const title = line.replace(/^## /, '').trim();
      const number = (title.match(/^(\d+(?:\.\d+)?)\./) || [])[1] || null;
      current = { title, number, lines: [line] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  return {
    preamble: preamble.join('\n'),
    sections: sections.map(s => ({ title: s.title, number: s.number, text: s.lines.join('\n').trim() })),
  };
}

const ALWAYS = ['MANDATORY GENERATION PROTOCOL', 'TOP LLM MISTAKES'];

// No `section`: the protocol, the common mistakes and a table of contents.
// `section`: one or more sections by number ("6", "6.1") or words from the
// title ("C-Events"), comma-separated. "all": the whole document.
export function schemaExcerpt(text, section) {
  const { sections } = splitSchema(text);
  if (section && String(section).trim().toLowerCase() === 'all') return text;
  if (!section || !String(section).trim()) {
    const core = sections.filter(s => ALWAYS.some(a => s.title.toUpperCase().startsWith(a)));
    const toc = sections.map(s => `- ${s.title}`).join('\n');
    return [
      'Using these tools: the protocol below asks you to read every section first. You can instead fetch the sections for what you are building (usually 1–6, plus "12.3", the complete reference model) and use flow_validate_model for the §10 checks in step 4. It runs Flow\'s own validator.',
      ...core.map(s => s.text),
      '## Sections available',
      'Ask for any of these with flow_get_schema({ section: "<number or title words>" }), e.g. "1", "5", "6.1", "Distributions", or several at once: "2, 3, 5".',
      toc,
    ].join('\n\n');
  }
  const wanted = String(section).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const picked = [];
  for (const w of wanted) {
    const matches = sections.filter(s => (s.number && s.number === w) || s.title.toLowerCase().includes(w));
    // A sub-section number ("12.3") that isn't a top-level section: return
    // just that sub-section rather than all of §12.
    const sub = matches.length === 0 && /^\d+\.\d+$/.test(w) ? subsection(text, w) : null;
    if (sub) picked.push({ text: sub });
    for (const m of matches) if (!picked.includes(m)) picked.push(m);
  }
  if (picked.length === 0) {
    return `No section matches "${section}". Sections:\n${sections.map(s => `- ${s.title}`).join('\n')}`;
  }
  return picked.map(s => s.text).join('\n\n');
}

// "### 12.3 …" up to the next heading of the same or a higher level.
function subsection(text, number) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.startsWith(`### ${number} `));
  if (start < 0) return null;
  let end = lines.length;
  let inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^```/.test(lines[i])) inFence = !inFence;
    if (!inFence && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n').trim();
}
