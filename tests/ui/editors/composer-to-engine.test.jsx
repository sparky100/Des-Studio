// UI-composer → engine integration suite (Sprint 98, retroactive to Sprints
// 94–97). The effect-picker tests' matchesEngine guard proves a composed
// string PARSES; this suite proves it EXECUTES as part of a longer process
// (user requirement: "test it through the UI as well as just the engine …
// the use of these macros is usually part of a longer process").
//
// Each test:
//   1. renders the real EffectPicker with a realistic expressionContext and
//      drives its composer with fireEvent exactly as a user would, capturing
//      the emitted effect string from the onChange spy;
//   2. splices that exact string — verbatim, never hand-edited — into a
//      complete multi-stage model (arrival → seize/service → the composed
//      macro → downstream routing → completion);
//   3. runs the model through buildEngine and asserts end-to-end BEHAVIOR,
//      not the string.
//
// This file is the standing home for "composer output runs correctly inside
// a longer process" — every future macro sprint adds its row here.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EffectPicker } from "../../../src/ui/editors/helpers.jsx";
import { buildEngine } from "../../../src/engine/index.js";

// Render the picker, drive the composer, capture the one emitted string.
function composeEffect(expressionContext, drive) {
  const onChange = vi.fn();
  render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={expressionContext} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
  drive();
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(onChange).toHaveBeenCalledTimes(1);
  const effects = onChange.mock.calls[0][0];
  expect(effects).toHaveLength(1);
  cleanup(); // several composes can happen inside one test
  return effects[0];
}

const run = (model, horizon, seed = 42) => buildEngine(model, seed, 0, horizon).runAll();
const customers = (r) => r.entitySummary.filter(e => e.role === "customer");
const serversOf = (r, type) => r.entitySummary.filter(e => e.role === "server" && e.type === type);

