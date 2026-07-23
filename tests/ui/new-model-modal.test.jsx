import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewModelModal } from '../../src/ui/ModelLibrary.jsx';
import { ToastProvider } from '../../src/ui/shared/ToastContext.jsx';

const noop = () => ({ onClose: vi.fn(), onStartDesign: vi.fn(), onUseTemplate: vi.fn(), onImportFile: vi.fn(), onPasteJson: vi.fn(), onUseAi: vi.fn() });

describe('NewModelModal', () => {
  it('shows all start options with no name/description fields upfront', () => {
    render(<NewModelModal {...noop()} />);
    expect(screen.getByText(/^Model assistant$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Draw$/i)).toBeInTheDocument();
    expect(screen.getByText(/Use a template/i)).toBeInTheDocument();
    expect(screen.getByText(/Import a file/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste model/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/e\.g\. Queue with Reneging/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/description/i)).not.toBeInTheDocument();
  });

  it('reveals a name step only after Draw is clicked', async () => {
    const user = userEvent.setup();
    render(<NewModelModal {...noop()} />);
    expect(screen.queryByPlaceholderText(/e\.g\. Queue with Reneging/i)).not.toBeInTheDocument();
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    expect(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Drawing/i)).toBeInTheDocument();
  });

  it('does not start design when the name step is submitted empty', async () => {
    const user = userEvent.setup();
    const onStartDesign = vi.fn();
    render(<NewModelModal {...noop()} onStartDesign={onStartDesign} />);
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    await user.click(screen.getByText(/Start Drawing/i));
    expect(onStartDesign).not.toHaveBeenCalled();
  });

  it('shows a toast asking for a name when Start Drawing is clicked without one', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <NewModelModal {...noop()} />
      </ToastProvider>
    );
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    await user.click(screen.getByText(/Start Drawing/i));
    expect(await screen.findByText(/enter a model name/i)).toBeInTheDocument();
  });

  it('calls onStartDesign with the typed name once submitted', async () => {
    const user = userEvent.setup();
    const onStartDesign = vi.fn();
    render(<NewModelModal {...noop()} onStartDesign={onStartDesign} />);
    await user.click(screen.getByText(/^Draw$/i).closest('button'));
    await user.type(screen.getByPlaceholderText(/e\.g\. Queue with Reneging/i), 'Test Model');
    await user.click(screen.getByText(/Start Drawing/i));
    expect(onStartDesign).toHaveBeenCalledWith('Test Model', '');
  });

  it('calls onUseTemplate immediately with no name prompt', async () => {
    const user = userEvent.setup();
    const onUseTemplate = vi.fn();
    render(<NewModelModal {...noop()} onUseTemplate={onUseTemplate} />);
    await user.click(screen.getByText(/Use a template/i).closest('button'));
    expect(onUseTemplate).toHaveBeenCalledWith('', '');
  });

  it('calls onUseAi immediately with no name prompt', async () => {
    const user = userEvent.setup();
    const onUseAi = vi.fn();
    render(<NewModelModal {...noop()} onUseAi={onUseAi} />);
    await user.click(screen.getByText(/^Model assistant$/i).closest('button'));
    expect(onUseAi).toHaveBeenCalledWith('', '');
  });

  it('switches to paste mode immediately with no name prompt', async () => {
    const user = userEvent.setup();
    render(<NewModelModal {...noop()} />);
    await user.click(screen.getByText(/Paste model/i).closest('button'));
    expect(screen.getByText(/Paste Model JSON/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Model JSON/i).length).toBeGreaterThan(0);
  });

  it('calls onPasteJson with pasted text and no name once submitted', async () => {
    const user = userEvent.setup();
    const onPasteJson = vi.fn();
    render(<NewModelModal {...noop()} onPasteJson={onPasteJson} />);
    await user.click(screen.getByText(/Paste model/i).closest('button'));
    fireEvent.change(screen.getByLabelText(/^Model JSON$/i), { target: { value: '{"name":"Pasted"}' } });
    fireEvent.click(screen.getByText(/Import Model/i));
    expect(onPasteJson).toHaveBeenCalledWith('{"name":"Pasted"}', '', '', expect.any(Function), expect.any(Function));
  });

  it('does not call onPasteJson when submitted without pasted text', async () => {
    const user = userEvent.setup();
    const onPasteJson = vi.fn();
    render(
      <ToastProvider>
        <NewModelModal {...noop()} onPasteJson={onPasteJson} />
      </ToastProvider>
    );
    await user.click(screen.getByText(/Paste model/i).closest('button'));
    fireEvent.click(screen.getByText(/Import Model/i));
    expect(onPasteJson).not.toHaveBeenCalled();
    expect(await screen.findByText(/please paste model json/i)).toBeInTheDocument();
  });

  it('triggers the file picker immediately when Import a file is clicked', async () => {
    const user = userEvent.setup();
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<NewModelModal {...noop()} />);
    await user.click(screen.getByText(/Import a file/i).closest('button'));
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('has cancel button', () => {
    const onClose = vi.fn();
    render(<NewModelModal {...noop()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
