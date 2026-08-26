import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelDetail } from '../../../src/ui/ModelDetail.jsx';

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

  it('shows an in-panel unsaved changes save action when the model is dirty', () => {
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

    expect(screen.getByText(/Unsaved changes in this model/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    // Accept the "Save anyway?" validation prompt
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));

    // Wait for setDirty(false) to flush — Save button disappears when dirty=false
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' })); // accept "Save anyway?"

    // Save is in flight (promise not yet resolved) — the model must still be
    // treated as dirty, so navigating away still warns the user.
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(within(await screen.findByRole('dialog')).getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    resolveSave();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' })); // accept "Save anyway?"

    expect(await screen.findByRole('alert')).toHaveTextContent('Database is unavailable');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(within(await screen.findByRole('dialog')).getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});
