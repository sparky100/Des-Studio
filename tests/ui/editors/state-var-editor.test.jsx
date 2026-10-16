import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StateVarEditor } from '../../../src/ui/editors/StateVarEditor.jsx';

describe('StateVarEditor', () => {
  it('defaults a newly added variable to shown in the State variables readout', () => {
    const onChange = vi.fn();
    render(<StateVarEditor vars={[]} onChange={onChange} />);

    fireEvent.click(screen.getAllByRole('button', { name: /add data item/i })[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ showInSwitches: true, resetOnWarmup: false });
  });

  it('lets the modeller hide a variable from the State variables readout', () => {
    const onChange = vi.fn();
    render(<StateVarEditor vars={[{ id: 'sv1', name: 'arrivals', initialValue: '0' }]} onChange={onChange} />);

    const toggle = screen.getByLabelText(/show on run canvas/i);
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'sv1', showInSwitches: false }),
    ]);
  });

  it('reflects an already-hidden variable as unchecked', () => {
    render(
      <StateVarEditor
        vars={[{ id: 'sv1', name: 'arrivals', initialValue: '0', showInSwitches: false }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/show on run canvas/i).checked).toBe(false);
  });
});
