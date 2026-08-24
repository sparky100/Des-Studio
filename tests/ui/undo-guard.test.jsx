import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ModelDetail } from '../../src/ui/ModelDetail.jsx';

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

describe('ModelDetail — Ctrl+Z editable-element guard', () => {
  it('does not revert the model when Ctrl+Z fires inside a focused input', () => {
    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={makeOverrides()}
      />
    );

    const input = screen.getAllByRole('textbox')[0];
    fireEvent.change(input, { target: { value: 'Changed Name' } });
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });

    // The model-level undo must not have fired: the edit survives (dirty UI stays).
    expect(input.value).toBe('Changed Name');
    expect(screen.getByText(/Unsaved changes in this model/i)).toBeInTheDocument();
  });

  it('still undoes the model edit when Ctrl+Z fires with focus outside editable elements', () => {
    render(
      <ModelDetail
        modelId="m1"
        modelData={mockModel}
        onBack={vi.fn()}
        onRefresh={vi.fn()}
        overrides={makeOverrides()}
      />
    );

    const input = screen.getAllByRole('textbox')[0];
    fireEvent.change(input, { target: { value: 'Changed Name' } });
    input.blur();
    document.body.tabIndex = -1;
    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    fireEvent.keyDown(document, { key: 'z', ctrlKey: true });

    expect(screen.getAllByRole('textbox')[0].value).toBe('Test Model');
  });
});
