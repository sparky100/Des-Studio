import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConditionBuilder, EntityFilterBuilder } from '../../../src/ui/editors/index.jsx';

describe('ConditionBuilder — operator filtering by valueType', () => {
  const mockEntityTypes = [
    {
      id: 'et1',
      name: 'Customer',
      role: 'customer',
      attrDefs: [
        { id: 'a1', name: 'priority', valueType: 'number', defaultValue: '5' },
      ]
    },
    {
      id: 'et2',
      name: 'Server',
      role: 'server',
      attrDefs: [
        { id: 'a4', name: 'busyCount', valueType: 'number', defaultValue: '0' },
      ]
    }
  ];

  const mockStateVariables = [
    { id: 'sv1', name: 'totalServed', valueType: 'number', initialValue: '0' },
  ];

  const mockQueues = [
    { id: 'q1', name: 'MainQueue', discipline: 'FIFO' },
    { id: 'q2', name: 'PriorityQueue', discipline: 'PRIORITY' },
  ];

  const onChange = () => {};

  it('renders the ConditionBuilder component', () => {
    render(
      <ConditionBuilder
        value=""
        onChange={onChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );
    expect(screen.getByText(/No conditions yet/i)).toBeInTheDocument();
  });

  it('shows "Add Clause" button when no conditions exist', () => {
    render(
      <ConditionBuilder
        value=""
        onChange={onChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );
    expect(screen.getByRole('button', { name: /Add Clause/i })).toBeInTheDocument();
  });

  it('adds a new condition row when + Add Clause is clicked', async () => {
    let conditionValue = null;
    const handleChange = (val) => {
      conditionValue = val;
    };

    const { rerender } = render(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    const addButton = screen.getByRole('button', { name: /Add Clause/i });
    fireEvent.click(addButton);

    // After adding, condition value should be a predicate object
    expect(conditionValue).toBeTruthy();
    expect(conditionValue).toEqual(expect.objectContaining({
      variable: expect.any(String),
      operator: '>',
      value: 0,
    }));

    // Re-render with the new condition value so the row displays
    rerender(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // Should see the operator and value inputs now
    expect(screen.getByDisplayValue('>')).toBeInTheDocument();
  });

  it('shows 6 operators (==, !=, <, >, <=, >=) for number tokens', async () => {
    let conditionValue = null;
    const handleChange = (val) => {
      conditionValue = val;
    };

    const { rerender } = render(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // Add a condition
    fireEvent.click(screen.getByRole('button', { name: /Add Clause/i }));

    rerender(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // Find the operator select (second combobox)
    const comboboxes = screen.getAllByRole('combobox');
    const operatorSelect = comboboxes[1];

    // Get all operator options
    const options = Array.from(operatorSelect.querySelectorAll('option')).map(o => o.value);

    expect(options).toHaveLength(6);
    expect(options).toEqual(expect.arrayContaining(['==', '!=', '<', '>', '<=', '>=']));
  });

  it('displays a number input for number variables', () => {
    let conditionValue = null;
    const handleChange = (val) => {
      conditionValue = val;
    };

    const { rerender } = render(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Clause/i }));

    rerender(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // Default token is a number type, so value input should be type="number"
    const numberInputs = screen.getAllByRole('spinbutton');
    expect(numberInputs.length).toBeGreaterThan(0);
    expect(numberInputs[0].type).toBe('number');
  });

  it('prevents type mismatch by enforcing valid operators only', () => {
    let conditionValue = null;
    const handleChange = (val) => {
      conditionValue = val;
    };

    render(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Clause/i }));

    // All current tokens are numbers, so all 6 operators should be available
    const comboboxes = screen.getAllByRole('combobox');
    const operatorSelect = comboboxes[1];
    const options = Array.from(operatorSelect.querySelectorAll('option')).map(o => o.value);

    expect(options).toContain('==');
    expect(options).toContain('!=');
    expect(options).toContain('<');
    expect(options).toContain('>');
  });

  it('condition builder produces valid predicate JSON from rows', () => {
    let conditionValue = null;
    const handleChange = (val) => {
      conditionValue = val;
    };

    const { rerender } = render(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Clause/i }));

    rerender(
      <ConditionBuilder
        value={conditionValue}
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // Should have a predicate-object condition value
    expect(conditionValue).toBeTruthy();
    expect(conditionValue).toEqual(expect.objectContaining({
      variable: expect.any(String),
      operator: '>',
      value: 0,
    }));
    // Human-readable label should be visible in the dropdown
    expect(screen.queryByText(/Number waiting in MainQueue/i)).toBeInTheDocument();
  });
});

describe('EntityFilterBuilder — entity attribute filtering', () => {
  const mockEntityTypesWithAttrs = [
    {
      id: 'et1',
      name: 'Patient',
      role: 'customer',
      attrDefs: [
        { id: 'a1', name: 'severity',  valueType: 'number',  defaultValue: '3' },
        { id: 'a2', name: 'isUrgent',  valueType: 'boolean', defaultValue: 'false' },
      ],
    },
    {
      id: 'et2',
      name: 'Nurse',
      role: 'server',
      attrDefs: [
        { id: 'a3', name: 'skillLevel', valueType: 'number', defaultValue: '1' },
      ],
    },
  ];

  it('shows only Entity.* variables — no queue or resource tokens', () => {
    render(
      <EntityFilterBuilder
        entityTypes={mockEntityTypesWithAttrs}
        value={null}
        onChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Filter Clause/i }));

    const tokenSelect = screen.getByRole('combobox', { name: /Entity attribute/i });
    const options = Array.from(tokenSelect.querySelectorAll('option')).map(o => o.value);

    expect(options.every(o => o.startsWith('Entity.'))).toBe(true);
    expect(options).toContain('Entity.severity');
    expect(options).toContain('Entity.isUrgent');
    // Server attribute must not appear
    expect(options).not.toContain('Entity.skillLevel');
    // No queue or idle tokens anywhere in the document
    expect(screen.queryByText(/queue\(/)).not.toBeInTheDocument();
    expect(screen.queryByText(/idle\(/)).not.toBeInTheDocument();
  });

  it('shows 6 operators for number attributes', () => {
    render(
      <EntityFilterBuilder
        entityTypes={mockEntityTypesWithAttrs}
        value={null}
        onChange={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Filter Clause/i }));

    const operatorSelect = screen.getByRole('combobox', { name: /Operator/i });
    const ops = Array.from(operatorSelect.querySelectorAll('option')).map(o => o.value);

    expect(ops).toHaveLength(6);
    expect(ops).toEqual(expect.arrayContaining(['==', '!=', '<', '>', '<=', '>=']));
  });

  it('shows fallback message when no customer entity types with attributes are defined', () => {
    render(
      <EntityFilterBuilder
        entityTypes={[{ id: 'et1', name: 'Nurse', role: 'server', attrDefs: [{ id: 'a1', name: 'speed', valueType: 'number' }] }]}
        value={null}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Define customer entity types with attributes/i)).toBeInTheDocument();
  });

  it('calls onChange with null when filter is cleared', () => {
    const handleChange = vi.fn();
    render(
      <EntityFilterBuilder
        entityTypes={mockEntityTypesWithAttrs}
        value={{ variable: 'Entity.severity', operator: '>', value: 3 }}
        onChange={handleChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Clear Filter/i }));
    expect(handleChange).toHaveBeenCalledWith(null);
  });
});

