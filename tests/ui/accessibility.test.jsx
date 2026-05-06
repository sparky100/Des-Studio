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

    expect(screen.getByRole('tab', { name: 'Use AI' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent);
    expect(tabs.indexOf('Use AI')).toBeGreaterThan(tabs.indexOf('Overview'));
    expect(tabs.indexOf('Visual Designer')).toBeGreaterThan(tabs.indexOf('Use AI'));

    await user.click(screen.getByRole('tab', { name: /execute/i }));
    expect(screen.getByRole('tab', { name: /execute/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps Execute Run All discoverable and disabled with validation errors', () => {
    render(<ExecutePanel model={{ ...validModel, entityTypes: [{ id: 'bad', name: '', role: 'customer' }] }} modelId="model-1" userId="user-1" />);

    expect(screen.getByRole('button', { name: /run all/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/blocking error/i);
  });
});
