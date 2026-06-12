import { describe, it, expect } from "vitest";
import { exportToSimPy } from "../../src/engine/simpy-export.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const minimalModel = {
  name: "Minimal",
  bEvents: [
    {
      id: "b1", name: "Arrivals",
      effect: "ARRIVE(Customer, WaitQueue)",
      schedules: [{ dist: "Exponential", distParams: { mean: 5 } }],
    },
  ],
  cEvents: [
    {
      id: "c1", name: "Service",
      effect: "ASSIGN(WaitQueue, Clerk)",
      cSchedules: [{ eventId: "b2", dist: "Exponential", distParams: { mean: 3 } }],
    },
  ],
  entityTypes: [
    { id: "e1", name: "Customer", role: "customer", attrDefs: [] },
    { id: "e2", name: "Clerk", role: "server", count: 2 },
  ],
  queues: [{ id: "q1", name: "WaitQueue" }],
  containerTypes: [],
  stateVariables: [],
  experimentDefaults: { maxSimTime: 480, warmupPeriod: 60, replications: 5 },
};

const multiStageModel = {
  name: "Multi-Stage",
  bEvents: [
    {
      id: "b1", name: "ArriveA",
      effect: "ARRIVE(JobA, QueueA)",
      schedules: [{ dist: "Exponential", distParams: { mean: 2 } }],
    },
    {
      id: "b2", name: "ToStage2",
      effect: "ROUTE(QueueB)",
      defaultQueueName: "QueueB",
    },
    {
      id: "b3", name: "CompleteJob",
      effect: "COMPLETE()",
    },
  ],
  cEvents: [
    {
      id: "c1", name: "Stage1",
      effect: "ASSIGN(QueueA, Worker1)",
      cSchedules: [{ eventId: "b2", dist: "Fixed", distParams: { value: 5 } }],
    },
    {
      id: "c2", name: "Stage2",
      effect: "ASSIGN(QueueB, Worker2)",
      cSchedules: [{ eventId: "b3", dist: "Uniform", distParams: { min: 1, max: 4 } }],
    },
  ],
  entityTypes: [
    { id: "e1", name: "JobA", role: "customer", attrDefs: [] },
    { id: "e2", name: "Worker1", role: "server", count: 1 },
    { id: "e3", name: "Worker2", role: "server", count: 3 },
  ],
  queues: [
    { id: "q1", name: "QueueA" },
    { id: "q2", name: "QueueB" },
  ],
  containerTypes: [],
  stateVariables: [],
  experimentDefaults: { maxSimTime: 200, warmupPeriod: 0, replications: 1 },
};

const todoModel = {
  name: "WithTodos",
  bEvents: [
    {
      id: "b1", name: "Arrive",
      effect: "ARRIVE(Customer, Queue1)",
      schedules: [{ dist: "Exponential", distParams: { mean: 3 } }],
    },
    {
      id: "b2", name: "CheckRenege",
      effect: "RENEGE(Customer, Queue1, 10)",
    },
    {
      id: "b3", name: "BatchUp",
      effect: "BATCH(Customer, Queue1, 5, BatchQueue)",
    },
  ],
  cEvents: [
    {
      id: "c1", name: "Serve",
      effect: "ASSIGN(Queue1, Server1)",
      cSchedules: [{ dist: "Exponential", distParams: { mean: 2 } }],
    },
    {
      id: "c2", name: "FailServer",
      effect: "FAIL(Server1)",
    },
  ],
  entityTypes: [
    { id: "e1", name: "Customer", role: "customer" },
    { id: "e2", name: "Server1", role: "server", count: 1 },
  ],
  queues: [{ id: "q1", name: "Queue1" }],
  containerTypes: [],
  stateVariables: [],
  experimentDefaults: {},
};

const containerModel = {
  name: "Tank",
  bEvents: [
    {
      id: "b1", name: "Fill",
      effect: "FILL(TankA, 50)",
      schedules: [{ dist: "Exponential", distParams: { mean: 10 } }],
    },
    {
      id: "b2", name: "Drain",
      effect: "DRAIN(TankA, 20)",
    },
  ],
  cEvents: [],
  entityTypes: [],
  queues: [],
  containerTypes: [
    { id: "TankA", capacity: "500", initialLevel: "100" },
  ],
  stateVariables: [],
  experimentDefaults: {},
};

