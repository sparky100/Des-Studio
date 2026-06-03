// Two-stage (triage → consultant) clinic model shared by engine and graph tests.
export const twoStageClinicModel = {
  entityTypes: [
    { id: "patient",    name: "Patient",    role: "customer", attrDefs: [] },
    { id: "triage",     name: "Triage Nurse", role: "server", count: 1, attrDefs: [] },
    { id: "consultant", name: "Consultant",   role: "server", count: 1, attrDefs: [] },
  ],
  queues: [
    { id: "triage-q",  name: "Triage Queue",     customerType: "Patient", discipline: "FIFO" },
    { id: "consult-q", name: "Consultant Queue",  customerType: "Patient", discipline: "FIFO" },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: "arrive", name: "Patient Arrival", scheduledTime: "0",
      effect: "ARRIVE(Patient, Triage Queue)", schedules: [],
    },
    {
      id: "triage-complete", name: "Triage Complete", scheduledTime: "9999",
      effect: "RELEASE(Triage Nurse, Consultant Queue)", schedules: [],
    },
    {
      id: "consult-complete", name: "Consultation Complete", scheduledTime: "9999",
      effect: "COMPLETE()", schedules: [],
    },
  ],
  cEvents: [
    {
      id: "start-triage", name: "Start Triage", priority: 1,
      condition: "queue(Triage Queue).length > 0 AND idle(Triage Nurse).count > 0",
      effect: "ASSIGN(Triage Queue, Triage Nurse)",
      cSchedules: [{ eventId: "triage-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    },
    {
      id: "start-consult", name: "Start Consultation", priority: 2,
      condition: "queue(Consultant Queue).length > 0 AND idle(Consultant).count > 0",
      effect: "ASSIGN(Consultant Queue, Consultant)",
      cSchedules: [{ eventId: "consult-complete", dist: "Fixed", distParams: { value: "1" }, useEntityCtx: true }],
    },
  ],
};
