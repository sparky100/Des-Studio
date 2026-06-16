import { TEMPLATES } from "../../src/engine/templates.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function clone(value) {
  return structuredClone(value);
}

function findTemplate(id) {
  const template = TEMPLATES.find(entry => entry.id === id);
  if (!template) {
    throw new Error(`Benchmark template '${id}' not found.`);
  }
  return clone(template);
}

function scheduleRows(times = [], rowAttrs = null) {
  return times.map((time, index) => ({
    time,
    ...(rowAttrs ? { attrs: rowAttrs(index, time) } : {}),
  }));
}

function makeMultiStagePostOfficeModel() {
  return {
    entityTypes: [
      { id: "et_customer", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_clerk", name: "Clerk", role: "server", count: 2, attrDefs: [] },
      { id: "et_sorter", name: "Sorter", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [{ name: "servedAtCounter", initialValue: "0" }],
    queues: [
      { id: "q_counter", name: "Counter Queue", customerType: "Customer", capacity: "", discipline: "FIFO" },
      { id: "q_sorting", name: "Sorting Queue", customerType: "Customer", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "b_arrive",
        name: "Customer Arrives",
        scheduledTime: "0",
        effect: ["ARRIVE(Customer, Counter Queue)"],
        schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2.2" } }],
      },
      {
        id: "b_counter_done",
        name: "Counter Complete",
        scheduledTime: "9999",
        effect: ["RELEASE(Clerk, Sorting Queue)", "servedAtCounter++"],
        schedules: [],
      },
      {
        id: "b_sort_done",
        name: "Sorting Complete",
        scheduledTime: "9999",
        effect: ["COMPLETE()"],
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c_counter",
        name: "Serve At Counter",
        priority: 1,
        condition: "queue(Counter Queue).length > 0 AND idle(Clerk).count > 0",
        effect: ["ASSIGN(Counter Queue, Clerk)"],
        cSchedules: [{ eventId: "b_counter_done", dist: "Uniform", distParams: { min: "1.5", max: "4.5" }, useEntityCtx: true }],
      },
      {
        id: "c_sort",
        name: "Sort Mail",
        priority: 2,
        condition: "queue(Sorting Queue).length > 0 AND idle(Sorter).count > 0",
        effect: ["ASSIGN(Sorting Queue, Sorter)"],
        cSchedules: [{ eventId: "b_sort_done", dist: "Uniform", distParams: { min: "2", max: "5" }, useEntityCtx: true }],
      },
    ],
  };
}

function makeGlasgowStyleTrainModel() {
  const model = findTemplate("tfl-station-plan");
  model.name = "Glasgow-Style Train Plan (Offline Benchmark)";
  model.description = "Offline planned-arrival crowd-flow benchmark based on a station platform and ticket barrier flow.";
  model.epoch = "2026-05-26T07:30:00";
  model.dataSources = [];
  model.experimentDefaults = {
    maxSimTime: 70,
    warmupPeriod: 0,
    replications: 1,
    liveDataMode: "off",
  };
  model.bEvents = model.bEvents.map(event => {
    if (event.id !== "b_train_arrive") return event;
    return {
      ...event,
      schedules: [{
        eventId: "b_train_arrive",
        dist: "Schedule",
        distParams: {
          rows: scheduleRows([0, 4, 8, 13, 18, 24, 31, 39, 48], (index) => ({
            line: index % 2 === 0 ? "Argyle" : "North Clyde",
          })),
        },
      }],
    };
  });
  return model;
}

function makeStadiumGroupedSpectatorsModel() {
  return {
    entityTypes: [
      { id: "et_group", name: "SpectatorGroup", role: "customer", count: 0, attrDefs: [
        { id: "a_group_size", name: "groupSize", valueType: "number", defaultValue: 4, mutable: false },
      ]},
      { id: "et_gate", name: "GateMarshal", role: "server", count: 3, attrDefs: [] },
      { id: "et_turnstile", name: "Turnstile", role: "server", count: 8, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q_plaza", name: "Entry Plaza", customerType: "SpectatorGroup", capacity: "", discipline: "FIFO" },
      { id: "q_turnstile", name: "Turnstile Queue", customerType: "SpectatorGroup", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "b_group_arrive",
        name: "Group Arrives",
        scheduledTime: "0",
        effect: ["ARRIVE(SpectatorGroup, Entry Plaza)"],
        schedules: [{
          eventId: "b_group_arrive",
          dist: "Schedule",
          distParams: {
            rows: scheduleRows([0, 1, 2, 3, 5, 7, 10, 14, 19, 25, 32], (index) => ({
              groupSize: [4, 6, 8, 10][index % 4],
            })),
          },
        }],
      },
      {
        id: "b_gate_done",
        name: "Gate Check Complete",
        scheduledTime: "9999",
        effect: ["RELEASE(GateMarshal, Turnstile Queue)"],
        schedules: [],
      },
      {
        id: "b_entry_done",
        name: "Entry Complete",
        scheduledTime: "9999",
        effect: ["COMPLETE()"],
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c_gate",
        name: "Check Tickets",
        priority: 1,
        condition: "queue(Entry Plaza).length > 0 AND idle(GateMarshal).count > 0",
        effect: ["ASSIGN(Entry Plaza, GateMarshal)"],
        cSchedules: [{ eventId: "b_gate_done", dist: "Uniform", distParams: { min: "0.5", max: "1.5" }, useEntityCtx: true }],
      },
      {
        id: "c_turnstile",
        name: "Pass Turnstile",
        priority: 2,
        condition: "queue(Turnstile Queue).length > 0 AND idle(Turnstile).count > 0",
        effect: ["ASSIGN(Turnstile Queue, Turnstile)"],
        cSchedules: [{ eventId: "b_entry_done", dist: "Uniform", distParams: { min: "0.2", max: "0.8" }, useEntityCtx: true }],
      },
    ],
  };
}

function makeLargeQueueStressModel() {
  return {
    entityTypes: [
      { id: "et_customer", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_server", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q_main", name: "Main Queue", customerType: "Customer", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "b_arrive",
        name: "Arrival",
        scheduledTime: "0",
        effect: ["ARRIVE(Customer, Main Queue)"],
        schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "0.45" } }],
      },
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: ["COMPLETE()"],
        schedules: [],
      },
    ],
    cEvents: [{
      id: "c_serve",
      name: "Serve Customer",
      priority: 1,
      condition: "queue(Main Queue).length > 0 AND idle(Server).count > 0",
      effect: ["ASSIGN(Main Queue, Server)"],
      cSchedules: [{ eventId: "b_complete", dist: "Exponential", distParams: { mean: "2.5" }, useEntityCtx: true }],
    }],
  };
}

