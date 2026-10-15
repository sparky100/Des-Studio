// Sprint 99 — UI for preempt-and-assign and interrupted service.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { macroCalls, classifyActivityEffect } from "../../src/model/macroParser.js";
import { deriveGraphFromModel } from "../../src/ui/visual-designer/graph.js";
import { VisualNodeInspector } from "../../src/ui/visual-designer/VisualNodeInspector.jsx";
import { buildServerTypeIndex, deriveActivityLiveData } from "../../src/ui/execute/activityLiveData.js";
import { buildEntityJourneys } from "../../src/ui/execute/executeHelpers.js";
import { assignOptions } from "../../src/ui/editors/helpers.jsx";
import { buildEngine } from "../../src/engine/index.js";

function edModel(effect = "ASSIGN(TraumaQueue, Doctor, PREEMPT, PRIORITY(priority), RESTART, MAX:2)") {
  return {
    entityTypes: [
      { id: "p", name: "Patient", role: "customer", count: 0, attrDefs: [{ name: "priority", valueType: "number", defaultValue: 3 }] },
      { id: "t", name: "TraumaCode", role: "customer", count: 0, attrDefs: [{ name: "priority", valueType: "number", defaultValue: 0 }] },
      { id: "d", name: "Doctor", role: "server", count: 1, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "qw", name: "Waiting", customerType: "Patient", discipline: "PRIORITY" },
      { id: "qt", name: "TraumaQueue", customerType: "TraumaCode", discipline: "FIFO" },
    ],
    bEvents: [
      { id: "ap", name: "Patient arrives", scheduledTime: "0", effect: ["ARRIVE(Patient, Waiting)"], schedules: [] },
      { id: "at", name: "Trauma arrives", scheduledTime: "5", effect: ["ARRIVE(TraumaCode, TraumaQueue)"], schedules: [] },
      { id: "done", name: "Done", scheduledTime: "1e12", effect: ["COMPLETE()"], schedules: [] },
    ],
    cEvents: [
      { id: "c_trauma", name: "Consult Trauma", priority: 0, condition: "queue(TraumaQueue).length > 0", effect: [effect],
        cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
      { id: "c_consult", name: "Consult", priority: 1, condition: "queue(Waiting).length > 0 AND idle(Doctor).count > 0",
        effect: ["ASSIGN(Waiting, Doctor)"], cSchedules: [{ eventId: "done", dist: "Fixed", distParams: { value: "10" }, useEntityCtx: true }] },
    ],
    sections: [],
  };
}

describe("macro parsing keeps nested calls inside their argument", () => {
  it("PRIORITY(attr) is one argument, not a separate macro", () => {
    expect(macroCalls(["ASSIGN(Q, S, PREEMPT, PRIORITY(sev), MAX:2)"])).toEqual([
      { macro: "ASSIGN", args: ["Q", "S", "PREEMPT", "PRIORITY(sev)", "MAX:2"] },
    ]);
    expect(macroCalls(["PREEMPT(Staff, PRIORITY(taskPriority))", "SET(x, min(a, b))"])).toEqual([
      { macro: "PREEMPT", args: ["Staff", "PRIORITY(taskPriority)"] },
      { macro: "SET", args: ["x", "min(a, b)"] },
    ]);
  });

  it("a preempting ASSIGN is not a plain canvas-editable ASSIGN", () => {
    expect(classifyActivityEffect(["ASSIGN(Q, S, PREEMPT)"]).kind).toBe("advanced");
  });
});

describe("Visual Designer", () => {
  it("names only the server in the activity sublabel and adds a 'preempts' badge", () => {
    const graph = deriveGraphFromModel(edModel());
    const node = graph.nodes.find(n => n.refId === "c_trauma");
    expect(node.sublabel).toBe("Doctor · Priority 0");
    expect(node.badges).toEqual(["service", "preempts"]);
    const plain = graph.nodes.find(n => n.refId === "c_consult");
    expect(plain.badges).toEqual(["service"]);
  });

  it("the inspector summarises the preemption", () => {
    const model = edModel();
    const graph = deriveGraphFromModel(model);
    const node = graph.nodes.find(n => n.refId === "c_trauma");
    render(<VisualNodeInspector model={model} graph={graph} selectedNodeId={node.id} canEdit onPatchNode={vi.fn()} />);
    expect(screen.getByText(/takes one from a lower-ranked job, ranked by Entity\.priority; the interrupted job restarts its full time \(at most 2× per job\)/)).toBeInTheDocument();
  });
});

describe("Run canvas and results", () => {
  const model = edModel("ASSIGN(TraumaQueue, Doctor, PREEMPT, PRIORITY(priority))");
  const engine = buildEngine(model, 1, 0, 40);
  const result = engine.runAll();

  it("the preempting activity's card counts the servers it took", () => {
    const snap = engine.getSnap ? engine.getSnap() : result.snap;
    const index = buildServerTypeIndex(model.cEvents, model.entityTypes);
    expect(deriveActivityLiveData(snap, "c_trauma", index, model).preemptTakes).toBe(1);
    expect(deriveActivityLiveData(snap, "c_consult", index, model).preemptTakes).toBe(0);
  });

  it("entity journeys record interruptions", () => {
    const journeys = buildEntityJourneys(result.entitySummary);
    const patient = journeys.find(j => j.type === "Patient");
    expect(patient.stages[0]).toMatchObject({ wait: 2, service: 10, interruptions: 1 });
    const trauma = journeys.find(j => j.type === "TraumaCode");
    expect(trauma.stages[0]).not.toHaveProperty("interruptions");
  });
});

describe("effect picker suggestions", () => {
  it("offers preempt-and-assign for a queue that ranks entities, not for FIFO", () => {
    const m = edModel();
    const values = assignOptions(m.entityTypes, [], m.queues).map(o => o.value);
    expect(values).toContain("ASSIGN(Waiting, Doctor, PREEMPT)");
    expect(values).not.toContain("ASSIGN(TraumaQueue, Doctor, PREEMPT)");
  });
});

describe("trace panel", () => {
  it("shows a preemption: victim, beneficiary, ranks, what the victim gets and why", async () => {
    const { BottomPanel } = await import("../../src/ui/execute/BottomPanel.jsx");
    const { fireEvent } = await import("@testing-library/react");
    const model = edModel("ASSIGN(TraumaQueue, Doctor, PREEMPT, PRIORITY(priority))");
    const result = buildEngine(model, 1, 0, 40).runAll();
    const log = result.log.filter(e => e.arbitration?.type === "preemption");
    expect(log).toHaveLength(1);
    render(<BottomPanel log={log} snap={result.snap} model={model} />);
    fireEvent.click(screen.getByRole("button", { name: /expand details/i }));
    fireEvent.click(screen.getAllByText("▶")[0]);
    expect(screen.getByTestId("trace-preemption").textContent).toMatch(
      /interrupted #\d+ \(priority=3\) on server #\d+ → #\d+ \(priority=0\) · 5\.00t remaining · lowest-ranked of 1 lower-ranked in service/,
    );
  });
});
