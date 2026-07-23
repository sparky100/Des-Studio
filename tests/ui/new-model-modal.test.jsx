import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewModelModal } from '../../src/ui/ModelLibrary.jsx';
import { ToastProvider } from '../../src/ui/shared/ToastContext.jsx';

describe('NewModelModal', () => {
  it('renders name and description fields', () => {
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    expect(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Optional/i)).toBeInTheDocument();
  });

  it('shows all start options', () => {
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    expect(screen.getByText(/^Draw$/i)).toBeInTheDocument();
    expect(screen.getByText(/Use a template/i)).toBeInTheDocument();
    expect(screen.getByText(/Import a file/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste model/i)).toBeInTheDocument();
    expect(screen.getByText(/^Describe$/i)).toBeInTheDocument();
  });

  it('does not start design when name is empty', async () => {
    const user = userEvent.setup();
    const onStartDesign = vi.fn();
    render(<NewModelModal onClose={vi.fn()} onStartDesign={onStartDesign} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    expect(onStartDesign).not.toHaveBeenCalled();
  });

  it('shows a toast asking for a name when Draw is clicked without one', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />
      </ToastProvider>
    );
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    expect(await screen.findByText(/enter a model name/i)).toBeInTheDocument();
  });

  it('calls onStartDesign when design is clicked', async () => {
    const user = userEvent.setup();
    const onStartDesign = vi.fn();
    render(<NewModelModal onClose={vi.fn()} onStartDesign={onStartDesign} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), 'Test Model');
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    expect(onStartDesign).toHaveBeenCalledWith('Test Model', '');
  });

  it('calls onUseTemplate with the entered draft details', async () => {
    const user = userEvent.setup();
    const onUseTemplate = vi.fn();
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={onUseTemplate} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    await user.type(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), 'Template Draft');
    await user.type(screen.getByPlaceholderText(/Optional/i), 'Use this description');
    await user.click(screen.getByText(/Use a template/i).closest('button'));
    expect(onUseTemplate).toHaveBeenCalledWith('Template Draft', 'Use this description');
  });

  it('does not switch to paste mode without a name', () => {
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    fireEvent.click(screen.getByText(/Paste model/i).closest('button'));
    expect(screen.queryByText(/Paste Model JSON/i)).not.toBeInTheDocument();
  });

  it('switches to paste mode when paste model is clicked with a name', () => {
    render(<NewModelModal onClose={vi.fn()} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), { target: { value: 'Test Model' } });
    fireEvent.click(screen.getByText(/Paste model/i).closest('button'));
    expect(screen.getByText(/Paste Model JSON/i)).toBeInTheDocument();
    // In paste mode, there's a textarea with aria-label "Model JSON"
    const textareas = screen.getAllByLabelText(/Model JSON/i);
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('has cancel button', () => {
    const onClose = vi.fn();
    render(<NewModelModal onClose={onClose} onStartDesign={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
