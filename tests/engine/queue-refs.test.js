import { describe, expect, it } from "vitest";
import { renameEntityType, renameQueue } from "../../src/engine/queue-refs.js";

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
});
