import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DistanceRegistryEditor } from '../../../src/ui/editors/index.jsx';

const queues = [{ id: 'q1', name: 'WarehouseQueue' }, { id: 'q2', name: 'DepotQueue' }];

describe('DistanceRegistryEditor', () => {
  it('renders empty state with add button when no distances exist', () => {
    render(<DistanceRegistryEditor distances={[]} queues={queues} onChange={vi.fn()} />);
    expect(screen.getByText(/no distances yet/i)).toBeInTheDocument();
  });

  it('renders an existing distance with its queue dropdowns and distance value', () => {
    const distances = [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: '12' }];
    render(<DistanceRegistryEditor distances={distances} queues={queues} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Distance 1 from queue/i)).toHaveValue('WarehouseQueue');
    expect(screen.getByLabelText(/Distance 1 to queue/i)).toHaveValue('DepotQueue');
    expect(screen.getByDisplayValue('12')).toBeInTheDocument();
  });

  it('calls onChange with a new distance entry when Add Distance is clicked', () => {
    const onChange = vi.fn();
    render(<DistanceRegistryEditor distances={[]} queues={queues} onChange={onChange} />);
    fireEvent.click(screen.getAllByText(/add distance/i)[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const newDistances = onChange.mock.calls[0][0];
    expect(newDistances).toHaveLength(1);
    expect(newDistances[0]).toMatchObject({ fromQueue: '', toQueue: '', distance: '10' });
  });

  it('updates fromQueue when the from dropdown is changed', () => {
    const onChange = vi.fn();
    const distances = [{ id: 'd1', fromQueue: '', toQueue: '', distance: '10' }];
    render(<DistanceRegistryEditor distances={distances} queues={queues} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Distance 1 from queue/i), { target: { value: 'WarehouseQueue' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].fromQueue).toBe('WarehouseQueue');
  });

  it('updates the distance value when edited', () => {
    const onChange = vi.fn();
    const distances = [{ id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: '10' }];
    render(<DistanceRegistryEditor distances={distances} queues={queues} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue('10'), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].distance).toBe('25');
  });

  it('removes a distance when the remove button is clicked', () => {
    const onChange = vi.fn();
    const distances = [
      { id: 'd1', fromQueue: 'WarehouseQueue', toQueue: 'DepotQueue', distance: '10' },
      { id: 'd2', fromQueue: 'DepotQueue', toQueue: 'WarehouseQueue', distance: '5' },
    ];
    render(<DistanceRegistryEditor distances={distances} queues={queues} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove distance/i })[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0];
    expect(updated).toHaveLength(1);
    expect(updated[0].id).toBe('d2');
  });
});
