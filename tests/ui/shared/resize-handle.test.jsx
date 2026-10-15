// Resizable Draw inspector — the shared width hook and its drag handle.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResizeHandle, useResizableWidth } from '../../../src/ui/shared/ResizeHandle.jsx';

function Harness({ storageKey = 'test.width' }) {
  const size = useResizableWidth({ storageKey, defaultWidth: 280, min: 240, max: 640 });
  return (
    <div style={{ position: 'relative', width: size.width }} data-testid="panel">
      <ResizeHandle {...size} label="Resize panel" />
    </div>
  );
}

afterEach(() => { localStorage.clear(); });

describe('ResizeHandle', () => {
  it('starts at the default width and exposes it as a separator value', () => {
    render(<Harness />);
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    expect(handle).toHaveAttribute('aria-valuenow', '280');
    expect(handle).toHaveAttribute('aria-valuemin', '240');
    expect(handle).toHaveAttribute('aria-valuemax', '640');
  });

  it('widens with ArrowLeft, narrows with ArrowRight, and clamps at Home/End', () => {
    render(<Harness />);
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(handle).toHaveAttribute('aria-valuenow', '296');
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true });
    expect(handle).toHaveAttribute('aria-valuenow', '360');
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(handle).toHaveAttribute('aria-valuenow', '344');
    fireEvent.keyDown(handle, { key: 'Home' });
    expect(handle).toHaveAttribute('aria-valuenow', '640');
    fireEvent.keyDown(handle, { key: 'End' });
    expect(handle).toHaveAttribute('aria-valuenow', '240');
  });

  it('dragging left widens the panel; double-click resets it', () => {
    render(<Harness />);
    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    fireEvent.pointerDown(handle, { button: 0, clientX: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 400, pointerId: 1 });
    expect(handle).toHaveAttribute('aria-valuenow', '380');
    expect(screen.getByTestId('panel').style.width).toBe('380px');
    fireEvent.doubleClick(handle);
    expect(handle).toHaveAttribute('aria-valuenow', '280');
  });

  it('remembers the width across mounts and clamps a stale saved value', () => {
    const { unmount } = render(<Harness />);
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' });
    unmount();
    render(<Harness />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '640');
    localStorage.setItem('other.width', '9999');
    render(<Harness storageKey="other.width" />);
    expect(screen.getAllByRole('separator')[1]).toHaveAttribute('aria-valuenow', '640');
  });
});
