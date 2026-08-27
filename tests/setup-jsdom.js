import './setup-node.js';
import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // jsdom's localStorage/sessionStorage are tied to the environment, not to
  // any one test file — under vitest 3 the same jsdom environment can be
  // reused across files that land on the same worker, so a value one file's
  // component writes (e.g. BottomPanel.jsx's "des.bottomPanel.tab" preference)
  // can leak into a later, unrelated file's fresh render and change what it
  // defaults to. Clear both after every test, same rationale as clearAllMocks.
  globalThis.localStorage?.clear();
  globalThis.sessionStorage?.clear();
});

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom never runs layout, so offsetParent is hardcoded to always return
// null (https://github.com/jsdom/jsdom/issues/1590) — that breaks
// useFocusTrap.js's/FeedbackModal.jsx's getFocusable() filter
// (`el.offsetParent !== null`, used to skip display:none elements), which
// would otherwise treat every element as hidden and never autofocus or
// trap focus in tests. Approximate "visible" as "attached under a parent"
// instead, which is enough for jsdom-rendered dialog content. Guarded because
// this file is also loaded (via the `ui` project's setupFiles) by files that
// opt back out to the `node` environment with a `// @vitest-environment node`
// pragma (e.g. tests/ui/shared/workbook.test.js), which have no HTMLElement.
if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode; },
  });
}