const coseizeModel = {
  name: "CoSeize",
  bEvents: [
    {
      id: "b1", name: "Arrive",
      effect: "ARRIVE(Patient, WaitRoom)",
      schedules: [{ dist: "Exponential", distParams: { mean: 8 } }],
    },
  ],
  cEvents: [
    {
      id: "c1", name: "Treatment",
      effect: "COSEIZE(WaitRoom, Doctor, Nurse)",
      cSchedules: [{ dist: "Normal", distParams: { mean: 30, stddev: 5 } }],
    },
  ],
  entityTypes: [
    { id: "e1", name: "Patient", role: "customer" },
    { id: "e2", name: "Doctor", role: "server", count: 2 },
    { id: "e3", name: "Nurse", role: "server", count: 4 },
  ],
  queues: [{ id: "q1", name: "WaitRoom" }],
  containerTypes: [],
  stateVariables: [{ name: "totalCost", valueType: "number", initialValue: 0 }],
  experimentDefaults: {},
};

const emptyModel = {
  name: "",
  bEvents: [],
  cEvents: [],
  entityTypes: [],
  queues: [],
  containerTypes: [],
  stateVariables: [],
  experimentDefaults: {},
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("exportToSimPy", () => {
  describe("return shape", () => {
    it("returns { script, category, todoMacros } for a minimal model", () => {
      const result = exportToSimPy(minimalModel);
      expect(result).toHaveProperty("script");
      expect(result).toHaveProperty("category");
      expect(result).toHaveProperty("todoMacros");
      expect(typeof result.script).toBe("string");
      expect(result.script.length).toBeGreaterThan(100);
    });
  });

  describe("category classification", () => {
    it("assigns category 1 when no TODO macros are present", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.category).toBe(1);
      expect(result.todoMacros).toHaveLength(0);
    });

    it("assigns category 2 when RENEGE is present", () => {
      const result = exportToSimPy(todoModel);
      expect(result.category).toBe(2);
    });

    it("lists RENEGE, BATCH, FAIL as todoMacros for todoModel", () => {
      const result = exportToSimPy(todoModel);
      expect(result.todoMacros).toContain("RENEGE");
      expect(result.todoMacros).toContain("BATCH");
      expect(result.todoMacros).toContain("FAIL");
    });

    it("todoMacros list is sorted", () => {
      const result = exportToSimPy(todoModel);
      const sorted = [...result.todoMacros].sort();
      expect(result.todoMacros).toEqual(sorted);
    });
  });

  describe("script header", () => {
    it("includes the model name in the docstring", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("Minimal");
    });

    it("marks Category 1 in the docstring", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("Category 1");
    });

    it("marks Category 2 in the docstring for todoModel", () => {
      const result = exportToSimPy(todoModel);
      expect(result.script).toContain("Category 2");
    });

    it("lists TODO macros in the docstring for category 2", () => {
      const result = exportToSimPy(todoModel);
      expect(result.script).toContain("RENEGE");
      expect(result.script).toContain("BATCH");
    });
  });

  describe("configuration constants", () => {
    it("writes MAX_SIM_TIME from experimentDefaults", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("MAX_SIM_TIME   = 480");
    });

    it("writes WARMUP_PERIOD from experimentDefaults", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("WARMUP_PERIOD  = 60");
    });

    it("writes REPLICATIONS from experimentDefaults", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("REPLICATIONS   = 5");
    });

    it("falls back to defaults for empty experimentDefaults", () => {
      const result = exportToSimPy(emptyModel);
      expect(result.script).toContain("MAX_SIM_TIME   = 500");
      expect(result.script).toContain("REPLICATIONS   = 1");
    });
  });

  describe("arrival processes", () => {
    it("generates an arrival function for each ARRIVE b-event", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("def arrival_Arrivals(");
    });

    it("uses exponential inter-arrival distribution", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("_exp(5)");
    });

    it("instantiates the correct entity class", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("entity = Customer(id=_counter");
    });

    it("yields a put to the correct store", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("WaitQueue_store.put(entity)");
    });
  });

  describe("service processes", () => {
    it("generates a monitor function for each ASSIGN c-event", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("def Service_monitor(");
    });

    it("generates a service function for each ASSIGN c-event", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("def Service_serve(");
    });

    it("uses exponential service distribution", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("_exp(3)");
    });

    it("uses fixed service distribution for multi-stage model", () => {
      const result = exportToSimPy(multiStageModel);
      expect(result.script).toContain("_fixed(5)");
    });

    it("uses uniform service distribution", () => {
      const result = exportToSimPy(multiStageModel);
      expect(result.script).toContain("_uniform(1, 4)");
    });
  });

  describe("COSEIZE", () => {
    it("generates a COSEIZE service function using simpy.AllOf", () => {
      const result = exportToSimPy(coseizeModel);
      expect(result.script).toContain("simpy.AllOf");
    });

    it("requests both resources", () => {
      const result = exportToSimPy(coseizeModel);
      expect(result.script).toContain("Doctor_resource.request()");
      expect(result.script).toContain("Nurse_resource.request()");
    });

    it("uses normal distribution for service time", () => {
      const result = exportToSimPy(coseizeModel);
      expect(result.script).toContain("_normal(30, 5)");
    });
  });

  describe("entity dataclasses", () => {
    it("generates @dataclass for each customer entity type", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("@dataclass");
      expect(result.script).toContain("class Customer:");
    });

    it("generates a fallback Entity class when no customer types defined", () => {
      const result = exportToSimPy(emptyModel);
      expect(result.script).toContain("class Entity:");
    });

    it("does not generate a class for server entity types", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).not.toContain("class Clerk:");
    });
  });

  describe("resources", () => {
    it("creates a simpy.Resource for each server type", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("Clerk_resource = simpy.Resource(env, capacity=2)");
    });

    it("defaults capacity to 1 when count is absent", () => {
      const model = {
        ...minimalModel,
        entityTypes: [
          { id: "e1", name: "Customer", role: "customer" },
          { id: "e2", name: "Clerk", role: "server" },
        ],
      };
      const result = exportToSimPy(model);
      expect(result.script).toContain("Clerk_resource = simpy.Resource(env, capacity=1)");
    });

    it("uses shiftSchedule[0].capacity as initial capacity when shift schedule is present", () => {
      const model = {
        ...minimalModel,
        entityTypes: [
          { id: "e1", name: "Customer", role: "customer" },
          { id: "e2", name: "Clerk", role: "server", count: 0, shiftSchedule: [{ time: 0, capacity: 5 }, { time: 480, capacity: 2 }] },
        ],
      };
      const result = exportToSimPy(model);
      expect(result.script).toContain("Clerk_resource = simpy.Resource(env, capacity=5)");
    });

    it("shiftSchedule[0].capacity overrides count=0", () => {
      const model = {
        ...minimalModel,
        entityTypes: [
          { id: "e1", name: "Customer", role: "customer" },
          { id: "e2", name: "Clerk", role: "server", count: 0, shiftSchedule: [{ time: 0, capacity: 10 }] },
        ],
      };
      const result = exportToSimPy(model);
      expect(result.script).toContain("Clerk_resource = simpy.Resource(env, capacity=10)");
      expect(result.script).not.toContain("capacity=0");
    });
  });

  describe("queues (stores)", () => {
    it("creates a simpy.Store for each queue", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("WaitQueue_store = simpy.Store(env)");
    });

    it("creates bounded stores for queues with a capacity", () => {
      const model = {
        ...minimalModel,
        queues: [{ id: "q1", name: "WaitQueue", capacity: "10" }],
      };
      const result = exportToSimPy(model);
      expect(result.script).toContain("simpy.Store(env, capacity=10)");
    });
  });

  describe("containers", () => {
    it("creates a simpy.Container for each container type", () => {
      const result = exportToSimPy(containerModel);
      expect(result.script).toContain("TankA_container = simpy.Container(env, capacity=500, init=100)");
    });

    it("includes the DRAIN semantic divergence note", () => {
      const result = exportToSimPy(containerModel);
      expect(result.script).toContain("DRAIN guards");
    });
  });

  describe("state variables", () => {
    it("declares module-level state variables", () => {
      const result = exportToSimPy(coseizeModel);
      expect(result.script).toContain("totalCost = 0");
    });

    it("resets state variables at start of run_replication", () => {
      const result = exportToSimPy(coseizeModel);
      expect(result.script).toContain("global totalCost");
    });
  });

  describe("run_replication", () => {
    it("generates a run_replication function", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("def run_replication(seed):");
    });

    it("calls env.run(until=MAX_SIM_TIME)", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("env.run(until=MAX_SIM_TIME)");
    });

    it("returns a results dict with served/reneged/avg_sojourn/total_cost", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain('"served"');
      expect(result.script).toContain('"reneged"');
      expect(result.script).toContain('"avg_sojourn"');
      expect(result.script).toContain('"total_cost"');
    });
  });

  describe("main block", () => {
    it("includes the __main__ guard", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain('if __name__ == "__main__":');
    });

    it("iterates over REPLICATIONS", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("for _rep in range(REPLICATIONS):");
    });

    it("prints a summary when REPLICATIONS > 1", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("Replication summary");
    });
  });

  describe("TODO macro stubs", () => {
    it("includes RENEGE stub with pattern comment", () => {
      const result = exportToSimPy(todoModel);
      expect(result.script).toContain("# TODO (RENEGE):");
    });

    it("includes BATCH stub with pattern comment", () => {
      const result = exportToSimPy(todoModel);
      expect(result.script).toContain("# TODO (BATCH):");
    });

    it("includes FAIL stub with pattern comment", () => {
      const result = exportToSimPy(todoModel);
      expect(result.script).toContain("# TODO (FAIL):");
    });

    it("does not include RENEGE stub in category 1 script", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).not.toContain("# TODO (RENEGE):");
    });
  });

  describe("multi-stage routing", () => {
    it("routes to the second queue via the completion B-event's defaultQueueName", () => {
      const result = exportToSimPy(multiStageModel);
      expect(result.script).toContain("QueueB_store.put(entity)");
    });

    it("generates two separate service function pairs", () => {
      const result = exportToSimPy(multiStageModel);
      expect(result.script).toContain("def Stage1_monitor(");
      expect(result.script).toContain("def Stage2_monitor(");
    });
  });

  describe("multi-stage wait/service time tracking (Bug C)", () => {
    it("entity dataclass includes wait_time_acc and svc_time_acc fields", () => {
      const result = exportToSimPy(multiStageModel);
      expect(result.script).toContain("wait_time_acc: float = 0.0");
      expect(result.script).toContain("svc_time_acc: float = 0.0");
      expect(result.script).toContain("queue_join_time: float = 0.0");
    });

    it("routing code sets queue_join_time before each store put", () => {
      const result = exportToSimPy(multiStageModel);
      // queue_join_time must appear before QueueB_store.put in the script
      const qjt = result.script.indexOf("entity.queue_join_time = env.now");
      const put = result.script.indexOf("QueueB_store.put(entity)");
      expect(qjt).toBeGreaterThan(-1);
      expect(put).toBeGreaterThan(qjt);
    });

    it("statistics block uses wait_time_acc and svc_time_acc, not service_start_time arithmetic", () => {
      const result = exportToSimPy(multiStageModel);
      expect(result.script).toContain("e.wait_time_acc");
      expect(result.script).toContain("e.svc_time_acc");
      expect(result.script).not.toContain("e.service_start_time - e.arrival_time");
    });
  });

  describe("empty model edge case", () => {
    it("produces a valid (non-empty) script for a completely empty model", () => {
      const result = exportToSimPy(emptyModel);
      expect(result.script.length).toBeGreaterThan(100);
      expect(result.category).toBe(1);
      expect(result.todoMacros).toHaveLength(0);
    });

    it("uses fallback 'Untitled' for model name in docstring", () => {
      const result = exportToSimPy(emptyModel);
      expect(result.script).toContain("Untitled");
    });
  });

  describe("imports and requirements", () => {
    it("imports simpy", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("import simpy");
    });

    it("imports random and statistics", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("import random");
      expect(result.script).toContain("import statistics");
    });

    it("includes pip install hint", () => {
      const result = exportToSimPy(minimalModel);
      expect(result.script).toContain("pip install simpy");
    });
  });
});
