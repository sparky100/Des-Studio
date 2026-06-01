/**
 * For files with multiple exported components, add `const { C, FONT } = useTheme();`
 * to every exported function that uses C. or FONT but doesn't already have useTheme().
 */
import { readFileSync, writeFileSync } from 'fs';

const files = [
  'src/ui/results/ResultsWorkspace.jsx',
  'src/ui/ModelLibrary.jsx',
  'src/ui/execute/SweepViews.jsx',
  'src/ui/execute/VisualView.jsx',
  'src/ui/editors/ModelDiffPreview.jsx',
];

for (const file of files) {
  let content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const output = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect an exported function declaration line
    const isFnDecl = /^export\s+(default\s+)?function\s+\w/.test(line) ||
                     /^export\s+(const|let)\s+\w+\s*=\s*(React\.memo\s*\(\s*)?\(/.test(line);

    if (isFnDecl) {
      // Collect the function body opening — find opening brace
      let fnHeaderLines = [line];
      let j = i;
      while (j < Math.min(i + 20, lines.length) && !lines[j].includes('{')) {
        j++;
        fnHeaderLines.push(lines[j]);
      }

      // Find the opening brace position
      const braceLineIdx = fnHeaderLines.findIndex(l => l.includes('{'));
      const absLine = i + braceLineIdx;

      if (braceLineIdx >= 0) {
        // Check if this function body already has useTheme()
        // Look at the next few lines after the brace for useTheme
        const lookahead = lines.slice(absLine + 1, absLine + 5).join('\n');
        const alreadyHasHook = lookahead.includes('useTheme()');

        if (!alreadyHasHook) {
          // Push lines up to and including the brace line
          for (let k = i; k <= absLine; k++) {
            output.push(lines[k]);
          }
          // Insert useTheme call after the opening brace line
          // Insert at the same indent level as the function body
          output.push('  const { C, FONT } = useTheme();');
          i = absLine + 1;
          continue;
        }
      }
    }

    output.push(line);
    i++;
  }

  const result = output.join('\n');
  writeFileSync(file, result, 'utf8');

  // Count useTheme after fix
  const count = (result.match(/useTheme\(\)/g) || []).length;
  const exports = (result.match(/^export\s+(default\s+)?function\s+\w|^export\s+(const|let)\s+\w+\s*=/mg) || []).length;
  console.log(`${file}: exports=${exports}, useTheme=${count}`);
}
