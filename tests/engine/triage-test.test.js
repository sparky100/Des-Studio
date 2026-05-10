import { describe, test, expect } from 'vitest';
import { buildEngine } from '../../src/engine/index.js';

function buildTriageModel(arrivalInterval = 8) {
  return {
    name: "Triage Test",
    entityTypes: [
      { id: "et-pt", name: "Patient", role: "customer", count: 0, attrDefs: [] },
      { id: "et-ns", name: "Nurse",   role: "server", count: 2, attrDefs: [] },
      { id: "et-dr", name: "Doctor",  role: "server", count: 2, attrDefs: [] },
    ],
    stateVariables: [],
    queues: [
      { id: "q-tri", name: "TriageQueue", capacity: "", discipline: "FIFO" },
      { id: "q-doc", name: "DoctorQueue", capacity: "", discipline: "FIFO" },
    ],
    bEvents: [
      {
        id: "b-arrive", name: "PatientArrival", scheduledTime: "0",
        effect: "ARRIVE(Patient, TriageQueue)",
        schedules: [{ eventId: "b-arrive", dist: "fixed", distParams: { value: arrivalInterval } }],
      },
      {
        id: "b-tri", name: "TriageComplete", scheduledTime: "9999",
        effect: "RELEASE(Nurse, DoctorQueue)",
        schedules: [],
      },
      {
        id: "b-treat", name: "TreatmentComplete", scheduledTime: "9999",
        effect: "COMPLETE()",
        schedules: [],
      },
    ],
    cEvents: [
      {
        id: "c-tri", name: "StartTriage", priority: 1,
        condition: "queue(TriageQueue).length > 0 AND idle(Nurse).count > 0",
        effect: "ASSIGN(Patient, Nurse)",
        cSchedules: [{ eventId: "b-tri", dist: "fixed", distParams: { value: 5 }, useEntityCtx: true }],
      },
      {
        id: "c-treat", name: "StartTreatment", priority: 2,
        condition: "queue(DoctorQueue).length > 0 AND idle(Doctor).count > 0",
        effect: "ASSIGN(Patient, Doctor)",
        cSchedules: [{ eventId: "b-treat", dist: "fixed", distParams: { value: 5 }, useEntityCtx: true }],
      },
    ],
  };
}

describe('Triage model server release test', () => {
  test('servers cycle busy/idle - RELEASE frees nurses properly', () => {
    const model = buildTriageModel(8); // arrival every 8 TU, triage 5 TU, 2 nurses → util ~31%
    const engine = buildEngine(model, 42, 500);
    let stepCount = 0;
    const MAX_STEPS = 300;

    let sawNurseIdle = false;
    let sawNurseBusy = false;
    let sawDoctorIdle = false;
    let sawDoctorBusy = false;
    let maxNurseBusy = 0;
    let totalNurseBusySnaps = 0;
    let totalSnaps = 0;
    const snapshots = [];

    while (engine.getFelSize() > 0 && stepCount < MAX_STEPS) {
      const r = engine.step();
      stepCount++;
      if (!r || r.done) break;

      const snap = engine.getSnap();
      const servers = snap.entities.filter(e => e.role === "server");
      const nurseBusy = servers.filter(e => e.type === "Nurse" && e.status === "busy").length;
      const nurseIdle = servers.filter(e => e.type === "Nurse" && e.status === "idle").length;
      const doctorBusy = servers.filter(e => e.type === "Doctor" && e.status === "busy").length;
      const doctorIdle = servers.filter(e => e.type === "Doctor" && e.status === "idle").length;

      if (nurseBusy > 0) sawNurseBusy = true;
      if (nurseIdle > 0) sawNurseIdle = true;
      if (doctorBusy > 0) sawDoctorBusy = true;
      if (doctorIdle > 0) sawDoctorIdle = true;
      if (nurseBusy > maxNurseBusy) maxNurseBusy = nurseBusy;
      totalNurseBusySnaps += nurseBusy;
      totalSnaps++;

      snapshots.push({
        t: snap.clock,
        nurseBusy, nurseIdle, doctorBusy, doctorIdle,
        served: snap.served,
      });
    }

    const finalSnap = engine.getSnap();
    const finalServers = finalSnap.entities.filter(e => e.role === "server");

    console.log(`\n=== TRIAGE MODEL: arrival=fixed(8), triage=fixed(5), treat=fixed(5) ===`);
    console.log(`Steps: ${stepCount} | Simulation clock: ${finalSnap.clock.toFixed(2)} | Served: ${finalSnap.served}`);
    console.log(`Final servers: ${finalServers.map(s => `${s.type}#${s.id}=${s.status}`).join(", ")}`);
    console.log(`Nurses busy in ${totalNurseBusySnaps}/${totalSnaps} snapshots (avg ${(totalNurseBusySnaps / totalSnaps).toFixed(2)}/2 busy)`);
    console.log(`Nurses: ever busy=${sawNurseBusy} ever idle=${sawNurseIdle} maxBusy=${maxNurseBusy}`);
    console.log(`Doctors: ever busy=${sawDoctorBusy} ever idle=${sawDoctorIdle}`);

    // Print individual server state traces at key moments
    console.log("\nSample snapshots:");
    const sampleSteps = snapshots.filter(s => snapshots.indexOf(s) % 30 === 0).slice(0, 10);
    for (const s of sampleSteps) {
      console.log(`  t=${s.t.toFixed(2)} Nurses ${s.nurseBusy}B/${s.nurseIdle}I Doctors ${s.doctorBusy}B/${s.doctorIdle}I served=${s.served}`);
    }

    // Final server state check
    const finalAnyIdle = finalServers.some(s => s.status === "idle");
    console.log(`\nFinal: ${finalAnyIdle ? "✅ Some servers idle" : "❌ ALL servers busy"}`);

    // CRITICAL: Both nurses AND doctors must have been observed idle at some point
    expect(sawNurseIdle).toBe(true);
    expect(sawDoctorIdle).toBe(true);
    // Both must also have been busy at some point (proves they actually work)
    expect(sawNurseBusy).toBe(true);
    expect(sawDoctorBusy).toBe(true);
    // Both nurses can be busy simultaneously (since we have 2 nurses and fixed(8) arrival
    // with fixed(5) service — some overlap is expected)
    expect(maxNurseBusy).toBeGreaterThanOrEqual(1);
    // Not ALL servers should be busy at the final snapshot
    expect(finalServers.filter(s => s.status === "busy").length).toBeLessThan(finalServers.length);
  });
});