function makeQueueDepthScalingModel(arrivalMean, serviceMean) {
  return {
    entityTypes: [
      { id: "et_customer", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_server", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q_main", name: "Main Queue", customerType: "Customer", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "b_arrive",
        name: "Arrival",
        scheduledTime: "0",
        effect: ["ARRIVE(Customer, Main Queue)"],
        schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: String(arrivalMean) } }],
      },
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: ["COMPLETE()"],
        schedules: [],
      },
    ],
    cEvents: [{
      id: "c_serve",
      name: "Serve Customer",
      priority: 1,
      condition: "queue(Main Queue).length > 0 AND idle(Server).count > 0",
      effect: ["ASSIGN(Main Queue, Server)"],
      cSchedules: [{ eventId: "b_complete", dist: "Exponential", distParams: { mean: String(serviceMean) }, useEntityCtx: true }],
    }],
  };
}

function makeManyFalseCEventModel(decoyCount = 40) {
  const queues = [{ id: "q_primary", name: "Primary Queue", customerType: "Customer", discipline: "FIFO" }];
  const decoyQueues = Array.from({ length: decoyCount }, (_, index) => ({
    id: `q_decoy_${index + 1}`,
    name: `Decoy Queue ${index + 1}`,
    customerType: "Customer",
    discipline: "FIFO",
  }));
  const cEvents = decoyQueues.map((queue, index) => ({
    id: `c_decoy_${index + 1}`,
    name: `Decoy ${index + 1}`,
    priority: index + 1,
    condition: `queue(${queue.name}).length > 0 AND idle(Server).count > 0`,
    effect: `ASSIGN(${queue.name}, Server)`,
    cSchedules: [{ eventId: "b_complete", dist: "Fixed", distParams: { value: "1.5" }, useEntityCtx: true }],
  }));
  cEvents.push({
    id: "c_primary",
    name: "Serve Primary",
    priority: decoyCount + 1,
    condition: "queue(Primary Queue).length > 0 AND idle(Server).count > 0",
    effect: "ASSIGN(Primary Queue, Server)",
    cSchedules: [{ eventId: "b_complete", dist: "Fixed", distParams: { value: "1.5" }, useEntityCtx: true }],
  });
  return {
    entityTypes: [
      { id: "et_customer", name: "Customer", role: "customer", count: 0, attrDefs: [] },
      { id: "et_server", name: "Server", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [...queues, ...decoyQueues],
    bEvents: [
      {
        id: "b_arrive",
        name: "Arrival",
        scheduledTime: "0",
        effect: "ARRIVE(Customer, Primary Queue)",
        schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.4" } }],
      },
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents,
  };
}

function makeHighChurnCEventModel(activeQueues = 12) {
  const queueDefs = Array.from({ length: activeQueues }, (_, index) => ({
    id: `q_active_${index + 1}`,
    name: `Active Queue ${index + 1}`,
    customerType: index % 2 === 0 ? "TypeA" : "TypeB",
    discipline: "FIFO",
  }));
  const arrivals = queueDefs.map((queue, index) => ({
    id: `b_arrive_${index + 1}`,
    name: `Arrival ${index + 1}`,
    scheduledTime: String((index % 3) * 0.1),
    effect: `ARRIVE(${queue.customerType}, ${queue.name})`,
    schedules: [{ eventId: `b_arrive_${index + 1}`, dist: "Exponential", distParams: { mean: String(6 + (index % 4)) } }],
  }));
  const cEvents = queueDefs.map((queue, index) => ({
    id: `c_service_${index + 1}`,
    name: `Serve ${queue.name}`,
    priority: index + 1,
    condition: `queue(${queue.name}).length > 0 AND idle(Server).count > 0`,
    effect: `ASSIGN(${queue.name}, Server)`,
    cSchedules: [{ eventId: "b_complete", dist: "Fixed", distParams: { value: String(1 + (index % 3) * 0.25) }, useEntityCtx: true }],
  }));
  return {
    entityTypes: [
      { id: "et_a", name: "TypeA", role: "customer", count: 0, attrDefs: [] },
      { id: "et_b", name: "TypeB", role: "customer", count: 0, attrDefs: [] },
      { id: "et_server", name: "Server", role: "server", count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    queues: queueDefs,
    bEvents: [
      ...arrivals,
      {
        id: "b_complete",
        name: "Complete",
        scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents,
  };
}

export function createBenchmarkScenarios({ includeStress = false } = {}) {
  const mm1 = findTemplate("mm1");
  return [
    {
      key: "mm1-small",
      label: "M/M/1 small",
      model: mm1,
      seed: 42,
      maxSimTime: 120,
      maxCycles: 20000,
      replications: 1,
      category: "core",
    },
    {
      key: "mm1-high-util",
      label: "M/M/1 high utilisation",
      model: mm1,
      seed: 42,
      maxSimTime: 600,
      maxCycles: 120000,
      replications: 1,
      category: "core",
    },
    {
      key: "post-office-multi-stage",
      label: "Multi-stage post office",
      model: makeMultiStagePostOfficeModel(),
      seed: 43,
      maxSimTime: 400,
      maxCycles: 120000,
      replications: 1,
      category: "core",
    },
    {
      key: "glasgow-train-plan",
      label: "Glasgow-style train model with planned arrivals",
      model: makeGlasgowStyleTrainModel(),
      seed: 44,
      maxSimTime: 70,
      maxCycles: 40000,
      replications: 1,
      category: "core",
    },
    {
      key: "stadium-grouped-spectators",
      label: "Stadium-style grouped spectators",
      model: makeStadiumGroupedSpectatorsModel(),
      seed: 45,
      maxSimTime: 40,
      maxCycles: 60000,
      replications: 1,
      category: "core",
    },
    {
      key: "many-c-events-mostly-false",
      label: "Many false C-events",
      model: makeManyFalseCEventModel(40),
      seed: 46,
      maxSimTime: 450,
      maxCycles: 120000,
      replications: 1,
      category: "phase-c",
    },
    {
      key: "many-c-events-high-churn",
      label: "Many active C-events",
      model: makeHighChurnCEventModel(12),
      seed: 47,
      maxSimTime: 500,
      maxCycles: 120000,
      replications: 1,
      category: "phase-c",
    },
    {
      key: "queue-depth-scaling-light",
      label: "Queue-depth scaling (light pressure)",
      model: makeQueueDepthScalingModel(1.15, 1.0),
      seed: 49,
      maxSimTime: 600,
      maxCycles: 120000,
      replications: 1,
      category: "queue-growth",
    },
    {
      key: "queue-depth-scaling-medium",
      label: "Queue-depth scaling (medium pressure)",
      model: makeQueueDepthScalingModel(1.02, 1.0),
      seed: 50,
      maxSimTime: 600,
      maxCycles: 120000,
      replications: 1,
      category: "queue-growth",
    },
    {
      key: "queue-depth-scaling-heavy",
      label: "Queue-depth scaling (heavy pressure)",
      model: makeQueueDepthScalingModel(0.96, 1.0),
      seed: 51,
      maxSimTime: 600,
      maxCycles: 120000,
      replications: 1,
      category: "queue-growth",
    },
    {
      key: "ae-department",
      label: "Accident and Emergency (9 types, 10 queues, 20 B/10 C, shifts, PRIORITY, sections)",
      model: makeAEModel(),
      seed: 687215104,
      maxSimTime: 1440,
      maxCycles: 120000,
      replications: 1,
      category: "real-world",
    },
    ...(includeStress ? [{
      key: "large-queues-stress",
      label: "Stress case with large queues",
      model: makeLargeQueueStressModel(),
      seed: 48,
      maxSimTime: 1000,
      maxCycles: 250000,
      replications: 1,
      category: "stress",
    }] : []),
  ];
}

function makeAEModel() {
  const cwd = typeof process !== "undefined" ? process.cwd() : __dirname;
  const candidatePaths = [
    resolve(__dirname, "../benchmarks/ae-model.json"),
    resolve(cwd, "tests/benchmarks/ae-model.json"),
  ];
  for (const p of candidatePaths) {
    try { return JSON.parse(readFileSync(p, "utf-8")).model_json; } catch {}
  }
  throw new Error("Cannot find tests/benchmarks/ae-model.json — run from project root");
}

export { makeAEModel };
