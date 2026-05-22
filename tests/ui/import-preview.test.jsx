import { fireEvent, render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportPreview } from '../../src/ui/ImportPreview.jsx';

const sampleModel = {
  name: 'Test Queue Model',
  description: 'An auto-generated DES model.',
  entityTypes: [
    { id: 'et1', name: 'Customer', role: 'customer', attrDefs: [] },
    { id: 'et2', name: 'Server', role: 'server', attrDefs: [] },
  ],
  queues: [
    { id: 'q1', name: 'WaitLine', discipline: 'FIFO' },
  ],
  experimentDefaults: { maxSimTime: 500, warmupPeriod: 50, replications: 3 },
  bEvents: [],
  cEvents: [],
  stateVariables: [],
};

describe('ImportPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders model name and entity type list correctly', () => {
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText('Test Queue Model')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('customer')).toBeInTheDocument();
    expect(screen.getByText('Server')).toBeInTheDocument();
    expect(screen.getByText('server')).toBeInTheDocument();
  });

  it('"Save to my models" calls onSave when user is present', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={{ id: 'user-1', email: 'test@example.com' }}
        onSave={onSave}
        onDismiss={vi.fn()}
      />
    );
    const saveBtn = screen.getByRole('button', { name: /save to my models/i });
    await act(async () => { fireEvent.click(saveBtn); });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('"Sign in to save" button is present when user is null', () => {
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /sign in to save/i })).toBeInTheDocument();
  });

  it('"Save to my models" button is absent when user is null', () => {
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /save to my models/i })).not.toBeInTheDocument();
  });

  it('validation error banner appears when errors array is non-empty', () => {
    const errors = [
      { code: 'V8', message: 'No arrival source found.', tab: 'bevents' },
    ];
    render(
      <ImportPreview
        model={sampleModel}
        errors={errors}
        warnings={[]}
        user={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert.textContent).toMatch(/\[V8\]/);
    expect(alert.textContent).toMatch(/No arrival source found/);
  });

  it('green validation notice shown when errors array is empty', () => {
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={null}
        onSave={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/Model passed validation/i)).toBeInTheDocument();
  });

  it('dismiss button calls onDismiss for signed-in user', () => {
    const onDismiss = vi.fn();
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={{ id: 'user-1' }}
        onSave={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('"Sign in to save" stores model in sessionStorage and calls onDismiss', () => {
    const onDismiss = vi.fn();
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={null}
        onSave={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /sign in to save/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const stored = sessionStorage.getItem('des.pendingImport');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored).name).toBe('Test Queue Model');
  });

  it('shows inline error when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('DB write failed'));
    render(
      <ImportPreview
        model={sampleModel}
        errors={[]}
        warnings={[]}
        user={{ id: 'user-1' }}
        onSave={onSave}
        onDismiss={vi.fn()}
      />
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save to my models/i }));
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('DB write failed');
  });
});
