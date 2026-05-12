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

  it('labels and focuses the new model modal fields', () => {
    render(<NewModelModal onClose={vi.fn()} onCreate={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /new des model/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByLabelText('Description')).toBeInTheDocument();
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

    expect(screen.getByRole('tab', { name: 'AI Designer' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent);
    expect(tabs.indexOf('AI Designer')).toBeGreaterThan(tabs.indexOf('Overview'));
    expect(tabs.indexOf('Design')).toBeGreaterThan(tabs.indexOf('Overview'));

    await user.click(screen.getByRole('button', { name: /^execute$/i }));
    expect(screen.getByRole('button', { name: /^execute$/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps Execute Run All discoverable and disabled with validation errors', () => {
    render(<ExecutePanel model={{ ...validModel, entityTypes: [{ id: 'bad', name: '', role: 'customer' }] }} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: /run all/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/blocking error/i);
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

    await screen.findByRole('button', { name: /^execute$/i });
    await userEvent.setup().click(screen.getByRole('button', { name: /^setup$/i }));
    await screen.findByRole('button', { name: /edit setup/i });
    expect(screen.queryByText(/Unsaved changes in this model/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });
});
