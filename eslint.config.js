// Flat ESLint config — first linter on this codebase (adopted 2026-08, expert
// review C-3). Philosophy: correctness rules gate CI at "error"; style is not
// enforced (no formatter pass — a repo-wide reformat would destroy blame).
// react-hooks/exhaustive-deps stays at "warn": ~99 pre-existing useEffect
// sites are visible debt to burn down, not a merge blocker.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const correctnessRules = {
  // Empty catch blocks must be deliberate: annotate with a comment.
  'no-empty': ['error', { allowEmptyCatch: false }],
  'no-undef': 'error',
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
  // The codebase's dense style trips these stylistic defaults — off/soft.
  'no-irregular-whitespace': 'off',
  'no-control-regex': 'off',
  'no-prototype-builtins': 'off',
  'no-useless-escape': 'warn',
  'no-regex-spaces': 'warn',
  'no-cond-assign': ['error', 'except-parens'],
  'no-fallthrough': ['error', { commentPattern: 'fall.?through' }],
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/functions/**', 'docs/**', 'showcase-models/**', 'scripts/**', 'public/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'tests/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.es2021, vi: 'readonly', describe: 'readonly', it: 'readonly', test: 'readonly', expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly', beforeAll: 'readonly', afterAll: 'readonly' },
    },
    rules: correctnessRules,
  },
  {
    // React rules apply only where React lives. src/engine/ is pure JS by
    // architectural contract (AGENTS.md §3) — its use* helper functions are
    // not hooks, and react-hooks rules must not fire there.
    files: ['src/ui/**/*.{js,jsx}', 'src/App.jsx', 'src/main.jsx', 'tests/ui/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // God-component ratchet (expert review C-11). These two files have been
    // decomposed before and grown back (execute/index.jsx: 2,678 → 2,293
    // after sprint 55a → 3,540 by 2026-08). The limits below are each file's
    // size at ratchet time: growth fails CI, shrinking is free. CONTRACT:
    // never raise a limit — when an extraction lands, lower it to the new
    // line count in the same PR. New features must not add state here; put
    // new state in hooks (src/ui/execute/hooks/) or child components.
    files: ['src/ui/execute/index.jsx'],
    rules: { 'max-lines': ['error', { max: 3251, skipBlankLines: false, skipComments: false }] },
  },
  {
    files: ['src/ui/ModelDetail.jsx'],
    rules: { 'max-lines': ['error', { max: 2147, skipBlankLines: false, skipComments: false }] },
  },
];
