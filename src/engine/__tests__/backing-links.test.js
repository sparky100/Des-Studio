// engine/backing-links.js — the provenance substrate (ADR-021).
//
// These cover the parts that are easy to get subtly wrong: what a link
// actually backs, how a positional path behaves when the model changes
// underneath it, and the difference between "unbacked" and "orphaned".
import { describe, expect, it } from "vitest";
import {
  BACKING_TARGET_TYPES,
  backingStatus,
  buildBackableUnits,
  buildTargetIndex,
  coverageSummary,
  elementBackingSummary,
  findBrokenLinks,
  findOrphanedRecords,
  findStaleEvidence,
  isBackingTargetType,
  resolveTargetPath,
} from "../backing-links.js";

const model = () => ({
  entityTypes: [
    {
      id: "et_srv", name: "Consultant", role: "server", count: 3,
      attrDefs: [{ name: "grade", valueType: "number", dist: "Uniform", distParams: { min: "1", max: "5" } }],
      mtbfDistParams: { mean: "40" },
    },
    { id: "et_cust", name: "Patient", role: "customer", count: 0, attrDefs: [] },
  ],
  stateVariables: [{ id: "sv1", name: "level", valueType: "number", initialValue: 3 }],
  queues: [
    { id: "q1", name: "Waiting Room", customerType: "Patient", discipline: "FIFO", capacity: 20, balkProbability: 0.1 },
    { id: "q2", name: "Treatment", customerType: "Patient", discipline: "FIFO" },
  ],
  bEvents: [
    {
      id: "b1", name: "Patient Arrives", effect: ["ARRIVE(Patient, Waiting Room)"],
      schedules: [{ dist: "Exponential", distParams: { mean: "4" } }],
      probabilisticRouting: [{ probability: 0.7, queueName: "Waiting Room" }],
    },
    { id: "b2", name: "Consultation Ends", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c1", name: "Start Consultation", priority: 1, condition: {}, effect: ["ASSIGN(Waiting Room, Consultant)"], cSchedules: [{ dist: "Exponential", distParams: { mean: "12" } }] },
  ],
  containerTypes: [{ id: "tank", capacity: 100, initialLevel: 10 }],
  distances: [{ id: "d1", fromQueue: "Waiting Room", toQueue: "Treatment", distance: 7 }],
  dataSources: [{ id: "ds1", label: "Roster feed", type: "rest", url: "https://example.test/x" }],
  goals: [{ label: "Average wait", metric: "summary.avgWait", operator: "<", target: 10 }],
});

describe("buildBackableUnits", () => {
  it("produces one element unit per backable element", () => {
    const units = buildBackableUnits(model());
    const elements = units.filter(u => u.kind === "element");
    // 2 entity types, 2 queues, 2 B-events, 1 C-event, 1 state variable,
    // 1 container, 1 distance, 1 data source, 1 goal.
    expect(elements.length).toBe(12);
    // Nine types are present here; the tenth (`schedule`) lives in the
    // model_schedules table and is supplied by the caller — covered below.
    expect(new Set(elements.map(u => u.targetType)).size).toBe(9);
  });

  it("addresses goals by index, because GoalDefinition has no id", () => {
    const units = buildBackableUnits(model());
    const goal = units.find(u => u.targetType === "goal" && u.kind === "element");
    expect(goal.targetId).toBe("0");
    expect(goal.label).toBe("Average wait");
  });

  it("enumerates the evidence-critical parameters inside each element", () => {
    const units = buildBackableUnits(model());
    const paths = units.filter(u => u.kind === "parameter").map(u => `${u.targetType}:${u.targetId}:${u.targetPath}`);

    expect(paths).toContain("b_event:b1:schedules[0].distParams.mean");
    expect(paths).toContain("b_event:b1:probabilisticRouting[0].probability");
    expect(paths).toContain("c_event:c1:cSchedules[0].distParams.mean");
    expect(paths).toContain("queue:q1:capacity");
    expect(paths).toContain("queue:q1:balkProbability");
    expect(paths).toContain("entity_type:et_srv:count");
    expect(paths).toContain("entity_type:et_srv:attrDefs[0].distParams.min");
    expect(paths).toContain("entity_type:et_srv:mtbfDistParams.mean");
    expect(paths).toContain("goal:0:target");
    expect(paths).toContain("container_type:tank:capacity");
    expect(paths).toContain("distance:d1:distance");
  });

  it("does not invent parameters for elements that have none", () => {
    const units = buildBackableUnits(model());
    expect(units.filter(u => u.targetType === "data_source" && u.kind === "parameter").length).toBe(0);
  });

  it("marks an arrival distribution as an arrival-rate parameter", () => {
    const units = buildBackableUnits(model());
    const arrival = units.find(u => u.targetPath === "schedules[0].distParams.mean" && u.targetType === "b_event");
    expect(arrival.impact).toBe("arrival");
    const service = units.find(u => u.targetPath === "cSchedules[0].distParams.mean");
    expect(service.impact).toBe("service");
  });

  it("includes schedules only when the caller supplies them (ADR-016)", () => {
    expect(buildBackableUnits(model()).filter(u => u.targetType === "schedule").length).toBe(0);
    const withSchedules = buildBackableUnits(model(), { schedules: [{ id: "sch1", name: "Weekday" }] });
    expect(withSchedules.filter(u => u.targetType === "schedule" && u.targetId === "sch1").length).toBe(1);
  });
});

describe("resolveTargetPath", () => {
  it("resolves a nested index path", () => {
    const b = model().bEvents[0];
    const r = resolveTargetPath(b, "schedules[0].distParams.mean");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("4");
  });

  it("treats an absent path as the element itself", () => {
    const b = model().bEvents[0];
    expect(resolveTargetPath(b).ok).toBe(true);
    expect(resolveTargetPath(b).value).toBe(b);
  });

  it("fails cleanly when the path no longer resolves", () => {
    const b = model().bEvents[0];
    expect(resolveTargetPath(b, "schedules[3].distParams.mean").ok).toBe(false);
    expect(resolveTargetPath(b, "nope.at.all").ok).toBe(false);
    expect(resolveTargetPath(b, "schedules[0].distParams.nope").ok).toBe(false);
  });
});

describe("backingStatus", () => {
  const links = [
    { id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "b1" },
    { id: "bl2", recordType: "assumption", recordId: "as1", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" },
  ];

  it("reads a link with no path as backing the whole element", () => {
    expect(backingStatus(links, "b_event", "b1")).toBe("evidenced");
  });

  it("reads an element-wide link as covering every parameter in it", () => {
    expect(backingStatus(links, "b_event", "b1", "schedules[0].distParams.mean")).toBe("evidenced");
    expect(backingStatus(links, "b_event", "b1", "capacity")).toBe("evidenced");
  });

  it("reads an element with only path-scoped links as not backed as a whole", () => {
    const scoped = [{ id: "bl2", recordType: "assumption", recordId: "as1", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }];
    expect(backingStatus(scoped, "b_event", "b1")).toBe("unbacked");
    expect(backingStatus(scoped, "b_event", "b1", "schedules[0].distParams.mean")).toBe("assumed");
    expect(backingStatus(scoped, "b_event", "b1", "capacity")).toBe("unbacked");
  });

  it("reports an element with no links as unbacked", () => {
    expect(backingStatus([], "b_event", "b1")).toBe("unbacked");
    expect(backingStatus([], "queue", "q1", "capacity")).toBe("unbacked");
  });
});

describe("elementBackingSummary", () => {
  it("counts how many of an element's parameters are backed", () => {
    const m = model();
    const units = buildBackableUnits(m);
    const b1 = units.find(u => u.targetType === "b_event" && u.targetId === "b1" && u.kind === "element");
    const links = [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }];
    const summary = elementBackingSummary(links, units, b1);
    expect(summary.status).toBe("unbacked");
    expect(summary.backedParameters).toBe(1);
    expect(summary.totalParameters).toBe(2); // arrival mean + branch probability
  });
});

describe("findBrokenLinks", () => {
  it("reports a link whose record was deleted", () => {
    const m = { ...model(), evidence: [], assumptions: [], backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "gone", targetType: "b_event", targetId: "b1" }] };
    const broken = findBrokenLinks(m);
    expect(broken.length).toBe(1);
    expect(broken[0].kind).toBe("record");
  });

  it("reports a link whose target element was deleted", () => {
    const m = { ...model(), evidence: [{ id: "ev1" }], backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "nope" }] };
    const broken = findBrokenLinks(m);
    expect(broken.length).toBe(1);
    expect(broken[0].kind).toBe("target");
  });

  it("reports a path that no longer resolves rather than re-pointing it", () => {
    const m = {
      ...model(),
      evidence: [{ id: "ev1" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }],
    };
    expect(findBrokenLinks(m).length).toBe(0);

    // Reordering the schedule rows invalidates the positional path.
    const reordered = { ...m, bEvents: [{ ...m.bEvents[0], schedules: [{ dist: "Fixed", distParams: { value: "1" } }, ...m.bEvents[0].schedules] }] };
    const broken = findBrokenLinks(reordered);
    expect(broken.length).toBe(1);
    expect(broken[0].kind).toBe("path");
  });

  it("reports nothing when every link resolves", () => {
    const m = {
      ...model(),
      evidence: [{ id: "ev1" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "b1", targetPath: "schedules[0].distParams.mean" }],
    };
    expect(findBrokenLinks(m).length).toBe(0);
  });
});

