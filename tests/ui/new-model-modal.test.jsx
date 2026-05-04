import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewModelModal } from '../../src/ui/ModelDetail.jsx';

describe('NewModelModal', () => {
  it('keeps Cancel and Create actions inside a two-column modal footer', () => {
    render(<NewModelModal onClose={vi.fn()} onCreate={vi.fn()} />);

    const cancel = screen.getByRole('button', { name: /cancel/i });
    const create = screen.getByRole('button', { name: /create/i });
    const footer = cancel.parentElement;

    expect(footer).toContainElement(create);
    expect(footer).toHaveStyle({
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
    });
  });
});
