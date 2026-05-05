import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueueEditor } from '../../../src/ui/editors/index.jsx';

describe('QueueEditor', () => {
  it('describes named queues and customer binding without implicit queue copy', () => {
    render(
      <QueueEditor
        queues={[]}
        entityTypes={[{ id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] }]}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Configure named waiting lines/i)).toBeInTheDocument();
    expect(screen.getByText(/only compatible entity-to-queue combinations/i)).toBeInTheDocument();
    expect(screen.queryByText(/implicit per-customer queue/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No named queues yet/i)).toBeInTheDocument();
  });
});