describe("composer → engine: JOIN (Sprint 98)", () => {
  it("a composed JOIN drives a real fork/join: SPLIT clones rendezvous and merge into one survivor", () => {
    const effect = composeEffect(
      // Queue order makes the composer's committed defaults exactly the
      // rendezvous → target pair the model needs.
      { matchQueues: [{ name: "SyncQueue", type: "Patient" }, { name: "ReviewQueue", type: "Patient" }] },
      () => fireEvent.click(screen.getByRole("button", { name: "JOIN (fork/join)" })),
    );
    expect(effect).toBe("JOIN(SyncQueue, ReviewQueue)");

    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 1, attrDefs: [] },
        { id: "lab", name: "Lab", role: "server", count: 2, attrDefs: [] },
        { id: "consultant", name: "Consultant", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q_intake", name: "IntakeQueue", discipline: "FIFO" },
        { id: "q_test", name: "TestQueue", discipline: "FIFO" },
        { id: "q_sync", name: "SyncQueue", discipline: "FIFO" },
        { id: "q_review", name: "ReviewQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient, IntakeQueue)", schedules: [] },
        { id: "triage-done", name: "Triage Done", scheduledTime: "9999",
          effect: ["SPLIT(Patient, 3, TestQueue)", "RELEASE(Nurse, SyncQueue)"], schedules: [] },
        { id: "lab-done", name: "Lab Done", scheduledTime: "9999", effect: "RELEASE(Lab, SyncQueue)", schedules: [] },
        { id: "review-done", name: "Review Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "ce_triage", name: "Triage", priority: 1,
          condition: "queue(IntakeQueue).length > 0 AND idle(Nurse).count > 0",
          effect: "ASSIGN(IntakeQueue, Nurse)",
          cSchedules: [{ eventId: "triage-done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
        { id: "ce_lab", name: "Run Test", priority: 2,
          condition: "queue(TestQueue).length > 0 AND idle(Lab).count > 0",
          effect: "ASSIGN(TestQueue, Lab)",
          cSchedules: [{ eventId: "lab-done", dist: "Fixed", distParams: { value: "4" }, useEntityCtx: true }] },
        { id: "ce_join", name: "Rendezvous", priority: 3, condition: "queue(SyncQueue).length > 0",
          effect: effect, cSchedules: [] },
        { id: "ce_review", name: "Review", priority: 4,
          condition: "queue(ReviewQueue).length > 0 AND idle(Consultant).count > 0",
          effect: "ASSIGN(ReviewQueue, Consultant)",
          cSchedules: [{ eventId: "review-done", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }] },
      ],
    };

    const result = run(model, 30);
    const parent = customers(result).find(e => e._splitParent === true);
    expect(parent.joined).toBeDefined();
    expect(parent.joined.children).toHaveLength(2);
    expect(parent.status).toBe("done");
    const mergedClones = customers(result).filter(e => e.outcome?.endedBy === "JOIN");
    expect(mergedClones).toHaveLength(2);
    for (const clone of mergedClones) expect(clone._joinedInto).toBe(parent.id);
  });
});

describe("composer → engine: COSEIZE Type:N (Sprint 95)", () => {
  it("a composed 2-Nurse + 1-Doctor seize holds exactly those servers, all released on completion", () => {
    const effect = composeEffect(
      { matchQueues: [{ name: "SurgeryQueue", type: "Patient" }], serverTypes: ["Nurse", "Doctor"] },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
        fireEvent.change(screen.getByLabelText("Quantity for server type row 1"), { target: { value: "2" } });
      },
    );
    expect(effect).toBe("COSEIZE(SurgeryQueue, Nurse:2, Doctor)");

    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
        { id: "doctor", name: "Doctor", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "q_surgery", name: "SurgeryQueue", discipline: "FIFO" },
        { id: "q_ward", name: "WardQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrival", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient, SurgeryQueue)", schedules: [] },
        { id: "surgery-done", name: "Surgery Done", scheduledTime: "9999",
          effect: "RELEASE_COSEIZED([Nurse, Doctor], WardQueue)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_surgery", name: "Surgery", priority: 1, condition: "queue(SurgeryQueue).length > 0",
          effect: effect,
          cSchedules: [{ eventId: "surgery-done", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }] },
      ],
    };

    // Mid-surgery (horizon 3 < the Fixed-5 completion): the composed
    // quantities are exactly what's held — 2 of 3 Nurses, the 1 Doctor.
    const midRun = run(model, 3);
    expect(serversOf(midRun, "Nurse").filter(s => s.status === "busy")).toHaveLength(2);
    expect(serversOf(midRun, "Nurse").filter(s => s.status === "idle")).toHaveLength(1);
    expect(serversOf(midRun, "Doctor").filter(s => s.status === "busy")).toHaveLength(1);

    // After completion: every co-seized server released, patient routed on.
    const fullRun = run(model, 10);
    expect(serversOf(fullRun, "Nurse").every(s => s.status === "idle")).toBe(true);
    expect(serversOf(fullRun, "Doctor").every(s => s.status === "idle")).toBe(true);
    const patient = customers(fullRun)[0];
    expect(patient.status).toBe("waiting");
    expect(patient.queue).toBe("WardQueue");
  });
});

