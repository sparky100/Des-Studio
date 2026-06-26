import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ContainerEditor } from '../../../src/ui/editors/index.jsx';

describe('ContainerEditor', () => {
  it('renders empty state with add button when no containers exist', () => {
    render(<ContainerEditor containers={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/add container/i)).toBeInTheDocument();
    expect(screen.getByText(/no containers defined/i, { exact: false })).toBeInTheDocument();
  });

  it('renders existing containers with id, capacity and initialLevel', () => {
    const containers = [
      { id: 'FuelTank', capacity: '1000', initialLevel: '500' },
    ];
    render(<ContainerEditor containers={containers} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('FuelTank')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
  });

  it('calls onChange with a new container when Add Container is clicked', () => {
    const onChange = vi.fn();
    render(<ContainerEditor containers={[]} onChange={onChange} />);
    fireEvent.click(screen.getByText(/add container/i));
    expect(onChange).toHaveBeenCalledTimes(1);
    const newContainers = onChange.mock.calls[0][0];
    expect(newContainers).toHaveLength(1);
    expect(newContainers[0]).toMatchObject({ capacity: '1000', initialLevel: '0' });
  });

  it('calls onChange when container id is edited', () => {
    const onChange = vi.fn();
    const containers = [{ id: 'Tank', capacity: '500', initialLevel: '0' }];
    render(<ContainerEditor containers={containers} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('Tank'), { target: { value: 'FuelTank' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].id).toBe('FuelTank');
  });

  it('removes a container when the remove button is clicked', () => {
    const onChange = vi.fn();
    const containers = [
      { id: 'A', capacity: '100', initialLevel: '0' },
      { id: 'B', capacity: '200', initialLevel: '0' },
    ];
    render(<ContainerEditor containers={containers} onChange={onChange} />);
    // Click the remove button for the first container
    const removeButtons = screen.getAllByRole('button', { name: /remove container/i });
    fireEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('B');
  });

  it('displays the FILL/DRAIN info box', () => {
    render(<ContainerEditor containers={[]} onChange={vi.fn()} />);
    expect(screen.getAllByText(/FILL/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DRAIN/).length).toBeGreaterThan(0);
  });

  it('shows the unbounded checkbox checked when capacity is empty', () => {
    const containers = [{ id: 'Inventory', capacity: '', initialLevel: '0' }];
    render(<ContainerEditor containers={containers} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /unbounded/i })).toBeChecked();
    expect(screen.getByPlaceholderText(/unbounded/i)).toBeDisabled();
  });

  it('clears capacity when the unbounded checkbox is checked', () => {
    const onChange = vi.fn();
    const containers = [{ id: 'Tank', capacity: '500', initialLevel: '0' }];
    render(<ContainerEditor containers={containers} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /unbounded/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].capacity).toBe('');
  });

  it('restores a default capacity when the unbounded checkbox is unchecked', () => {
    const onChange = vi.fn();
    const containers = [{ id: 'Tank', capacity: '', initialLevel: '0' }];
    render(<ContainerEditor containers={containers} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /unbounded/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].capacity).toBe('1000');
  });
});
