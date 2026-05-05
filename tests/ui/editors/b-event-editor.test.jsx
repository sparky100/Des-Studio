import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BEventEditor } from '../../../src/ui/editors/index.jsx';

describe('BEventEditor — queue-aware effect options', () => {
  it('only offers ARRIVE actions for queues that accept the selected customer type', () => {
    render(
      <BEventEditor
        events={[{ id: 'b1', name: 'Arrival', scheduledTime: '0', effect: [''], schedules: [], description: '' }]}
        onChange={vi.fn()}
        entityTypes={[
          { id: 'patient', name: 'Patient', role: 'customer', attrDefs: [] },
          { id: 'specimen', name: 'Specimen', role: 'customer', attrDefs: [] },
        ]}
        queues={[
          { id: 'triage', name: 'Triage Queue', customerType: 'Patient', discipline: 'FIFO' },
          { id: 'lab', name: 'Lab Queue', customerType: 'Specimen', discipline: 'FIFO' },
        ]}
        cEvents={[]}
      />
    );

    expect(screen.getByRole('option', { name: 'Add Patient to Triage Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Add Patient to Lab Queue' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Add Specimen to Lab Queue' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Add Specimen to Triage Queue' })).not.toBeInTheDocument();
  });
});
