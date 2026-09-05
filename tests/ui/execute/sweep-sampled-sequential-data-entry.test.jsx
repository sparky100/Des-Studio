// Regression coverage for the Sampled/Sequential Study inputs, mirroring
// sweep-2d.test.jsx's data-entry tests for PR #553's fix (raw typed string
// state, parsed once at the point of use) — that fix originally only
// touched the 1D/2D sweepMin/Max/Step[B] inputs; this file covers the same
// class of bug in SampledParamRangeList's per-parameter min/max inputs
// (Phase 2) and the Sequential-mode POINTS/NARROW TO inputs (Phase 3).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutePanel } from '../../../src/ui/execute/index.jsx';

const mockRunSweep = vi.hoisted(() => vi.fn());
const mockRun2DSweep = vi.hoisted(() => vi.fn());
const mockRunSweepOffthread = vi.hoisted(() => vi.fn());

vi.mock('../../../src/engine/sweep-runner.js', () => ({
  runSweep: mockRunSweep,
  run2DSweep: mockRun2DSweep,
  runSweepOffthread: mockRunSweepOffthread,
}));

vi.mock('../../../src/engine/sweep-params.js', () => ({
  enumerateSweepableParams: vi.fn((model) => (model.entityTypes || [])
    .filter(et => et.role === 'server')
    .map(et => ({
      type: 'entityTypeCount',
      targetId: et.id,
      label: `${et.name}.count`,
      currentValue: parseInt(et.count, 10) || 0,
      path: `entityTypes.${et.id}.count`,
    }))),
  applySweepValues: vi.fn((model) => model),
  generateSweepValues: vi.fn(() => []),
  generate2DSweepValues: vi.fn(() => []),
  MAX_STUDY_REPLICATIONS: 2000,
}));

vi.mock('../../../src/db/models.js', () => ({
  fetchRunHistory: vi.fn().mockResolvedValue([]),
  saveSimulationRun: vi.fn().mockResolvedValue(undefined),
  fetchUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  saveUserSettings: vi.fn().mockResolvedValue({ schemaVersion: 1, settings: {} }),
  fetchExperiments: vi.fn().mockResolvedValue([]),
  saveExperiment: vi.fn().mockResolvedValue({}),
  updateExperiment: vi.fn().mockResolvedValue({}),
  cloneExperiment: vi.fn().mockResolvedValue({}),
  deleteExperiment: vi.fn().mockResolvedValue({ ok: true }),
  fetchModelSchedules: vi.fn().mockResolvedValue([]),
  buildSchedulesMap: vi.fn().mockReturnValue({}),
  listStudies: vi.fn().mockResolvedValue([]),
  saveStudy: vi.fn().mockResolvedValue({ id: 'study-1' }),
  getStudy: vi.fn().mockResolvedValue({ legacy: true }),
}));

const validModel = {
  entityTypes: [
    { id: 'et_customer', name: 'Customer', role: 'customer', count: 0, attrDefs: [] },
    { id: 'et_server', name: 'Server', role: 'server', count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: 'b_arrive',
      name: 'Arrival',
      scheduledTime: '0',
      effect: 'ARRIVE(Customer)',
      schedules: [
        { eventId: 'b_arrive', dist: 'Exponential', distParams: { mean: '1.11' } },
      ],
    },
    {
      id: 'b_complete',
      name: 'Complete',
      scheduledTime: '9999',
      effect: 'COMPLETE()',
      schedules: [],
    },
  ],
  cEvents: [],
  queues: [
    { id: 'q_wait', name: 'Waiting', customerType: 'Customer', capacity: '', discipline: 'FIFO', description: '' },
  ],
};

function openSweepSection() {
  fireEvent.click(screen.getByRole('button', { name: /^studies$/i }));
}

function addSampledParam() {
  fireEvent.click(screen.getByRole('button', { name: /add parameter/i }));
  fireEvent.click(screen.getByRole('button', { name: /server\.count/i }));
}

describe('ExecutePanel — Sampled/Sequential Study data entry', () => {
  beforeEach(() => {
    mockRunSweep.mockReset();
    mockRun2DSweep.mockReset();
    mockRunSweepOffthread.mockReset();
  });

  it('a decimal value typed into a sampled param min/max field round-trips exactly', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /^sampled$/i }));
    addSampledParam();

    const minInput = screen.getByLabelText(/server\.count minimum/i);
    fireEvent.change(minInput, { target: { value: '0.5' } });
    expect(minInput.value).toBe('0.5');
  });

  it('clearing a sampled param min/max field leaves it blank instead of forcing it to 0', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /^sampled$/i }));
    addSampledParam();

    const maxInput = screen.getByLabelText(/server\.count maximum/i);
    fireEvent.change(maxInput, { target: { value: '' } });
    expect(maxInput.value).toBe('');
  });

  it('a typed sampled param range is still parsed to a real number when the study runs', async () => {
    mockRunSweepOffthread.mockImplementation(() => ({ cancel: vi.fn() }));

    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /^sampled$/i }));
    addSampledParam();

    fireEvent.change(screen.getByLabelText(/server\.count minimum/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/server\.count maximum/i), { target: { value: '4.5' } });
    fireEvent.click(screen.getByRole('button', { name: /run sweep/i }));

    await waitFor(() => expect(mockRunSweepOffthread).toHaveBeenCalledTimes(1));
    const call = mockRunSweepOffthread.mock.calls[0][0];
    expect(call.parameters[0].range).toEqual({ min: 1, max: 4.5, step: 0.35 });
    expect(typeof call.parameters[0].range.max).toBe('number');
  });

  it('a decimal typed into the Sequential "narrow to" field round-trips exactly', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /^sequential$/i }));

    const narrowInput = screen.getByLabelText(/narrowed range width/i);
    fireEvent.change(narrowInput, { target: { value: '0.25' } });
    expect(narrowInput.value).toBe('0.25');
  });

  it('clearing the Sequential POINTS field leaves it blank instead of snapping to 1', () => {
    render(<ExecutePanel model={validModel} modelId="model-1" userId="user-1" />);
    openSweepSection();
    fireEvent.click(screen.getByRole('button', { name: /^sequential$/i }));

    const pointsInput = screen.getByLabelText(/sampled study point count/i);
    fireEvent.change(pointsInput, { target: { value: '' } });
    expect(pointsInput.value).toBe('');
    // The budget line still falls back to a sane default (10) for its
    // display/run-time read, even while the field itself is left blank.
    expect(screen.getByText(/10 points x/i)).toBeInTheDocument();
  });
});
