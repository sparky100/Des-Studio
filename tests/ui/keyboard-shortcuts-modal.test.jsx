import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppNavBar } from '../../src/ui/AppNavBar.jsx';
import { KeyboardShortcutsModal } from '../../src/ui/shared/KeyboardShortcutsModal.jsx';

describe('KeyboardShortcutsModal reachability (Sprint 93.1)', () => {
  it('opens from the account menu "Keyboard shortcuts" item, rendered via AppNavBar (model-detail context)', () => {
    render(
      <AppNavBar
        profile={{ full_name: 'Test User', initials: 'TU' }}
        isAdmin={false}
        onHelpOpen={vi.fn()}
        onSettings={vi.fn()}
        onAdmin={vi.fn()}
        onSignOut={vi.fn()}
        userId="user-1"
        currentPage="model-detail"
      />
    );

    // Modal is not open yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Open the ••• account menu.
    fireEvent.click(screen.getByRole('button', { name: /more options/i }));

    const menu = screen.getByRole('menu', { name: /account menu/i });
    const shortcutsItem = within(menu).getByRole('menuitem', { name: /keyboard shortcuts/i });
    fireEvent.click(shortcutsItem);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/keyboard shortcuts/i)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal onClose={onClose} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not contradict real bindings: no false claim that "?" opens this modal, and covers Ctrl+Y / Delete-Backspace / arrow-key nudge', () => {
    render(<KeyboardShortcutsModal onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');

    // "?" is documented as opening the Help Assistant, not this modal.
    expect(within(dialog).getByText(/open help assistant/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/show this keyboard shortcuts list/i)).not.toBeInTheDocument();

    // Redo alias, delete variants, and arrow-key nudge are all listed.
    expect(within(dialog).getByText(/redo last undone edit \(alias\)/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Y')).toBeInTheDocument();
    expect(within(dialog).getByText('Backspace')).toBeInTheDocument();
    expect(within(dialog).getByText(/nudge selected node/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Arrow keys')).toBeInTheDocument();
  });
});