describe("findOrphanedRecords", () => {
  it("reports records that back nothing", () => {
    const m = {
      ...model(),
      evidence: [{ id: "ev1", description: "Orphan" }],
      assumptions: [{ id: "as1", text: "Orphan assumption" }],
      backingLinks: [],
    };
    const orphans = findOrphanedRecords(m);
    expect(orphans.length).toBe(2);
    expect(orphans.map(o => o.recordType).sort()).toEqual(["assumption", "evidence"]);
  });

  it("does not report a record that is attached", () => {
    const m = {
      ...model(),
      evidence: [{ id: "ev1" }],
      backingLinks: [{ id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "b1" }],
    };
    expect(findOrphanedRecords(m).length).toBe(0);
  });
});

describe("findStaleEvidence", () => {
  const now = new Date("2026-10-21T00:00:00Z");

  it("flags evidence older than the window", () => {
    const m = { evidence: [{ id: "ev1", dateCaptured: "2025-01-01" }], backingLinkSettings: { staleEvidenceMonths: 12 } };
    const stale = findStaleEvidence(m, now);
    expect(stale.length).toBe(1);
    expect(stale[0].monthsOld).toBeGreaterThan(12);
  });

  it("uses lastVerified when it is present", () => {
    const m = { evidence: [{ id: "ev1", dateCaptured: "2020-01-01", lastVerified: "2026-09-01" }], backingLinkSettings: { staleEvidenceMonths: 12 } };
    expect(findStaleEvidence(m, now).length).toBe(0);
  });

  it("exempts assumptions entirely", () => {
    const m = { assumptions: [{ id: "as1", text: "old" }], backingLinkSettings: { staleEvidenceMonths: 1 } };
    expect(findStaleEvidence(m, now).length).toBe(0);
  });

  it("honours a custom window", () => {
    const m = { evidence: [{ id: "ev1", dateCaptured: "2026-06-01" }], backingLinkSettings: { staleEvidenceMonths: 12 } };
    expect(findStaleEvidence(m, now).length).toBe(0);
    const stricter = { ...m, backingLinkSettings: { staleEvidenceMonths: 2 } };
    expect(findStaleEvidence(stricter, now).length).toBe(1);
  });
});

