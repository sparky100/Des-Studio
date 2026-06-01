import { readFileSync, writeFileSync } from 'fs';
import { dirname, relative } from 'path';

const files = [
  'src/ui/editors/AiGeneratedModelPanel.jsx',
  'src/ui/ModelDetail.jsx',
  'src/ui/visual-designer/VisualDesignerPanel.jsx',
  'src/ui/results/ResultsWorkspace.jsx',
  'src/ui/visual-designer/VisualNodeInspector.jsx',
  'src/ui/visual-designer/FlowDiagramReactFlow.jsx',
  'src/ui/execute/BottomPanel.jsx',
  'src/ui/execute/AdaptiveBatchPanel.jsx',
  'src/ui/ModelDetailHeader.jsx',
  'src/ui/ModelHistoryTab.jsx',
  'src/ui/execute/index.jsx',
  'src/ui/AdminPanel.jsx',
  'src/ui/editors/BEventEditor.jsx',
  'src/ui/execute/AiAssistantPanel.jsx',
  'src/ui/editors/ScheduleManager.jsx',
  'src/ui/ModelTabBar.jsx',
  'src/ui/execute/DiagnosticsTab.jsx',
  'src/ui/editors/QueueEditor.jsx',
  'src/ui/editors/EntityTypeEditor.jsx',
  'src/ui/editors/CEventEditor.jsx',
  'src/ui/ModelLibrary.jsx',
  'src/ui/execute/SweepViews.jsx',
  'src/ui/execute/ExperimentControls.jsx',
  'src/ui/ModelHealthPanel.jsx',
  'src/ui/AboutModal.jsx',
  'src/ui/editors/ConditionBuilder.jsx',
  'src/ui/execute/ExecuteCanvas.jsx',
  'src/ui/execute/VisualView.jsx',
  'src/ui/execute/LogViewer.jsx',
  'src/ui/FeedbackModal.jsx',
  'src/ui/ImportPreview.jsx',
  'src/ui/AuthShell.jsx',
  'src/ui/editors/helpers.jsx',
  'src/ui/editors/GoalsEditor.jsx',
  'src/ui/HelpAssistant.jsx',
  'src/ui/editors/ModelDiffPreview.jsx',
  'src/ui/editors/EntityFilterBuilder.jsx',
  'src/ui/VersionHistoryPanel.jsx',
  'src/ui/share/DashboardView.jsx',
  'src/ui/editors/StateVarEditor.jsx',
  'src/ui/editors/AttrEditor.jsx',
  'src/ui/shared/KeyboardShortcutsModal.jsx',
  'src/ui/shared/SkeletonPanel.jsx',
  'src/ui/shared/DistSparkline.jsx',
  'src/ui/SaveBanner.jsx',
  'src/ui/CsvImportModal.jsx',
  'src/ui/editors/ContainerEditor.jsx',
  'src/ui/execute/ExecuteActivityNode.jsx',
  'src/ui/execute/ExecuteSinkNode.jsx',
  'src/ui/execute/ExecuteQueueNode.jsx',
  'src/ui/execute/ExecuteSourceNode.jsx',
];

const themeContextSrc = 'src/ui/shared/ThemeContext.jsx';

function getThemeCtxImportPath(filePath) {
  const dir = dirname(filePath);
  let rel = relative(dir, themeContextSrc).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

let processed = 0;
const errors = [];

for (const file of files) {
  try {
    let content = readFileSync(file, 'utf8');
    const themeCtxPath = getThemeCtxImportPath(file);

    // Step 1: Remove C and FONT from tokens.js imports
    content = content.replace(
      /import \{([^}]+)\} from (['"])([^'"]*tokens\.js)\2/g,
      (match, imports, q, modPath) => {
        const parts = imports.split(',').map(s => s.trim()).filter(Boolean);
        const remaining = parts.filter(s => s !== 'C' && s !== 'FONT');
        if (remaining.length === 0) return '';
        return `import { ${remaining.join(', ')} } from ${q}${modPath}${q}`;
      }
    );

    // Remove lines that are now just whitespace (from removed imports)
    content = content.replace(/^[ \t]*\n/gm, (m, offset) => {
      // Only remove if it's a completely empty line introduced by removing an import
      return m;
    });

    // Step 2: Add useTheme import after last import statement (if not already there)
    if (!content.includes('useTheme')) {
      // Find the last import line
      const lines = content.split('\n');
      let lastImportLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i])) lastImportLine = i;
      }
      if (lastImportLine >= 0) {
        lines.splice(lastImportLine + 1, 0, `import { useTheme } from "${themeCtxPath}";`);
        content = lines.join('\n');
      }
    }

    // Step 3: Add `const { C, FONT } = useTheme();` inside the first component function body
    // Only if the file actually uses C. or FONT
    const usesC = /\bC\.\w+/.test(content);
    const usesFONT = /\bFONT\b/.test(content);

    if (usesC || usesFONT) {
      // Find the first line that opens a function/component body:
      // - export default function X( ... ) {
      // - export function X( ... ) {
      // - const X = (...) => {
      // - const X = React.memo((...) => {
      // - function X( ... ) {
      const lines = content.split('\n');
      let inserted = false;

      for (let i = 0; i < lines.length && !inserted; i++) {
        const line = lines[i];
        const isFnDecl = /^export\s+(default\s+)?function\s+\w/.test(line) ||
                         /^function\s+\w/.test(line) ||
                         /^(export\s+)?(const|let)\s+\w+\s*=\s*(React\.memo\s*\(\s*)?\(/.test(line);

        if (isFnDecl && line.includes('{')) {
          // Insert after the opening brace
          const braceIdx = line.lastIndexOf('{');
          lines[i] = line.slice(0, braceIdx + 1) + '\n  const { C, FONT } = useTheme();' + line.slice(braceIdx + 1);
          inserted = true;
        } else if (isFnDecl && !line.includes('{')) {
          // Multi-line function signature — find the next line with {
          for (let j = i + 1; j < Math.min(i + 10, lines.length) && !inserted; j++) {
            if (lines[j].includes('{')) {
              const braceIdx = lines[j].indexOf('{');
              lines[j] = lines[j].slice(0, braceIdx + 1) + '\n  const { C, FONT } = useTheme();' + lines[j].slice(braceIdx + 1);
              inserted = true;
            }
          }
        }
      }

      if (!inserted) {
        console.warn(`  WARN: Could not find insert point in ${file}`);
      }

      content = lines.join('\n');
    }

    writeFileSync(file, content, 'utf8');
    processed++;
    console.log(`OK: ${file}`);
  } catch (e) {
    errors.push({ file, error: e.message });
    console.error(`ERROR: ${file}: ${e.message}`);
  }
}

console.log(`\nProcessed: ${processed}/${files.length}`);
if (errors.length) {
  console.log('Errors:', errors.map(e => `${e.file}: ${e.error}`).join('\n'));
}
