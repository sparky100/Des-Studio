// Sprint 95 — COSEIZE quantities: "Type:N" lets one COSEIZE call seize N idle
// servers of the same type (e.g. "2 Nurses + 1 Doctor" in one atomic seize),
// and RELEASE_COSEIZED now releases ALL currently-claimed servers of each
// listed type, not just the first (see docs/reviews/macro-library-ui-coverage-audit.md
// Group B, "COSEIZE quantities").
import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

describe('COSEIZE quantities (Type:N)', () => {
  test('COSEIZE(Q, Nurse:2, Doctor) claims 2 idle Nurses + 1 idle Doctor, leaves the 3rd Nurse idle', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
        { id: "doctor", name: "Doctor", role: "server", count: 2, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
      ],
      cEvents: [
        { id: "ce_seize", name: "Seize Team", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count >= 2 AND idle(Doctor).count > 0",
          effect: "COSEIZE(TriageQueue, Nurse:2, Doctor)",
          cSchedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    const busyNurses = nurses.filter(e => e.status === "busy");
    const idleNurses = nurses.filter(e => e.status === "idle");
    expect(busyNurses.length).toBe(2);
    expect(idleNurses.length).toBe(1);

    const doctors = result.entitySummary.filter(e => e.type === "Doctor");
    expect(doctors.filter(e => e.status === "busy").length).toBe(1);
    expect(doctors.filter(e => e.status === "idle").length).toBe(1);

    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.status).toBe("serving");
    busyNurses.forEach(n => expect(n.currentCustId).toBe(patient.id));
  });

  test('COSEIZE(Q, Nurse:2, Doctor) fails atomically when idle Nurses < 2 — nothing gets claimed', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 1, attrDefs: [] },
        { id: "doctor", name: "Doctor", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
      ],
      cEvents: [
        // Deliberately under-guarded — checks idle > 0, not >= 2 — so this
        // exercises COSEIZE's own check-all-before-claim-any, not the
        // condition string's gating.
        { id: "ce_seize", name: "Seize Team", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0 AND idle(Doctor).count > 0",
          effect: "COSEIZE(TriageQueue, Nurse:2, Doctor)",
          cSchedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurse = result.entitySummary.find(e => e.type === "Nurse");
    const doctor = result.entitySummary.find(e => e.type === "Doctor");
    expect(nurse.status).toBe("idle");
    expect(doctor.status).toBe("idle"); // Doctor alone had enough — must stay untouched too

    const patient = result.entitySummary.find(e => e.role === "customer");
    expect(patient.status).toBe("waiting");

    const warnings = result.log.filter(e =>
      e.message?.includes("only 1 idle Nurse") && e.message?.includes("need 2")
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('COSEIZE duplicate-type rejection message points at Type:N', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
      ],
      cEvents: [
        { id: "ce_seize", name: "Seize Team", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0",
          effect: "COSEIZE(TriageQueue, Nurse, Nurse:2)",
          cSchedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const warnings = result.log.filter(e =>
      e.message?.includes('duplicate server type "Nurse"') && e.message?.includes('Nurse:2')
    );
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('COSEIZE(Q, Nurse[Triage]:2, Doctor) claims only the skilled Nurses at qty > 1', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        // skillProfiles assigns "Triage" to the first 2 of 3 Nurse instances
        // (instance index order) — the 3rd stays unskilled.
        { id: "nurse", name: "Nurse", role: "server", count: 3, attrDefs: [],
          skillProfiles: [{ skills: ["Triage"], count: 2 }] },
        { id: "doctor", name: "Doctor", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
      ],
      cEvents: [
        { id: "ce_seize", name: "Seize Team", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count >= 2 AND idle(Doctor).count > 0",
          effect: "COSEIZE(TriageQueue, Nurse[Triage]:2, Doctor)",
          cSchedules: [] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    const busyNurses = nurses.filter(e => e.status === "busy");
    expect(busyNurses.length).toBe(2);
    busyNurses.forEach(n => expect(n.skills).toContain("Triage"));

    const unskilledNurse = nurses.find(e => !Array.isArray(e.skills) || !e.skills.includes("Triage"));
    expect(unskilledNurse).toBeDefined();
    expect(unskilledNurse.status).toBe("idle");
  });

  test('COSEIZE(Q, Nurse:1, Doctor) behaves identically to COSEIZE(Q, Nurse, Doctor) — explicit :1 is a no-op', () => {
    const buildModel = (effect) => ({
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
        { id: "doctor", name: "Doctor", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [{ id: "triage_q", name: "TriageQueue", discipline: "FIFO" }],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
      ],
      cEvents: [
        { id: "ce_seize", name: "Seize Team", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0 AND idle(Doctor).count > 0",
          effect,
          cSchedules: [] },
      ],
    });

    const busyCount = (result, type) =>
      result.entitySummary.filter(e => e.type === type && e.status === "busy").length;

    const bare = buildEngine(buildModel("COSEIZE(TriageQueue, Nurse, Doctor)"), 42, 0, 10).runAll();
    const explicit = buildEngine(buildModel("COSEIZE(TriageQueue, Nurse:1, Doctor)"), 42, 0, 10).runAll();

    expect(busyCount(explicit, "Nurse")).toBe(busyCount(bare, "Nurse"));
    expect(busyCount(explicit, "Doctor")).toBe(busyCount(bare, "Doctor"));
    expect(busyCount(bare, "Nurse")).toBe(1);
  });

  test('RELEASE_COSEIZED([Nurse, Doctor]) releases all claimed servers after a Nurse:2 + Doctor seize', () => {
    const model = {
      entityTypes: [
        { id: "patient", name: "Patient", role: "customer", attrDefs: [] },
        { id: "nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
        { id: "doctor", name: "Doctor", role: "server", count: 1, attrDefs: [] },
      ],
      stateVariables: [],
      queues: [
        { id: "triage_q", name: "TriageQueue", discipline: "FIFO" },
        { id: "ward_q", name: "WardQueue", discipline: "FIFO" },
      ],
      bEvents: [
        { id: "arrive", name: "Patient Arrival", scheduledTime: "0",
          effect: "ARRIVE(Patient, TriageQueue)",
          schedules: [{ eventId: "arrive", dist: "Fixed", distParams: { value: "1000" } }] },
        { id: "triage_done", name: "Triage Complete", scheduledTime: "9999",
          effect: ["RELEASE_COSEIZED([Nurse, Doctor], WardQueue)"], schedules: [] },
      ],
      cEvents: [
        { id: "ce_seize", name: "Seize Team", priority: 1,
          condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count >= 2 AND idle(Doctor).count > 0",
          effect: "COSEIZE(TriageQueue, Nurse:2, Doctor)",
          cSchedules: [{ eventId: "triage_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      ],
    };

    const engine = buildEngine(model, 42, 0, 10);
    const result = engine.runAll();

    const nurses = result.entitySummary.filter(e => e.type === "Nurse");
    const doctors = result.entitySummary.filter(e => e.type === "Doctor");
    expect(nurses.every(e => e.status === "idle")).toBe(true);
    expect(doctors.every(e => e.status === "idle")).toBe(true);
    [...nurses, ...doctors].forEach(s => expect(s.currentCustId).toBeUndefined());

    const inWard = result.entitySummary.filter(e =>
      e.role === "customer" && (e.queue === "WardQueue" || e.lastQueue === "WardQueue")
    );
    expect(inWard.length).toBeGreaterThan(0);

    const patient = inWard[0];
    const stage = patient.stages?.[0];
    expect(stage).toBeDefined();
    expect(stage.serverTypes.filter(t => t === "Nurse")).toHaveLength(2);
    expect(stage.serverTypes.filter(t => t === "Doctor")).toHaveLength(1);
  });
});