describe("coverageSummary", () => {
  it("counts evidenced, assumed and unbacked units", () => {
    const m = {
      ...model(),
      evidence: [{ id: "ev1" }],
      assumptions: [{ id: "as1" }],
      backingLinks: [
        { id: "bl1", recordType: "evidence", recordId: "ev1", targetType: "b_event", targetId: "b1" },
        { id: "bl2", recordType: "assumption", recordId: "as1", targetType: "queue", targetId: "q1", targetPath: "capacity" },
      ],
    };
    const summary = coverageSummary(m);
    expect(summary.total).toBe(summary.evidenced + summary.assumed + summary.unbacked);
    expect(summary.evidenced).toBeGreaterThan(0);
    expect(summary.assumed).toBe(1);
    expect(summary.unbacked).toBeGreaterThan(0);
    expect(summary.percentEvidenced).toBeGreaterThanOrEqual(0);
  });

  it("reports zero for a model with nothing backable", () => {
    const summary = coverageSummary({});
    expect(summary.total).toBe(0);
    expect(summary.percentEvidenced).toBe(0);
  });
});

describe("target-type vocabulary", () => {
  it("exposes the ten backable element types", () => {
    expect(BACKING_TARGET_TYPES.length).toBe(10);
    expect(BACKING_TARGET_TYPES.map(t => t.type)).toContain("b_event");
    expect(BACKING_TARGET_TYPES.map(t => t.type)).toContain("goal");
  });

  it("recognises only known target types", () => {
    expect(isBackingTargetType("b_event")).toBe(true);
    expect(isBackingTargetType("made_up")).toBe(false);
  });
});

describe("buildTargetIndex", () => {
  it("indexes every element by type and id", () => {
    const index = buildTargetIndex(model());
    expect(index.get("b_event").get("b1").label).toBe("Patient Arrives");
    expect(index.get("goal").get("0").label).toBe("Average wait");
    expect(index.get("container_type").get("tank")).toBeTruthy();
  });
});
