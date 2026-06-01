/**
 * Fix cases where migrate-theme.mjs inserted `const { C, FONT } = useTheme();`
 * inside a destructured parameter list instead of a function body.
 *
 * The bad pattern looks like:
 *   function Foo({
 *     const { C, FONT } = useTheme(); bar, baz }) {
 *
 * We fix it by:
 * 1. Removing the mis-inserted line
 * 2. Adding the hook call at the proper start of the function body
 */
import { readFileSync, writeFileSync } from 'fs';
import { readdirSync } from 'fs';

function allJsx(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = dir + '/' + entry.name;
    if (entry.isDirectory()) results.push(...allJsx(full));
    else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) results.push(full);
  }
  return results;
}

const files = allJsx('src/ui');
let fixedCount = 0;

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  let modified = false;

  // Detect the bad pattern: a line that has "const { C, FONT } = useTheme();"
  // but is not a standalone statement (i.e., it has other stuff on the same line)
  const lines = content.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Bad pattern: line contains "const { C, FONT } = useTheme();" but also has other content after it
    // that looks like it's part of a function parameter list (like "bar, baz })" or similar)
    if (
      line.includes('const { C, FONT } = useTheme();') &&
      !trimmed.startsWith('const { C, FONT }') &&
      !trimmed.startsWith('//')
    ) {
      // Remove the hook from this line
      const cleanedLine = line.replace('const { C, FONT } = useTheme(); ', '');
      output.push(cleanedLine);
      modified = true;

      // Now find the opening brace of the actual function body and insert there
      // We look for the next line that has just '{' or ends with ') {'
      // Continue scanning from here
      let inserted = false;
      let j = i + 1;
      while (j < lines.length && j < i + 30 && !inserted) {
        const nextLine = lines[j];
        // Function body start: a line ending with ') {' or just '{' on its own, or '=>' followed by '{'
        if (
          /\)\s*\{$/.test(nextLine.trim()) ||
          nextLine.trim() === '{' ||
          /=>\s*\{$/.test(nextLine.trim())
        ) {
          output.push(nextLine);
          output.push('  const { C, FONT } = useTheme();');
          i = j + 1;
          inserted = true;
        } else {
          output.push(nextLine);
          j++;
          i = j;
        }
      }
      if (!inserted) {
        // Fallback: just continue
        i++;
      }
      continue;
    }

    output.push(line);
    i++;
  }

  if (modified) {
    writeFileSync(file, output.join('\n'), 'utf8');
    fixedCount++;
    console.log('Fixed:', file);
  }
}

console.log(`\nFixed ${fixedCount} files.`);
