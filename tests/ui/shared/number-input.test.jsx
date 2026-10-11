// NumberInput: a number field that doesn't rewrite what the user is typing.
// Each case is a keystroke problem the old `parseInt(v) || fallback` /
// Math.max(min, …) handlers had.
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { NumberInput } from '../../../src/ui/shared/NumberInput.jsx';

function Harness({ initial, onCommit = () => {}, ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberInput aria-label="n" value={value} onValueChange={v => { setValue(v); onCommit(v); }} {...props} />
      <output data-testid="value">{String(value)}</output>
    </>
  );
}
const field = () => screen.getByLabelText('n');
const stored = () => screen.getByTestId('value').textContent;
const type = text => fireEvent.change(field(), { target: { value: text } });

describe('NumberInput', () => {
  it('clearing the field to retype does not put the fallback back ("15" bug)', () => {
    render(<Harness initial={1} integer min={1} fallback={1} />);
    fireEvent.focus(field());
    type('');
    expect(field().value).toBe('');
    type('5');
    expect(field().value).toBe('5');
    expect(stored()).toBe('5');
  });

  it('a value below min while typing is not clamped mid-edit ("20" → 5 → "50" bug)', () => {
    const onCommit = vi.fn();
    render(<Harness initial={50} integer min={5} onCommit={onCommit} />);
    fireEvent.focus(field());
    type('2');
    expect(field().value).toBe('2');
    expect(onCommit).not.toHaveBeenCalled();
    type('20');
    expect(stored()).toBe('20');
  });

  it('accepts 0 when 0 is in range (temperature `|| 0.3` bug)', () => {
    render(<Harness initial={0.3} min={0} max={1} />);
    fireEvent.focus(field());
    type('0');
    expect(stored()).toBe('0');
  });

  it('an incomplete entry (the browser reports "" for "2.") stores nothing until it parses', () => {
    const onCommit = vi.fn();
    render(<Harness initial={10} min={0} onCommit={onCommit} />);
    fireEvent.focus(field());
    type('');
    expect(onCommit).not.toHaveBeenCalled();
    type('2.5');
    expect(stored()).toBe('2.5');
  });

  it('on blur: clamps out-of-range, reverts an empty field, or applies the fallback', () => {
    const { unmount } = render(<Harness initial={50} integer min={5} />);
    fireEvent.focus(field()); type('2'); fireEvent.blur(field());
    expect(stored()).toBe('5');
    expect(field().value).toBe('5');
    unmount();

    const second = render(<Harness initial={30} integer min={1} />);
    fireEvent.focus(field()); type(''); fireEvent.blur(field());
    expect(stored()).toBe('30');
    expect(field().value).toBe('30');
    second.unmount();

    render(<Harness initial={30} integer min={1} fallback={1} />);
    fireEvent.focus(field()); type(''); fireEvent.blur(field());
    expect(stored()).toBe('1');
  });

  it('shows external value changes when not being edited', () => {
    const { rerender } = render(<NumberInput aria-label="n" value={3} onValueChange={() => {}} />);
    expect(field().value).toBe('3');
    rerender(<NumberInput aria-label="n" value={7} onValueChange={() => {}} />);
    expect(field().value).toBe('7');
  });
});
