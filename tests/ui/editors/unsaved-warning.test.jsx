import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelDetail } from '../../../src/ui/ModelDetail.jsx';

// Exercise model saving and navigation independently of simulation setup.
vi.mock('../../../src/ui/execute/index.jsx', () => ({
  ExecutePanel: ({ onRunStateChange, onExperimentDefaultsChange }) => <>
    <button onClick={() => onExperimentDefaultsChange({ maxSimTime: 100 })}>Edit test settings</button>
    <button onClick={() => onRunStateChange(true)}>Start test run</button>
    <button onClick={() => onRunStateChange(false)}>Finish test run</button>
  </>,
}));

const mockModel = {
  id: 'm1',
  name: 'Test Model',
  description: '',
  visibility: 'private',
  access: {},
  entityTypes: [],
  stateVariables: [],
  bEvents: [],
  cEvents: [],
  queues: [],
  owner_id: 'user-1',
};

const makeOverrides = () => ({
  isOwner: true,
  canEdit: true,
  profiles: [],
  userId: 'user-1',
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onSetVisibility: vi.fn(),
  onSetAccess: vi.fn(),
});

describe('ModelDetail — unsaved-change warning (F2.8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Back button navigates immediately when model has no unsaved changes', () => {
    const onBack = vi.fn();
    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={onBack}
        onRefresh={vi.fn()}
        overrides={makeOverrides()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('Back button shows confirm dialog when model has unsaved changes', async () => {
    const onBack = vi.fn();
    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={onBack}
        onRefresh={vi.fn()}
        overrides={makeOverrides()}
      />
    );

    // Change the model name to set dirty=true
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Changed Name' } });

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    expect(within(await screen.findByRole('dialog')).getByText(/unsaved changes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onBack).not.toHaveBeenCalled();
  });

  it('shows exactly one unsaved changes indicator and save action in the header', () => {
    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={makeOverrides()}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Changed Name' } });

    expect(screen.getAllByText(/^Unsaved changes$/i)).toHaveLength(1);
    expect(screen.queryByText(/Unsaved changes in this model/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Save model$/i })).toHaveLength(1);
  });

  it('requires confirmation before discarding and lets Cancel preserve the edit', () => {
    render(<ModelDetail modelId="m1" modelData={mockModel} onBack={vi.fn()} onRefresh={vi.fn()} overrides={makeOverrides()} />);
    const input = screen.getAllByRole('textbox')[0];
    fireEvent.change(input, { target: { value: 'Keep this edit' } });
    fireEvent.click(screen.getByRole('button', { name: /Discard/ }));
    expect(input).toHaveValue('Keep this edit');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(input).toHaveValue('Keep this edit');
    expect(screen.queryByRole('button', { name: 'Confirm discard' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Discard/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm discard' }));
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Test Model');
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('keeps exactly one save action at the top while a run hides the main header', () => {
    render(<ModelDetail initialTab="execute" modelId="m1" modelData={mockModel} onBack={vi.fn()} onRefresh={vi.fn()} overrides={makeOverrides()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit test settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start test run' }));
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('Unsaved changes')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Save model' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Finish test run' }));
    expect(screen.getByRole('button', { name: /Back/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save model' })).toHaveLength(1);
  });

  it('retries a failed save and clears the error only after saving successfully', async () => {
    const overrides = makeOverrides();
    overrides.onSave.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({});
    render(<ModelDetail modelId="m1" modelData={mockModel} onBack={vi.fn()} onRefresh={vi.fn()} overrides={overrides} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Retry this edit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save model' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Model couldn't be saved");
    expect(screen.getAllByRole('textbox')[0]).toHaveValue('Retry this edit');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('Back button navigates when user confirms leaving with unsaved changes', async () => {
    const onBack = vi.fn();
    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={onBack}
        onRefresh={vi.fn()}
        overrides={makeOverrides()}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Changed Name' } });

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
  });

  it('Back button does NOT show confirm dialog after saving', async () => {
    // The blank fixture model has blocking validation errors, so save() asks
    // "Save anyway?" via the shared ConfirmDialog — accept that prompt; the
    // assertion below is only about the Back button's unsaved-changes confirm.
    const onBack = vi.fn();
    const onRefresh = vi.fn();
    const overrides = makeOverrides();
    overrides.onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={onBack}
        onRefresh={onRefresh}
        overrides={overrides}
      />
    );

    // Make a change
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'New Name' } });

    // Save — finds the Save button (only visible when dirty)
    fireEvent.click(screen.getByRole('button', { name: /^Save model$/ }));

    // Accept the "Save anyway?" validation prompt
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    // Wait for setDirty(false) to flush — Save button disappears when dirty=false
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Save model$/ })).not.toBeInTheDocument()
    );

    // Back should now navigate without an unsaved-changes confirm
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('Back button still shows confirm dialog while a save is in flight (fire-and-forget save must not clear dirty early)', async () => {
    // Accept the "Save anyway?" validation prompt but decline the Back
    // button's unsaved-changes confirm.
    const onBack = vi.fn();
    const overrides = makeOverrides();
    let resolveSave;
    overrides.onSave = vi.fn(() => new Promise(resolve => { resolveSave = resolve; }));

    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={onBack}
        onRefresh={vi.fn()}
        overrides={overrides}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save model$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' })); // accept "Save anyway?"

    expect(await screen.findByText('Saving model…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    // Save is in flight (promise not yet resolved) — the model must still be
    // treated as dirty, so navigating away still warns the user.
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(within(await screen.findByRole('dialog')).getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    resolveSave();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Save model$/ })).not.toBeInTheDocument()
    );
  });

  it('keeps changes dirty and shows an error when saving fails', async () => {
    // Accept the "Save anyway?" validation prompt but decline the Back
    // button's unsaved-changes confirm.
    const onBack = vi.fn();
    const overrides = makeOverrides();
    overrides.onSave = vi.fn().mockRejectedValue(new Error('Database is unavailable'));

    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={onBack}
        onRefresh={vi.fn()}
        overrides={overrides}
      />
    );

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save model$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' })); // accept "Save anyway?"

    expect(await screen.findByRole('alert')).toHaveTextContent("Model couldn't be saved. Your changes are still here.");
    expect(screen.getByRole('alert')).toHaveAttribute('title', 'Database is unavailable');
    expect(screen.getByRole('button', { name: /^Retry$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(within(await screen.findByRole('dialog')).getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});
