// ResponsivePanel — anchored popover on wide screens, bottom sheet on phones.
// Regression for the Run tab "Adjust parameters" panel that hung off the left
// edge of a ~412px phone screen (right-anchored 360px panel, button near x=0).
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computePopoverPosition, ResponsivePanel } from '../../../src/ui/shared/ResponsivePanel.jsx';
import { ParamBrowserPanel } from '../../../src/ui/shared/ParamBrowserPanel.jsx';
import { ThemeProvider } from '../../../src/ui/shared/ThemeContext.jsx';

// Phone sizes from the bug report, portrait and landscape; then tablet/desktop.
const PORTRAIT = [[360, 740], [390, 844], [412, 915]];
const LANDSCAPE = PORTRAIT.map(([w, h]) => [h, w]);
const PHONES = [...PORTRAIT, ...LANDSCAPE];
const WIDE = [[768, 1024], [1024, 768], [1280, 800]];

function setViewport(width, height, visualViewport = null) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
  // Evaluates "(max-width: Npx), (max-height: Npx)" lists like a browser would.
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => {
    const matches = query.split(',').some(part => {
      const w = /max-width:\s*(\d+)px/.exec(part);
      const h = /max-height:\s*(\d+)px/.exec(part);
      return (w && width <= Number(w[1])) || (h && height <= Number(h[1])) || false;
    });
    return { matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  }));
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: visualViewport && { ...visualViewport, addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
}

const PARAMS = [
  { path: 'a', label: 'Number of Berths at Atlantic Container Terminal', type: 'entityTypeCount', currentValue: 320 },
  { path: 'b', label: 'Number of Cranes at Pacific Bulk Terminal', type: 'entityTypeCount', currentValue: 145 },
  { path: 'c', label: 'Number of Gates at North America Terminal', type: 'entityTypeCount', currentValue: 240 },
];

// The anchor stands in for the toolbar button; tests that need a position mock its rect.
function Harness() {
  const ref = useRef(null);
  const [open, setOpen] = useState(true);
  return (
    <ThemeProvider>
      <div ref={ref} data-testid="anchor" />
      <button type="button" onClick={() => setOpen(true)}>reopen</button>
      <ResponsivePanel open={open} onClose={() => setOpen(false)} anchorRef={ref} title="Adjust parameters" testId="panel"
        footer={<button type="button">Reset all</button>}>
        <ParamBrowserPanel params={PARAMS} onSelect={() => {}} onClose={() => {}} fillContainer />
      </ResponsivePanel>
    </ThemeProvider>
  );
}