describe('ConditionBuilder — state-variable token matching (state.<name> vs bare name)', () => {
  // A state variable's condition token may be stored as the documented `state.<name>`
  // form or as a bare name (src/engine/conditions.js resolveVariable evaluates both
  // correctly at runtime) — the builder's dropdown must recognize both instead of
  // silently substituting an unrelated token when the exact-string match fails.
  const mockEntityTypes = [];
  const mockStateVariables = [
    { id: 'sv1', name: 'totalServed', valueType: 'number', initialValue: '0' },
  ];
  // Queue tokens are built first in ConditionBuilder's token list, so
  // "Number waiting in MainQueue" is always tokens[0] — the exact fallback the
  // pre-fix bug substituted in for any unrecognized token.
  const mockQueues = [
    { id: 'q1', name: 'MainQueue', discipline: 'FIFO' },
  ];

  it('a state.<name>-prefixed clause resolves to the state variable, not the first queue token', () => {
    const handleChange = vi.fn();
    render(
      <ConditionBuilder
        value="state.totalServed > 0"
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // The token select must display the state-variable option, never the queue token
    // it used to silently fall back to.
    expect(screen.getByDisplayValue(/totalServed/i)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/Number waiting in MainQueue/i)).not.toBeInTheDocument();

    // The mount effect resolves the stored `state.` prefix to the dropdown's own
    // recognized (bare) form for display purposes — but that dialect equivalence is
    // intentional recognition, not a repair, so it must NOT be silently persisted via
    // onChange (that was itself a reported bug: viewing/expanding a condition with a
    // state.<name> clause spuriously marked the model as having unsaved changes).
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('a multi-clause condition resolves its state.<name> clause correctly, not as a duplicate of clause 1', () => {
    const handleChange = vi.fn();
    render(
      <ConditionBuilder
        value="queue(MainQueue).length > 0 AND state.totalServed > 0"
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    // The reported bug: clause 2 silently became a byte-for-byte duplicate of clause 1.
    // Check this via the rendered token dropdowns rather than onChange, since both
    // clauses already resolve to a real token here and neither needs repairing — see
    // the previous test for why that means onChange correctly does not fire at all.
    expect(screen.getByDisplayValue(/Number waiting in MainQueue/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/totalServed/i)).toBeInTheDocument();
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('a bare state-variable name (the already-working form) is unaffected by the fix', () => {
    const handleChange = vi.fn();
    render(
      <ConditionBuilder
        value="totalServed > 0"
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    expect(screen.getByDisplayValue(/totalServed/i)).toBeInTheDocument();
    // Already in the dropdown's own recognized form — nothing to repair, so the
    // mount effect must not fire a spurious write.
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('a genuinely unrecognized token (e.g. a renamed/deleted queue) keeps the existing C8 stale-token fallback', () => {
    // Distinct from the state.<name> case above: there is no real match to find here
    // (not even loosely), so the pre-existing, separately-tested (C8) "fall back to the
    // first available token and auto-repair" recovery still applies unchanged — this
    // fix only adds a second, targeted match for state variables; it does not touch
    // what happens when no match exists at all.
    const handleChange = vi.fn();
    render(
      <ConditionBuilder
        value="queue(DeletedQueue).length > 0"
        onChange={handleChange}
        entityTypes={mockEntityTypes}
        stateVariables={mockStateVariables}
        queues={mockQueues}
      />
    );

    expect(screen.getByDisplayValue(/Number waiting in MainQueue/i)).toBeInTheDocument();
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange.mock.calls[0][0].variable).toBe('queue(MainQueue).length');
  });
});
