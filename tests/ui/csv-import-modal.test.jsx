import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CsvImportModal } from '../../src/ui/CsvImportModal.jsx';

function createCsvFile(content, name = 'test.csv') {
  return new File([content], name, { type: 'text/csv' });
}

describe('CsvImportModal', () => {
  const onClose = vi.fn();
  const onApply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the upload step with instructions', () => {
    render(<CsvImportModal onClose={onClose} onApply={onApply} />);

    expect(screen.getByText(/import entity type from csv/i)).toBeInTheDocument();
    expect(screen.getByText(/upload a csv file with headers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /select csv file/i })).toBeInTheDocument();
  });

  it('lets the user type an entity type name', () => {
    render(<CsvImportModal onClose={onClose} onApply={onApply} />);

    const input = screen.getByPlaceholderText('e.g. Customer');
    fireEvent.change(input, { target: { value: 'Patient' } });
    expect(input.value).toBe('Patient');
  });

  it('parses a valid CSV and shows the preview step', async () => {
    render(<CsvImportModal onClose={onClose} onApply={onApply} />);

    const fileInput = screen.getByLabelText('CSV file');
    const file = createCsvFile('age,severity\n30,High\n25,Low\n40,Medium');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/2 columns detected/i)).toBeInTheDocument());
    expect(screen.getByText('age')).toBeInTheDocument();
    expect(screen.getByText('severity')).toBeInTheDocument();
    expect(screen.getByText('number')).toBeInTheDocument();
    expect(screen.getAllByText('string').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onApply with the generated entity type when Add Entity Type is clicked', async () => {
    render(<CsvImportModal onClose={onClose} onApply={onApply} />);

    const fileInput = screen.getByLabelText('CSV file');
    const file = createCsvFile('service_time\n2.5\n3.0\n1.8');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('button', { name: /add entity type/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /add entity type/i }));

    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const applied = onApply.mock.calls[0][0];
    expect(applied.name).toBe('Imported Entity');
    expect(applied.role).toBe('customer');
    expect(applied.attrDefs).toHaveLength(1);
    expect(applied.attrDefs[0].name).toBe('service_time');
    expect(applied.attrDefs[0].valueType).toBe('number');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error for an empty CSV', async () => {
    render(<CsvImportModal onClose={onClose} onApply={onApply} />);

    const fileInput = screen.getByLabelText('CSV file');
    const file = createCsvFile('');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/empty/i)).toBeInTheDocument());
  });

  it('closes the modal when Cancel is clicked', async () => {
    render(<CsvImportModal onClose={onClose} onApply={onApply} />);

    const fileInput = screen.getByLabelText('CSV file');
    const file = createCsvFile('a\n1');
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
