import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionEditor } from '../../../src/ui/editors/SectionEditor.jsx';

const sections = [
  { id: 'a', name: 'Front', description: '', color: '#4A90D9', memberIds: ['q1'] },
  { id: 'b', name: 'Back', description: '', color: '#27AE60', memberIds: [] },
];
const queues = [{ id: 'q1', name: 'Waiting' }];

describe('SectionEditor', () => {
  it('commits a section description on blur', () => {
    const onChange = vi.fn();
    render(<SectionEditor sections={sections} queues={queues} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('▸')[0]);
    const box = screen.getByLabelText('Description for section Front');
    fireEvent.change(box, { target: { value: 'Customers arrive and wait.' } });
    fireEvent.blur(box);
    expect(onChange.mock.calls[0][0][0].description).toBe('Customers arrive and wait.');
  });

  it('moves an element out of its old section when ticked in another', () => {
    const onChange = vi.fn();
    render(<SectionEditor sections={sections} queues={queues} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('▸')[1]);
    fireEvent.click(screen.getByLabelText(/Waiting \(currently in Front\)/));
    const next = onChange.mock.calls[0][0];
    expect(next[0].memberIds).toEqual([]);
    expect(next[1].memberIds).toEqual(['q1']);
  });
});
