import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../src/ui/execute/index.jsx';
import { ModelCard, ModelDetail, NewModelModal } from '../../src/ui/ModelDetail.jsx';

const validModel = {
  id: 'model-1',
  name: 'Queue Model',
  description: 'A small queue.',
  visibility: 'private',
  owner_id: 'user-1',
  entityTypes: [
    { id: 'et_customer', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_server', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [],
    },
  ],
  cEvents: [],
  queues: [],
  updatedAt: '2026-05-04T10:00:00Z',
};

describe('accessibility pass', () => {
  it('opens model cards from the keyboard', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();

    render(<ModelCard model={validModel} profiles={[]} onOpen={onOpen} />);

    const card = screen.getByRole('button', { name: /open model queue model/i });
    await user.tab();
    expect(card).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('labels and focuses the new model modal fields', async () => {
    const user = userEvent.setup();
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /new model/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\. Queue with Reneging/i)).not.toBeInTheDocument();

    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    expect(screen.getByRole('dialog', { name: /name your model/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i)).toHaveFocus();
  });

  it('exposes selected state on model tabs', async () => {
    const user = userEvent.setup();

    render(
      <ModelDetail
        modelId="model-1"
        modelData={validModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-pressed', 'true');
    const tabs = screen.queryAllByRole('tab').map(tab => tab.textContent);
    expect(tabs).not.toContain('AI Designer');

    await user.click(screen.getByRole('button', { name: /^design$/i }));
    expect(screen.getByRole('button', { name: /^describe$/i })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getAllByRole('button', { name: /^run$/i })[0]);
    expect(screen.getAllByRole('button', { name: /^run$/i })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps Execute Run All discoverable and disabled with validation errors', () => {
    render(<ExecutePanel model={{ ...validModel, entityTypes: [{ id: 'bad', name: '', role: 'customer' }] }} modelId="model-1" userId="user-1" />);

    expect(screen.getAllByRole('button', { name: /blocker/i }).every(button => button.disabled)).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent(/needs attention/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/blockers to resolve before running/i);
  });

  it('does not mark the model dirty just for opening the Visual Designer', async () => {
    render(
      <ModelDetail
        modelId="model-1"
        modelData={validModel}
        initialTab="visual"
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    await screen.findByRole('button', { name: /^design$/i });
    expect(screen.queryByText(/Unsaved changes in this model/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('does not mark the model dirty when Execute writes the same experiment defaults back', async () => {
    render(
      <ModelDetail
        modelId="model-1"
        modelData={{
          ...validModel,
          experimentDefaults: { warmupPeriod: 0, maxSimTime: 500, replications: 1, terminationMode: 'time' },
        }}
        initialTab="execute"
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={{ isOwner: true, canEdit: true, userId: 'user-1' }}
      />
    );

    await screen.findAllByRole('button', { name: /^run$/i });
    await userEvent.setup().click(screen.getByRole('button', { name: /^setup$/i }));
    await screen.findByRole('button', { name: /edit setup/i });
    expect(screen.queryByText(/Unsaved changes in this model/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  }, 15000);
});
