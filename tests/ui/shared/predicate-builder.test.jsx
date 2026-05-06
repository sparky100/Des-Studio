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
    let conditionValue = '';
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

    // After adding, condition value should be non-empty
    expect(conditionValue).toBeTruthy();

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
    let conditionValue = '';
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
    let conditionValue = '';
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
    let conditionValue = '';
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

  it('condition preview shows built string from rows', () => {
    let conditionValue = '';
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

    // Should have a condition value
    expect(conditionValue).toBeTruthy();
    // Find all text nodes with the token
    const allMatches = screen.queryAllByText(/queue\(MainQueue\)\.length/);
    // At least 2 should exist: one in dropdown, one in preview
    expect(allMatches.length).toBeGreaterThan(1);
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

