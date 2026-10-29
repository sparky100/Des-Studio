import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelTabBar } from '../../src/ui/ModelTabBar.jsx';

// The Evidence tab sits in Design's Define sub-bar. It was filtered out of
// the desktop Design bar, so it could only be reached from the Draw
// inspector's "Open in Evidence tab" link.
describe('ModelTabBar — Evidence in Define', () => {
  const designMode = {
    id: 'design', label: 'Design', primaryTab: 'visual',
    tabs: ['visual', 'entities', 'goals', 'evidence', 'validate'],
  };
  const tabs = [
    { id: 'visual', label: 'Draw' },
    { id: 'entities', label: 'Entity Types' },
    { id: 'goals', label: 'Goals' },
    { id: 'evidence', label: 'Evidence' },
  ];
  const renderBar = (tab, setTab = vi.fn()) => render(
    <ModelTabBar
      tab={tab}
      setTab={setTab}
      DISPLAY_MODES={[designMode]}
      activeMode={designMode}
      visibleSelectableTabs={tabs}
      validation={{ errors: [], warnings: [] }}
      tabIssueCounts={{}}
      isCompactLayout={false}
      showMoreTabs={false}
      setShowMoreTabs={vi.fn()}
    />
  );

  it('shows Evidence in the Define sub-bar', () => {
    const setTab = vi.fn();
    renderBar('entities', setTab);
    fireEvent.click(screen.getByRole('button', { name: /^evidence$/i }));
    expect(setTab).toHaveBeenCalledWith('evidence');
  });

  it('keeps Define highlighted while Evidence is open', () => {
    renderBar('evidence');
    expect(screen.getByRole('button', { name: /define/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^evidence$/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
