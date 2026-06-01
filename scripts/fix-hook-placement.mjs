/**
 * Finds and fixes cases where `const { C, FONT } = useTheme()` was inserted
 * inside a function's parameter destructuring instead of its body.
 *
 * Bad pattern (hook is inside params, between { and }):
 *   function Foo({
 *     const { C, FONT } = useTheme();    <-- wrong
 *     bar, baz
 *   }) {
 *     ...
 *
 * Correct:
 *   function Foo({ bar, baz }) {
 *     const { C, FONT } = useTheme();    <-- right
 *     ...
 *
 * We detect this by: after seeing a function/arrow definition line with an
 * unclosed destructuring {, if we see the hook call before the `) {` or `) =>` line.
 */
import { readFileSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

function allJsx(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...allJsx(full));
      else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) results.push(full);
    }
  } catch (_) {}
  return results;
}

const HOOK_LINE = '  const { C, FONT } = useTheme();';
const files = allJsx('src/ui');
let fixedCount = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  let needsFix = false;

  // Detect: is there a line matching HOOK_LINE that appears while we're inside
  // a function parameter destructuring (before we see the body-opening `{`)?
  //
  // State machine per line:
  //   state=0: not in a function signature
  //   state=1: inside multi-line params (saw `function X({` or `const X = ({` but unclosed)
  //   state=2: saw `) {` or `){` - now inside function body

  // Simple heuristic: the hook line appears on a line whose immediate context
  // has the pattern of being in a destructuring block.
  // Specifically: a line with JUST the hook statement, where the previous lines
  // include `function Name({` or `const Name = ({` and we haven't seen `) {` yet.

  const badLineIndices = [];

  // For each occurrence of the hook line, check if it's inside params
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== 'const { C, FONT } = useTheme();') continue;

    // Look backward for function definition start
    let inParams = false;
    for (let j = i - 1; j >= Math.max(0, i - 30); j--) {
      const prev = lines[j].trim();

      // If we see a function body open - we're fine (hook is inside body)
      if (prev.endsWith(') {') || prev.endsWith('){') || prev.endsWith('=> {') || prev === '{') {
        inParams = false;
        break;
      }

      // If we see a function/const definition that opens a destructuring param
      if (
        /^(export\s+)?(default\s+)?function\s+\w.*\(\{/.test(prev) ||
        /^(export\s+)?(const|let)\s+\w+\s*=\s*(React\.memo\s*\()?\s*\(\{/.test(prev)
      ) {
        // The opening { here is for params, not body
        inParams = true;
        break;
      }

      // If we see a standalone props line like `bar, baz` or `propName,` it suggests we're in params
      if (/^[\w,\s]+,$/.test(prev) || /^\}(\)\s*\{|\)\s*=>)/.test(prev)) {
        inParams = false;
        break;
      }
    }

    if (inParams) {
      badLineIndices.push(i);
      needsFix = true;
    }
  }

  if (!needsFix) continue;

  // Remove the bad lines and re-insert hook after the function body opening
  const newLines = [...lines];

  // Process in reverse so indices stay valid
  for (const badIdx of badLineIndices.reverse()) {
    // Remove the hook line from params
    newLines.splice(badIdx, 1);

    // Find the function body opening `) {` or `) => {` that comes after
    let bodyOpenIdx = -1;
    for (let k = badIdx; k < Math.min(badIdx + 20, newLines.length); k++) {
      const t = newLines[k].trim();
      if (
        t.endsWith(') {') || t.endsWith('){') ||
        t.endsWith('=> {') || t.endsWith('=>{') ||
        (t === '{' && k > 0)
      ) {
        bodyOpenIdx = k;
        break;
      }
    }

    if (bodyOpenIdx >= 0) {
      newLines.splice(bodyOpenIdx + 1, 0, HOOK_LINE);
    } else {
      console.warn(`  WARN: Could not find body open in ${file} near removed line ${badIdx}`);
    }
  }

  writeFileSync(file, newLines.join('\n'), 'utf8');
  fixedCount++;
  console.log('Fixed:', file);
}

console.log(`\nFixed ${fixedCount} files.`);
