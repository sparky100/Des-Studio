import { describe, expect, it } from "vitest";
import { renameContainer, renameEntityType, renameQueue, renameServerInEvent, renameStateVariable } from "../../src/engine/queue-refs.js";

describe("queue and entity rename propagation", () => {
  it("updates queue references in C-event conditions when a queue is renamed", () => {
    const model = {
      queues: [{ id: "q1", name: "Waiting", customerType: "Patient", discipline: "FIFO" }],
      bEvents: [{ id: "b1", effect: "ARRIVE(Patient, Waiting)" }],
      cEvents: [{ id: "c1", condition: "queue(Waiting).length > 0 AND idle(Nurse).count > 0", effect: "ASSIGN(Waiting, Nurse)" }],
    };

    const next = renameQueue(model, "Waiting", "Triage Queue");

    expect(next.bEvents[0].effect).toBe("ARRIVE(Patient, Triage Queue)");
    expect(next.cEvents[0].condition).toBe("queue(Triage Queue).length > 0 AND idle(Nurse).count > 0");
    expect(next.cEvents[0].effect).toBe("ASSIGN(Triage Queue, Nurse)");
  });

  it("updates customer-type references when an entity type is renamed", () => {
    const model = {
      queues: [{ id: "q1", name: "Waiting", customerType: "Patient", discipline: "FIFO" }],
      bEvents: [
        { id: "b1", effect: "ARRIVE(Patient, Waiting)" },
        { id: "b2", effect: "RENEGE_OLDEST(Patient)" },
      ],
      cEvents: [
        { id: "c1", condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0", effect: "ASSIGN(Patient, Nurse)" },
      ],
    };

    const next = renameEntityType(model, "Patient", "Customer", "customer");

    expect(next.queues[0].customerType).toBe("Customer");
    expect(next.bEvents[0].effect).toBe("ARRIVE(Customer, Waiting)");
    expect(next.bEvents[1].effect).toBe("RENEGE_OLDEST(Customer)");
    expect(next.cEvents[0].condition).toBe("queue(Customer).length > 0 AND idle(Nurse).count > 0");
    expect(next.cEvents[0].effect).toBe("ASSIGN(Customer, Nurse)");
  });

  it("updates server-type references when a server entity type is renamed", () => {
    const model = {
      queues: [],
      bEvents: [{ id: "b1", effect: "RELEASE(Nurse, Treatment)" }],
      cEvents: [
        { id: "c1", condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0 AND attr(Nurse, speed) > 0", effect: "ASSIGN(Patient, Nurse)" },
      ],
    };

    const next = renameEntityType(model, "Nurse", "Triage Nurse", "server");

    expect(next.bEvents[0].effect).toBe("RELEASE(Triage Nurse, Treatment)");
    expect(next.cEvents[0].condition).toBe("queue(Patient).length > 0 AND idle(Triage Nurse).count > 0 AND attr(Triage Nurse, speed) > 0");
    expect(next.cEvents[0].effect).toBe("ASSIGN(Patient, Triage Nurse)");
  });

  it("does not rewrite queue-name references when a real queue already uses the old entity name", () => {
    const model = {
      queues: [{ id: "q1", name: "Patient", customerType: "Patient", discipline: "FIFO" }],
      bEvents: [{ id: "b1", effect: "ARRIVE(Patient, Patient)" }],
      cEvents: [{ id: "c1", condition: "queue(Patient).length > 0", effect: "ASSIGN(Patient, Nurse)" }],
    };

    const next = renameEntityType(model, "Patient", "Customer", "customer");

    expect(next.queues[0].customerType).toBe("Customer");
    expect(next.bEvents[0].effect).toBe("ARRIVE(Customer, Patient)");
    expect(next.cEvents[0].condition).toBe("queue(Patient).length > 0");
    expect(next.cEvents[0].effect).toBe("ASSIGN(Patient, Nurse)");
  });

  it("updates both JOIN arguments when either queue is renamed (Sprint 98)", () => {
    const model = {
      queues: [
        { id: "q1", name: "SyncQueue", customerType: "Patient", discipline: "FIFO" },
        { id: "q2", name: "ReviewQueue", customerType: "Patient", discipline: "FIFO" },
      ],
      bEvents: [],
      cEvents: [{ id: "c1", condition: "queue(SyncQueue).length > 0", effect: "JOIN(SyncQueue, ReviewQueue)" }],
    };

    const renamedRendezvous = renameQueue(model, "SyncQueue", "Rendezvous");
    expect(renamedRendezvous.cEvents[0].condition).toBe("queue(Rendezvous).length > 0");
    expect(renamedRendezvous.cEvents[0].effect).toBe("JOIN(Rendezvous, ReviewQueue)");

    const renamedTarget = renameQueue(model, "ReviewQueue", "Consult Queue");
    expect(renamedTarget.cEvents[0].effect).toBe("JOIN(SyncQueue, Consult Queue)");
  });

  it("preserves array-shaped C-event effects through a queue rename instead of coercing them to a string", () => {
    const model = {
      queues: [{ id: "q1", name: "SyncQueue", customerType: "Patient", discipline: "FIFO" }],
      bEvents: [],
      cEvents: [{
        id: "c1",
        condition: "queue(SyncQueue).length > 0",
        effect: ["JOIN(SyncQueue, ReviewQueue)", "joinCount++"],
      }],
    };

    const next = renameQueue(model, "SyncQueue", "Rendezvous");

    expect(Array.isArray(next.cEvents[0].effect)).toBe(true);
    expect(next.cEvents[0].effect).toEqual(["JOIN(Rendezvous, ReviewQueue)", "joinCount++"]);
  });
});

// Reference sites the renames used to miss (World Oil Network audit, 2026-10).
// tests/engine/rename-reference-model.test.js (soak tier) checks a full model.
describe("rename propagation — newer macros, array effects, both sides of conditions", () => {
  const leaf = (variable, operator, value) => ({ variable, operator, value });

  it("renames a server type in COSEIZE (with :N / [Skill] suffixes), RELEASE_COSEIZED lists and array C-event effects", () => {
    const model = {
      queues: [{ name: "Q" }],
      bEvents: [{ id: "b", effect: ["RELEASE_COSEIZED([Berth, VLCC], Next)", "RELEASE(VLCC, Hub)"] }],
      cEvents: [{ id: "c", condition: leaf("idle(VLCC).count", ">", 0), effect: ["COSEIZE(Q, Berth, VLCC:2)", "COSEIZE(Q, VLCC[Sour], Berth)"] }],
      goals: [{ metric: "resource.utilisation", scope: { type: "resource", id: "et_v", name: "VLCC" } }],
    };
    const next = renameEntityType(model, "VLCC", "Tanker", "server");
    expect(next.bEvents[0].effect).toEqual(["RELEASE_COSEIZED([Berth, Tanker], Next)", "RELEASE(Tanker, Hub)"]);
    expect(next.cEvents[0].effect).toEqual(["COSEIZE(Q, Berth, Tanker:2)", "COSEIZE(Q, Tanker[Sour], Berth)"]);
    expect(next.cEvents[0].condition).toEqual(leaf("idle(Tanker).count", ">", 0));
    expect(next.goals[0].scope.name).toBe("Tanker");
  });

  it("renames a queue in COSEIZE, DELAY, MATCH, balkCondition (both syntaxes), B-event routing conditions, distances and goal scopes", () => {
    const model = {
      queues: [{ name: "Load", balkCondition: leaf("Queue.Load.length", ">=", 5) }, { name: "Other", balkCondition: leaf("queue(Load).length", ">", "queue(Other).length") }],
      bEvents: [{ id: "b", effect: "DELAY(Load)", routing: [{ queueName: "Load", condition: leaf("queue(Load).length", ">", 6) }] }],
      cEvents: [{ id: "c", effect: ["COSEIZE(Load, Berth, VLCC)", "MATCH(A, Load, B, Other, Load)"] }],
      distances: [{ fromQueue: "Load", toQueue: "Other", distance: 3 }],
      goals: [{ metric: "summary.avgWait", scope: { type: "queue", id: "q1", name: "Load" } }],
    };
    const next = renameQueue(model, "Load", "Terminal");
    expect(next.bEvents[0].effect).toBe("DELAY(Terminal)");
    expect(next.bEvents[0].routing[0]).toEqual({ queueName: "Terminal", condition: leaf("queue(Terminal).length", ">", 6) });
    expect(next.cEvents[0].effect).toEqual(["COSEIZE(Terminal, Berth, VLCC)", "MATCH(A, Terminal, B, Other, Terminal)"]);
    expect(next.queues[0].balkCondition).toEqual(leaf("Queue.Terminal.length", ">=", 5));
    expect(next.queues[1].balkCondition).toEqual(leaf("queue(Terminal).length", ">", "queue(Other).length"));
    expect(next.distances[0]).toEqual({ fromQueue: "Terminal", toQueue: "Other", distance: 3 });
    expect(next.goals[0].scope.name).toBe("Terminal");
  });

  it("renames a state variable on both sides of conditions, in balkCondition, SET / expressions, scalar statements and exposed-parameter paths", () => {
    const model = {
      queues: [{ name: "Load", balkCondition: leaf("Queue.Load.length", ">=", "storage") }],
      bEvents: [{ id: "b", effect: ["SET(level, storage + 1)", "storage += 2", "SET_ATTR(storage, 1)"], routing: [{ queueName: "X", condition: leaf("storage", "==", 0) }] }],
      cEvents: [{ id: "c", condition: leaf("clock", ">=", "storage"), effect: ["SET(storage, 0)", "FILL(tank, Entity.storage * 2)"] }],
      experimentDefaults: { terminationCondition: leaf("state.storage", ">", 3) },
      exposedParams: [{ path: "stateVariables.storage.initialValue", businessLabel: "Storage" }],
    };
    const next = renameStateVariable(model, "storage", "capacity");
    expect(next.queues[0].balkCondition.value).toBe("capacity");
    // SET_ATTR's first argument is an entity attribute, and Entity.storage is too — left alone.
    expect(next.bEvents[0].effect).toEqual(["SET(level, capacity + 1)", "capacity += 2", "SET_ATTR(storage, 1)"]);
    expect(next.bEvents[0].routing[0].condition).toEqual(leaf("capacity", "==", 0));
    expect(next.cEvents[0].condition).toEqual(leaf("clock", ">=", "capacity"));
    expect(next.cEvents[0].effect).toEqual(["SET(capacity, 0)", "FILL(tank, Entity.storage * 2)"]);
    expect(next.experimentDefaults.terminationCondition).toEqual(leaf("state.capacity", ">", 3));
    expect(next.exposedParams[0].path).toBe("stateVariables.capacity.initialValue");
  });

  it("renames a container in array C-event effects, right-hand-side tokens and goal scope name and id", () => {
    const model = {
      queues: [],
      bEvents: [],
      cEvents: [{ id: "c", condition: leaf("container(Tank).level", "<", "container(Tank).capacity"), effect: ["DRAIN_PARTIAL(Tank, 4, Lost)"] }],
      goals: [{ metric: "container.maxLevel", scope: { type: "container", id: "Tank", name: "Tank" } }],
    };
    const next = renameContainer(model, "Tank", "Reservoir");
    expect(next.cEvents[0].condition).toEqual(leaf("container(Reservoir).level", "<", "container(Reservoir).capacity"));
    expect(next.cEvents[0].effect).toEqual(["DRAIN_PARTIAL(Reservoir, 4, Lost)"]);
    expect(next.goals[0].scope).toEqual({ type: "container", id: "Reservoir", name: "Reservoir" });
  });

  it("renameServerInEvent keeps an object condition and an array effect intact", () => {
    const event = {
      id: "c",
      condition: { operator: "AND", clauses: [leaf("queue(Wait).length", ">", 0), leaf("idle(Nurse).count", ">", 0)] },
      effect: ["ASSIGN(Wait, Nurse)"],
    };
    const next = renameServerInEvent(event, "Nurse", "Doctor");
    expect(next.condition).toEqual({ operator: "AND", clauses: [leaf("queue(Wait).length", ">", 0), leaf("idle(Doctor).count", ">", 0)] });
    expect(next.effect).toEqual(["ASSIGN(Wait, Doctor)"]);
  });

  it("leaves names that only contain the old name alone", () => {
    const model = {
      queues: [{ name: "Gulf VLCC Loading Queue" }],
      bEvents: [{ id: "b", effect: ["ARRIVE(Cargo, Gulf VLCC Loading Queue)"] }],
      cEvents: [{ id: "c", condition: leaf("queue(Gulf VLCC Loading Queue).length", ">", 0), effect: ["COSEIZE(Gulf VLCC Loading Queue, Berth, Gulf VLCC)"] }],
    };
    const next = renameEntityType(model, "Gulf VLCC", "GV", "server");
    expect(next.bEvents[0].effect).toEqual(["ARRIVE(Cargo, Gulf VLCC Loading Queue)"]);
    expect(next.cEvents[0].condition).toEqual(leaf("queue(Gulf VLCC Loading Queue).length", ">", 0));
    expect(next.cEvents[0].effect).toEqual(["COSEIZE(Gulf VLCC Loading Queue, Berth, GV)"]);
  });
});

