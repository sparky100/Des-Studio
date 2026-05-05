import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelCard } from '../../src/ui/ModelDetail.jsx';

const baseModel = {
  id: 'model-1',
  name: 'Queue Model',
  description: 'A small queue.',
  visibility: 'private',
  owner_id: 'user-1',
  entityTypes: [],
  bEvents: [],
  cEvents: [],
  updatedAt: '2026-05-04T10:00:00Z',
};

const profiles = [{ id: 'user-1', full_name: 'Simon', initials: 'S', color: '#22d3ee' }];

describe('ModelCard run stats', () => {
  it('renders a non-zero run count when stats are provided', () => {
    render(<ModelCard model={{ ...baseModel, stats: { runs: 3 } }} profiles={profiles} onOpen={vi.fn()} />);

    expect(screen.getByText('3 runs')).toBeInTheDocument();
  });

  it('shows neutral placeholders while stats load or fail', () => {
    const { rerender } = render(<ModelCard model={{ ...baseModel, statsLoading: true }} profiles={profiles} onOpen={vi.fn()} />);

    expect(screen.getByText('— runs')).toBeInTheDocument();

    rerender(<ModelCard model={{ ...baseModel, statsError: true, stats: { runs: null } }} profiles={profiles} onOpen={vi.fn()} />);
    expect(screen.getByText('runs —')).toBeInTheDocument();
  });

  it('does not show a separate server resource summary tag', () => {
    render(<ModelCard model={{
      ...baseModel,
      entityTypes: [
        { id: 'patient', name: 'Patient', role: 'customer' },
        { id: 'nurse', name: 'Triage Nurse', role: 'server', count: 2 },
        { id: 'doctor', name: 'Consultant', role: 'server', count: 1 },
      ],
    }} profiles={profiles} onOpen={vi.fn()} />);

    expect(screen.queryByText(/resources across/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Triage Nurse, Consultant/i)).not.toBeInTheDocument();
  });
});