describe("composer → engine: FAIL/REPAIR quantities (Sprint 96)", () => {
  it("composed FAIL(Nurse, 1) then REPAIR(Nurse, 1) break and restore exactly one server of the bank", () => {
    const ctx = { matchQueues: [{ name: "Queue", type: "Patient" }], bEventServerTypes: ["Nurse"] };
    const failEffect = composeEffect(ctx, () => {
      fireEvent.click(screen.getByRole("button", { name: "FAIL (N servers)" }));
      fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "1" } });
    });
    const repairEffect = composeEffect(ctx, () => {
      fireEvent.click(screen.getByRole("button", { name: "REPAIR (N servers)" }));
      fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "1" } });
    });
    expect(failEffect).toBe("FAIL(Nurse, 1)");
    expect(repairEffect).toBe("REPAIR(Nurse, 1)");

    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrival", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient, Queue)", schedules: [] },
        { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
        { id: "breakdown", name: "Breakdown", scheduledTime: "2", effect: failEffect, schedules: [] },
        { id: "fixup", name: "Fix", scheduledTime: "5", effect: repairEffect, schedules: [] },
      ],
      cEvents: [
        { id: "ce_serve", name: "Serve", priority: 1,
          condition: "queue(Queue).length > 0 AND idle(Nurse).count > 0",
          effect: "ASSIGN(Queue, Nurse)",
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "8" }, useEntityCtx: true }] },
      ],
    };

    // Between FAIL (t=2) and REPAIR (t=5): exactly one Nurse down, and the
    // serving Nurse untouched (idle-first victim selection) — service continues.
    const midRun = run(model, 4);
    const nursesMid = serversOf(midRun, "Nurse");
    expect(nursesMid.filter(s => s.status === "failed")).toHaveLength(1);
    expect(nursesMid.filter(s => s.status === "busy")).toHaveLength(1);
    expect(customers(midRun)[0].status).toBe("serving");

    // After REPAIR: the bank is whole again and the patient completed at t=8.
    const fullRun = run(model, 10);
    expect(serversOf(fullRun, "Nurse").filter(s => s.status === "failed")).toHaveLength(0);
    expect(customers(fullRun)[0].status).toBe("done");
  });
});

// Three staggered patients with distinct priorities — the Sprint 97 victim-
// selection fixture: PatientA (arrives t=0, priority 3), PatientB (t=1,
// priority 1 — lowest), PatientC (t=2, priority 5). PRIORITY → B, LONGEST → A.
function threePatientModel(actionEffect) {
  return {
    entityTypes: [
      { id: "pa", name: "PatientA", role: "customer", attrDefs: [{ name: "priority", dist: "Fixed", distParams: { value: "3" } }] },
      { id: "pb", name: "PatientB", role: "customer", attrDefs: [{ name: "priority", dist: "Fixed", distParams: { value: "1" } }] },
      { id: "pc", name: "PatientC", role: "customer", attrDefs: [{ name: "priority", dist: "Fixed", distParams: { value: "5" } }] },
      { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [{ id: "q", name: "Queue", discipline: "FIFO" }],
    bEvents: [
      { id: "arriveA", name: "A Arrival", scheduledTime: "0", effect: "ARRIVE(PatientA, Queue)", schedules: [] },
      { id: "arriveB", name: "B Arrival", scheduledTime: "1", effect: "ARRIVE(PatientB, Queue)", schedules: [] },
      { id: "arriveC", name: "C Arrival", scheduledTime: "2", effect: "ARRIVE(PatientC, Queue)", schedules: [] },
      { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      { id: "act", name: "Action", scheduledTime: "5", effect: actionEffect, schedules: [] },
    ],
    cEvents: [
      { id: "ce_assign", name: "Assign Nurse", priority: 1,
        condition: "queue(Queue).length > 0 AND idle(Nurse).count > 0",
        effect: "ASSIGN(Queue, Nurse)",
        cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "100" }, useEntityCtx: true }] },
    ],
  };
}

