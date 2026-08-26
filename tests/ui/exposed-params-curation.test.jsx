// Owner-side curation of exposedParams (Business view section, Access tab).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelDetail } from '../../src/ui/ModelDetail.jsx';

const baseModel = {
  id: 'm1',
  name: 'Bank Branch',
  description: 'Branch staffing model',
  visibility: 'private',
  access: {},
  entityTypes: [
    { id: 'et-teller', name: 'Teller', role: 'server', count: '2' },
    { id: 'et-cust', name: 'Customer', role: 'customer', count: '0' },
  ],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [{ id: 'q-main', name: 'Main Queue', customerType: 'Customer', capacity: '10' }],
  owner_id: 'user-1',
};

const renderDetail = (modelData = baseModel, onSave = vi.fn()) => {
  render(
    <ModelDetail
      modelId="m1"
      modelData={modelData}
      onBack={vi.fn()}
      onRefresh={vi.fn()}
      overrides={{
        isOwner: true,
        canEdit: true,
        profiles: [],
        userId: 'user-1',
        onSave,
        onDelete: vi.fn(),
        onSetVisibility: vi.fn(),
        onSetAccess: vi.fn(),
      }}
    />
  );
  return onSave;
};

const openAccessTab = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^access$/i }));
  await screen.findByText('Business view');
};

describe('Business view curation (exposedParams)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a sweepable parameter via the picker and saves it in exposedParams', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderDetail(baseModel, onSave);
    await openAccessTab();

    const picker = screen.getByRole('combobox', { name: /add an adjustable setting/i });
    fireEvent.change(picker, { target: { value: 'entityTypes.et-teller.count' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // Row appears with the technical label and a business-name input
    expect(screen.getByText(/Number of Teller — currently 2/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: /business-friendly name for number of teller/i }), {
      target: { value: 'How many tellers' },
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: /minimum for number of teller/i }), {
      target: { value: '1' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    // The minimal fixture has validation errors, so save() asks "Save anyway?"
    // via the shared ConfirmDialog — accept it.
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][0];
    expect(saved.exposedParams).toEqual([
      { path: 'entityTypes.et-teller.count', businessLabel: 'How many tellers', min: 1 },
    ]);
  });

  it('flags a stored entry whose target no longer exists and removes it on click', async () => {
    renderDetail({
      ...baseModel,
      exposedParams: [
        { path: 'entityTypes.et-deleted.count', businessLabel: 'Old knob' },
        { path: 'queues.q-main.capacity' },
      ],
    });
    await openAccessTab();

    expect(screen.getByText(/Old knob — this setting no longer exists in the model/)).toBeInTheDocument();
    // The live entry renders normally
    expect(screen.getByText(/Main Queue — maximum capacity — currently 10/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove missing setting old knob/i }));
    expect(screen.queryByText(/Old knob/)).not.toBeInTheDocument();
  });

  it('excludes already-exposed parameters from the picker options', async () => {
    renderDetail({ ...baseModel, exposedParams: [{ path: 'entityTypes.et-teller.count' }] });
    await openAccessTab();

    const picker = screen.getByRole('combobox', { name: /add an adjustable setting/i });
    const options = Array.from(picker.querySelectorAll('option')).map(o => o.value);
    expect(options).not.toContain('entityTypes.et-teller.count');
    expect(options).toContain('queues.q-main.capacity');
  });
});