function mockAnchorRect(rect) {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.dataset?.testid === 'anchor') return { ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top, x: rect.left, y: rect.top, toJSON() {} };
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('computePopoverPosition', () => {
  it('keeps a right-aligned panel inside the viewport when the anchor is at the left edge', () => {
    const pos = computePopoverPosition({ left: 16, right: 150, top: 200, bottom: 230 }, { width: 1024, height: 800 }, { width: 420 });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + pos.width).toBeLessThanOrEqual(1024 - 8);
    expect(pos.width).toBe(420);
  });

  it('shifts left when the panel would run off the right edge', () => {
    const pos = computePopoverPosition({ left: 900, right: 1010, top: 50, bottom: 80 }, { width: 1024, height: 800 }, { width: 420, align: 'start' });
    expect(pos.left + pos.width).toBeLessThanOrEqual(1024 - 8);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it.each([360, 390, 412])('caps the width at 100vw − 16px (%ipx)', vw => {
    const pos = computePopoverPosition({ left: 10, right: 40, top: 10, bottom: 40 }, { width: vw, height: 800 }, { width: 420 });
    expect(pos.width).toBe(vw - 16);
    expect(pos.left).toBe(8);
  });

  it('opens above the anchor when there is too little room below', () => {
    const pos = computePopoverPosition({ left: 100, right: 200, top: 700, bottom: 730 }, { width: 1024, height: 800 }, { width: 300 });
    expect(pos.placement).toBe('above');
    expect(pos.bottom).toBe(800 - 700 + 6);
    expect(pos.maxHeight).toBe(700 - 6 - 8);
  });

  it('stays below when there is room', () => {
    const pos = computePopoverPosition({ left: 100, right: 200, top: 100, bottom: 130 }, { width: 1024, height: 800 }, { width: 300 });
    expect(pos.placement).toBe('below');
    expect(pos.top).toBe(136);
    expect(pos.maxHeight).toBe(800 - 130 - 6 - 8);
  });
});

describe('ResponsivePanel on phones (bottom sheet)', () => {
  it.each(PHONES)('renders a full-width bottom sheet at %ix%i (portrait and landscape)', (w, h) => {
    setViewport(w, h);
    render(<Harness />);
    const sheet = screen.getByRole('dialog', { name: 'Adjust parameters' });
    expect(sheet.dataset.layout).toBe('sheet');
    expect(sheet.style.position).toBe('fixed');
    expect(sheet.style.left).toBe('0px');
    expect(sheet.style.right).toBe('0px');
    expect(sheet.style.bottom).toBe('0px');
    expect(parseFloat(sheet.style.maxHeight)).toBeLessThanOrEqual(h * 0.85);
    // Header (title + Done), search and footer are all present.
    expect(screen.getByText('Adjust parameters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/filter parameters/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset all' })).toBeInTheDocument();
  });

  it('shows full parameter names (no ellipsis truncation)', () => {
    setViewport(412, 915);
    render(<Harness />);
    const label = screen.getByText('Number of Berths at Atlantic Container Terminal');
    expect(label.style.textOverflow).toBe('');
    expect(label.style.whiteSpace).toBe('');
    expect(label.style.overflowWrap).toBe('anywhere');
  });

  it('pins the search to the top of the sheet scroll area and drops the nested scroll box', () => {
    setViewport(390, 844);
    render(<Harness />);
    const search = screen.getByPlaceholderText(/filter parameters/i);
    expect(search.parentElement.style.position).toBe('sticky');
    expect(search.parentElement.style.top).toBe('0px');
    expect(screen.getByTestId('param-browser-results').style.maxHeight).toBe('');
    // 16px input text: iOS Safari doesn't zoom the page on focus.
    expect(search.style.fontSize).toBe('16px');
  });

  it('closes from the backdrop, Done and Escape', () => {
    setViewport(360, 740);
    render(<Harness />);
    fireEvent.click(screen.getByTestId('panel-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('reopen'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('reopen'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(PHONES)('sits above the on-screen keyboard while typing in the search (%ix%i)', (w, h) => {
    // Keyboard covers the bottom ~45% (portrait) / ~60% (landscape) of the layout viewport.
    const visible = Math.round(h * (h > w ? 0.55 : 0.4));
    setViewport(w, h, { width: w, height: visible, offsetTop: 0 });
    render(<Harness />);
    const search = screen.getByPlaceholderText(/filter parameters/i);
    search.focus();
    fireEvent.change(search, { target: { value: 'berths' } });
    const sheet = screen.getByRole('dialog', { name: 'Adjust parameters' });
    expect(parseFloat(sheet.style.bottom)).toBe(h - visible);
    expect(parseFloat(sheet.style.maxHeight)).toBeLessThanOrEqual(visible);
    // No home-indicator padding on top of the keyboard.
    expect(sheet.style.paddingBottom).toBe('0px');
    // Footer gives its room to the list while typing.
    expect(screen.queryByRole('button', { name: 'Reset all' })).not.toBeInTheDocument();
    // The search stays pinned at the top of the scroll area.
    expect(search.parentElement.style.position).toBe('sticky');
    expect(screen.getByText('Number of Berths at Atlantic Container Terminal')).toBeInTheDocument();
    expect(screen.queryByText('Number of Cranes at Pacific Bulk Terminal')).not.toBeInTheDocument();
  });
});

describe('ResponsivePanel on wider screens (anchored popover)', () => {
  it.each(WIDE)('renders a popover clamped inside the viewport at %ix%i', (w, h) => {
    setViewport(w, h);
    mockAnchorRect({ left: 16, right: 150, top: 60, bottom: 90 });
    render(<Harness />);
    const pop = screen.getByRole('dialog', { name: 'Adjust parameters' });
    expect(pop.dataset.layout).toBe('popover');
    const left = parseFloat(pop.style.left);
    const width = parseFloat(pop.style.width);
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(w - 8);
    expect(width).toBeLessThanOrEqual(Math.min(420, w - 16));
    expect(pop.style.visibility).toBe('visible');
  });

  it('keeps the panel on screen when the button is at the right edge', () => {
    setViewport(1024, 768);
    mockAnchorRect({ left: 980, right: 1016, top: 60, bottom: 90 });
    render(<Harness />);
    const pop = screen.getByRole('dialog', { name: 'Adjust parameters' });
    expect(parseFloat(pop.style.left) + parseFloat(pop.style.width)).toBeLessThanOrEqual(1024 - 8);
  });

  it('flips above a button near the bottom of the viewport', () => {
    setViewport(1280, 600);
    mockAnchorRect({ left: 600, right: 760, top: 500, bottom: 530 });
    render(<Harness />);
    const pop = screen.getByRole('dialog', { name: 'Adjust parameters' });
    expect(pop.dataset.placement).toBe('above');
    expect(parseFloat(pop.style.maxHeight)).toBe(500 - 6 - 8);
  });
});