describe("composer → engine: PREEMPT/FINISH criteria (Sprint 97)", () => {
  it("a composed PREEMPT(Nurse, PRIORITY(priority)) re-queues the lowest-priority in-service patient", () => {
    const effect = composeEffect(
      { matchQueues: [{ name: "Queue", type: "PatientA" }], bEventServerTypes: ["Nurse"], numericAttrs: ["priority"] },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "PREEMPT (by criterion)" }));
        fireEvent.change(screen.getByDisplayValue("— first busy server —"), { target: { value: "PRIORITY" } });
      },
    );
    expect(effect).toBe("PREEMPT(Nurse, PRIORITY(priority))");

    const result = run(threePatientModel(effect), 10);
    const preemptLog = result.log.find(e => e.message?.includes("PREEMPT:") && e.message?.includes("interrupted"));
    expect(preemptLog).toBeDefined();
    const patientB = result.entitySummary.find(e => e.type === "PatientB");
    expect(preemptLog.message).toContain(`#${patientB.id}`);
  });

  it("a composed FINISH(Nurse, LONGEST) completes the longest-in-service patient early", () => {
    const effect = composeEffect(
      { matchQueues: [{ name: "Queue", type: "PatientA" }], serverTypes: ["Nurse"] },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "FINISH (by criterion)" }));
        fireEvent.change(screen.getByDisplayValue("— first busy server —"), { target: { value: "LONGEST" } });
      },
    );
    expect(effect).toBe("FINISH(Nurse, LONGEST)");

    const result = run(threePatientModel(effect), 10);
    // PatientA has been in service longest at t=5 — it finishes at 5, decades
    // before its scheduled Fixed-100 completion; the others keep serving.
    const patientA = result.entitySummary.find(e => e.type === "PatientA");
    expect(patientA.status).toBe("done");
    expect(result.entitySummary.find(e => e.type === "PatientB").status).toBe("serving");
    expect(result.entitySummary.find(e => e.type === "PatientC").status).toBe("serving");
  });
});

