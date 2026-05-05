import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('Back button shows confirm dialog when model has unsaved changes', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
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

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining('unsaved changes')
    );
    expect(onBack).not.toHaveBeenCalled();
  });

  it('Back button navigates when user confirms leaving with unsaved changes', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

    expect(onBack).toHaveBeenCalledOnce();
  });

  it('Back button does NOT show confirm dialog after saving', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
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

    // Wait for setDirty(false) to flush — Save button disappears when dirty=false
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument()
    );

    // Back should now navigate without a confirm
    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('keeps changes dirty and shows an error when saving fails', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
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

    expect(await screen.findByRole('alert')).toHaveTextContent('Database is unavailable');
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('unsaved changes'));
    expect(onBack).not.toHaveBeenCalled();
  });
});
