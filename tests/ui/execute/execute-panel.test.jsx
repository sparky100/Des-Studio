import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const validModel = {
  entityTypes: [
    { id: 'et_customer', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_server', name: 'Server', role: 'server', count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [],
    },
  ],
  cEvents: [],
  queues: [],
};

describe('ExecutePanel', () => {
  it('renders the execute controls without crashing', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);

    expect(screen.getByText('WARM-UP PERIOD')).toBeInTheDocument();
    expect(screen.getByText('REPLICATIONS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run all/i })).toBeInTheDocument();
    expect(screen.getByText('Run or step the simulation to see the visual view.')).toBeInTheDocument();
  });
});