describe("composer → engine: Sprint 94 composers", () => {
  it("a composed skill + container ASSIGN seizes a skilled Nurse and consumes 2 Fuel", () => {
    const effect = composeEffect(
      {
        matchQueues: [{ name: "TriageQueue", type: "Patient" }],
        serverTypes: ["Nurse"],
        skills: ["Triage"],
        serverSkillsByType: { Nurse: ["Triage"] },
        containerTypes: [{ id: "Fuel" }],
      },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
        // Two "— none —" selects (skill, container); skill first in the DOM.
        fireEvent.change(screen.getAllByDisplayValue("— none —")[0], { target: { value: "lit:Triage" } });
        fireEvent.change(screen.getByDisplayValue("— none —"), { target: { value: "Fuel" } });
        fireEvent.change(screen.getByPlaceholderText("amount — number or expression"), { target: { value: "2" } });
      },
    );
    expect(effect).toBe('ASSIGN(TriageQueue, Nurse, "Triage", Fuel:2)');

    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 1, skills: ["Triage"], attrDefs: [] },
      ],
      stateVariables: [],
      containerTypes: [{ id: "Fuel", capacity: "100", initialLevel: "50" }],
      queues: [{ id: "q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrival", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient, TriageQueue)", schedules: [] },
        { id: "complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
      ],
      cEvents: [
        { id: "ce_triage", name: "Triage", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0",
          effect: effect,
          cSchedules: [{ eventId: "complete", dist: "Fixed", distParams: { value: "3" }, useEntityCtx: true }] },
      ],
    };

    const midRun = run(model, 2);
    expect(customers(midRun)[0].status).toBe("serving");
    expect(serversOf(midRun, "Nurse")[0].status).toBe("busy");
    expect(midRun.snap.containers?.Fuel?.level).toBe(48); // 50 − the composed :2 gate
  });

  it("a composed BATCH(Queue, Entity.batchSize) forms batches at the attribute-driven size", () => {
    const effect = composeEffect(
      { matchQueues: [{ name: "PackQueue", type: "Item" }], numericAttrs: ["batchSize"] },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "BATCH" }));
        fireEvent.click(screen.getByRole("button", { name: "from attribute" }));
      },
    );
    expect(effect).toBe("BATCH(PackQueue, Entity.batchSize)");

    const model = {
      entityTypes: [
        { id: "item", name: "Item", role: "customer",
          attrDefs: [{ name: "batchSize", dist: "Fixed", distParams: { value: "3" } }] },
      ],
      stateVariables: [],
      queues: [{ id: "q", name: "PackQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrival", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Item, PackQueue)",
          schedules: [{ eventId: "arrival", dist: "Fixed", distParams: { value: "1" } }] },
      ],
      cEvents: [
        { id: "ce_pack", name: "Pack", priority: 1, condition: "queue(PackQueue).length >= 3",
          effect: effect, cSchedules: [] },
      ],
    };

    const result = run(model, 4); // arrivals t=0..4 — one batch of 3 forms at t=2
    const batch = result.entitySummary.find(e => e.role === "batch");
    expect(batch).toBeDefined();
    expect(batch.batch.children).toHaveLength(3); // the attribute's value, not a hardcoded composer number
  });

  it("a composed FILL(Fuel, Entity.units * 2) moves the container by the entity-driven amount", () => {
    const effect = composeEffect(
      { matchQueues: [{ name: "Queue", type: "Truck" }], containerTypes: [{ id: "Fuel" }], numericAttrs: ["units"] },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "FILL" }));
        fireEvent.change(screen.getByPlaceholderText("amount — number or expression (e.g. Entity.units * 2)"),
          { target: { value: "Entity.units * 2" } });
      },
    );
    expect(effect).toBe("FILL(Fuel, Entity.units * 2)");

    const model = {
      entityTypes: [
        { id: "truck", name: "Truck", role: "customer",
          attrDefs: [{ name: "units", dist: "Fixed", distParams: { value: "5" } }] },
      ],
      stateVariables: [],
      containerTypes: [{ id: "Fuel", capacity: "1000", initialLevel: "100" }],
      queues: [{ id: "q", name: "Queue", discipline: "FIFO" }],
      bEvents: [
        // ARRIVE establishes the context entity the composed expression reads.
        { id: "arrival", name: "Truck Delivers", scheduledTime: "1",
          effect: ["ARRIVE(Truck, Queue)", effect], schedules: [] },
      ],
      cEvents: [],
    };

    const result = run(model, 5);
    expect(result.snap.containers?.Fuel?.level).toBe(110); // 100 + 5 * 2
  });

  it("a composed plain 5-arg MATCH (empty predicate) pairs the fronts of both queues", () => {
    const effect = composeEffect(
      {
        matchQueues: [
          { name: "QueueA", type: "PartA" },
          { name: "QueueB", type: "PartB" },
          { name: "AssemblyQueue", type: "PartA" },
        ],
      },
      () => {
        fireEvent.click(screen.getByRole("button", { name: "MATCH (compatible pair)" }));
        // The target select displays the bare queue name (the A/B selects
        // show "name (type)"), so this uniquely addresses the target.
        fireEvent.change(screen.getByDisplayValue("QueueA"), { target: { value: "AssemblyQueue" } });
        // Predicate left empty — the plain 5-arg form.
      },
    );
    expect(effect).toBe("MATCH(PartA, QueueA, PartB, QueueB, AssemblyQueue)");

    const model = {
      entityTypes: [
        { id: "pa", name: "PartA", role: "customer", attrDefs: [] },
        { id: "pb", name: "PartB", role: "customer", attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "qa", name: "QueueA", discipline: "FIFO" },
        { id: "qb", name: "QueueB", discipline: "FIFO" },
        { id: "qm", name: "AssemblyQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arriveA", name: "A Arrival", scheduledTime: "0", effect: "ARRIVE(PartA, QueueA)", schedules: [] },
        { id: "arriveB", name: "B Arrival", scheduledTime: "1", effect: "ARRIVE(PartB, QueueB)", schedules: [] },
      ],
      cEvents: [
        { id: "ce_match", name: "Assemble", priority: 1,
          condition: "queue(QueueA).length > 0 AND queue(QueueB).length > 0",
          effect: effect, cSchedules: [] },
      ],
    };

    const result = run(model, 5);
    const merged = result.entitySummary.find(e => e.role === "batch" && e._matchedFrom);
    expect(merged).toBeDefined();
    expect(merged.queue).toBe("AssemblyQueue");
    expect(merged.type).toBe("PartA+PartB");
    const parts = customers(result).filter(e => e.outcome?.endedBy === "MATCH");
    expect(parts).toHaveLength(2);
    expect(merged._matchedFrom.sort((a, b) => a - b)).toEqual(parts.map(p => p.id).sort((a, b) => a - b));
  });
});
