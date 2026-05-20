import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewModelModal } from '../../src/ui/ModelLibrary.jsx';

describe('NewModelModal', () => {
  it('renders name and description fields', () => {
    render(<NewModelModal onClose={vi.fn()} onCreate={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    expect(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Optional/i)).toBeInTheDocument();
  });

  it('shows all start options', () => {
    render(<NewModelModal onClose={vi.fn()} onCreate={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    expect(screen.getByText(/Blank model/i)).toBeInTheDocument();
    expect(screen.getByText(/Use a template/i)).toBeInTheDocument();
    expect(screen.getByText(/Import a file/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste model/i)).toBeInTheDocument();
    expect(screen.getByText(/Use AI/i)).toBeInTheDocument();
  });

  it('requires name before enabling blank model creation', () => {
    render(<NewModelModal onClose={vi.fn()} onCreate={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    const blankBtn = screen.getByText(/Blank model/i).closest('button');
    expect(blankBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), { target: { value: 'Test Model' } });
    expect(blankBtn).not.toBeDisabled();
  });

  it('calls onCreate when blank model is clicked', async () => {
    const onCreate = vi.fn();
    render(<NewModelModal onClose={vi.fn()} onCreate={onCreate} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), { target: { value: 'Test Model' } });
    fireEvent.click(screen.getByText(/Blank model/i).closest('button'));
    expect(onCreate).toHaveBeenCalledWith('Test Model', '');
  });

  it('switches to paste mode when paste model is clicked', () => {
    render(<NewModelModal onClose={vi.fn()} onCreate={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    fireEvent.click(screen.getByText(/Paste model/i).closest('button'));
    expect(screen.getByText(/Paste Model JSON/i)).toBeInTheDocument();
    // In paste mode, there's a textarea with aria-label "Model JSON"
    const textareas = screen.getAllByLabelText(/Model JSON/i);
    expect(textareas.length).toBeGreaterThan(0);
  });

  it('has cancel button', () => {
    const onClose = vi.fn();
    render(<NewModelModal onClose={onClose} onCreate={vi.fn()} onUseTemplate={vi.fn()} onImportFile={vi.fn()} onPasteJson={vi.fn()} onUseAi={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
