// Curated runnable template models for one-click instant run

const MM1 = {
  name: "M/M/1 Queue",
  description: "Classic single-server queue with exponential arrivals (rate 0.9) and exponential service (rate 1.0). Utilisation 90%. The canonical benchmark model.",
  entityTypes: [
    { id: "et_cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
    { id: "et_srv", name: "Server", role: "server", count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Customer)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.111" } }] },
    { id: "b_complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [{
    id: "c_seize", name: "Seize", priority: 1, condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
    effect: "ASSIGN(Customer, Server)",
    cSchedules: [{ eventId: "b_complete", dist: "Exponential", distParams: { mean: "1" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_cust", name: "Customer", customerType: "Customer", capacity: "", discipline: "FIFO" }],
};

const CALL_CENTER = {
  name: "Call Center",
  description: "Multi-server call centre with 3 agents, exponential arrivals (rate 1.5), exponential service (rate 0.4), and caller abandonment after 10 time units.",
  entityTypes: [
    { id: "et_caller", name: "Caller", role: "customer", count: 0, attrDefs: [] },
    { id: "et_agent", name: "Agent", role: "server", count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Caller)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "0.667" } }] },
    { id: "b_complete", name: "Complete", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    { id: "b_renege", name: "Abandonment Timer", scheduledTime: "9999", effect: "RENEGE(Caller)", schedules: [] },
  ],
  cEvents: [{
    id: "c_seize", name: "Assign Agent", priority: 1, condition: "queue(Caller).length > 0 AND idle(Agent).count > 0",
    effect: "ASSIGN(Caller, Agent)",
    cSchedules: [
      { eventId: "b_complete", dist: "Exponential", distParams: { mean: "2.5" }, useEntityCtx: true },
    ],
  }],
  queues: [{ id: "q_caller", name: "Caller", customerType: "Caller", capacity: "", discipline: "FIFO" }],
};

const ER_TRIAGE = {
  name: "ER Triage",
  description: "Two-stage emergency room. Patients arrive, see a triage nurse (2 nurses), then queue for a doctor (3 doctors). Priority queue for treatment.",
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [
      { id: "a_severity", name: "severity", valueType: "number", defaultValue: 3, mutable: true },
    ]},
    { id: "et_nurse", name: "Nurse", role: "server", count: 2, attrDefs: [] },
    { id: "et_doctor", name: "Doctor", role: "server", count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } }] },
    { id: "b_triage_done", name: "Triage Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    { id: "b_treatment_done", name: "Treatment Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [
    { id: "c_triage", name: "Start Triage", priority: 1, condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0",
      effect: "ASSIGN(Patient, Nurse)",
      cSchedules: [{ eventId: "b_triage_done", dist: "Uniform", distParams: { min: "2", max: "5" }, useEntityCtx: true }] },
    { id: "c_treat", name: "Start Treatment", priority: 2, condition: "queue(Treatment).length > 0 AND idle(Doctor).count > 0",
      effect: "ASSIGN(Patient, Doctor)",
      cSchedules: [{ eventId: "b_treatment_done", dist: "Triangular", distParams: { min: "5", mode: "10", max: "20" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_patient", name: "Patient", customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_treatment", name: "Treatment", capacity: "", discipline: "PRIORITY" },
  ],
};

const FAST_FOOD = {
  name: "Fast Food Drive-Through",
  description: "Three-stage drive-through: Order → Payment → Pickup. 1 cashier, 2 kitchen staff. FIFO queues between each stage.",
  entityTypes: [
    { id: "et_cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
    { id: "et_cashier", name: "Cashier", role: "server", count: 1, attrDefs: [] },
    { id: "et_kitchen", name: "Kitchen", role: "server", count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Customer)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.5" } }] },
    { id: "b_order_done", name: "Order Taken", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    { id: "b_pay_done", name: "Payment Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    { id: "b_pickup_done", name: "Pickup Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [
    { id: "c_order", name: "Take Order", priority: 1, condition: "queue(Order).length > 0 AND idle(Cashier).count > 0",
      effect: "ASSIGN(Customer, Cashier)",
      cSchedules: [{ eventId: "b_order_done", dist: "Uniform", distParams: { min: "0.5", max: "1.5" }, useEntityCtx: true }] },
    { id: "c_pay", name: "Take Payment", priority: 2, condition: "queue(Payment).length > 0 AND idle(Cashier).count > 0",
      effect: "ASSIGN(Customer, Cashier)",
      cSchedules: [{ eventId: "b_pay_done", dist: "Uniform", distParams: { min: "0.3", max: "0.8" }, useEntityCtx: true }] },
    { id: "c_pickup", name: "Serve Food", priority: 3, condition: "queue(Pickup).length > 0 AND idle(Kitchen).count > 0",
      effect: "ASSIGN(Customer, Kitchen)",
      cSchedules: [{ eventId: "b_pickup_done", dist: "Uniform", distParams: { min: "1", max: "3" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_order", name: "Order", customerType: "Customer", capacity: "", discipline: "FIFO" },
    { id: "q_pay", name: "Payment", capacity: "", discipline: "FIFO" },
    { id: "q_pickup", name: "Pickup", capacity: "", discipline: "FIFO" },
  ],
};

const FACTORY = {
  name: "Factory Assembly",
  description: "Assembly line where 3 parts are batched into 1 product. 2 workers. Parts arrive at rate 0.5, assembly takes 2 time units.",
  entityTypes: [
    { id: "et_part", name: "Part", role: "customer", count: 0, attrDefs: [] },
    { id: "et_worker", name: "Worker", role: "server", count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Part Arrival", scheduledTime: "0", effect: "ARRIVE(Part)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } }] },
    { id: "b_assemble_done", name: "Assembly Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [{
    id: "c_assemble", name: "Assemble Product", priority: 1,
    condition: "queue(Parts).length >= 3 AND idle(Worker).count > 0",
    effect: "BATCH(Parts, 3)",
    cSchedules: [{ eventId: "b_assemble_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_parts", name: "Parts", customerType: "Part", capacity: "", discipline: "FIFO" }],
};

const AIRPORT = {
  name: "Airport Security",
  description: "Two-stage security screening with limited queue capacity. Document check (2 officers) then baggage scan (3 scanners). Queue capacity 15 at each stage causes balking.",
  entityTypes: [
    { id: "et_passenger", name: "Passenger", role: "customer", count: 0, attrDefs: [] },
    { id: "et_officer", name: "Officer", role: "server", count: 2, attrDefs: [] },
    { id: "et_scanner", name: "Scanner", role: "server", count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Passenger)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1" } }] },
    { id: "b_doc_done", name: "Document Check Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
    { id: "b_scan_done", name: "Scan Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [
    { id: "c_doc", name: "Check Documents", priority: 1,
      condition: "queue(Documents).length > 0 AND idle(Officer).count > 0",
      effect: "ASSIGN(Passenger, Officer)",
      cSchedules: [{ eventId: "b_doc_done", dist: "Triangular", distParams: { min: "0.5", mode: "1", max: "2" }, useEntityCtx: true }] },
    { id: "c_scan", name: "Scan Baggage", priority: 2,
      condition: "queue(Scanner).length > 0 AND idle(Scanner).count > 0",
      effect: "ASSIGN(Passenger, Scanner)",
      cSchedules: [{ eventId: "b_scan_done", dist: "Triangular", distParams: { min: "1", mode: "2", max: "4" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_docs", name: "Documents", capacity: "15", discipline: "FIFO" },
    { id: "q_scan", name: "Scanner", capacity: "15", discipline: "FIFO" },
  ],
};

const CONSTRUCTION = {
  name: "Construction Logistics",
  description: "Truck hauling operation: trucks arrive at a loader (2), then queue for weigh station (1), then depart. 2-stage routing with RELEASE macro and state variable tracking.",
  entityTypes: [
    { id: "et_truck", name: "Truck", role: "customer", count: 0, attrDefs: [] },
    { id: "et_loader", name: "Loader", role: "server", count: 2, attrDefs: [] },
    { id: "et_scale", name: "Scale", role: "server", count: 1, attrDefs: [] },
  ],
  stateVariables: [
    { name: "trucksLoaded", initialValue: 0 },
    { name: "trucksWeighed", initialValue: 0 },
  ],
  bEvents: [
    { id: "b_arrive", name: "Truck Arrival", scheduledTime: "0", effect: "ARRIVE(Truck)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2.5" } }] },
    { id: "b_load_done", name: "Load Done", scheduledTime: "9999", effect: "RELEASE(Loader, Weigh); trucksLoaded++", schedules: [] },
    { id: "b_weigh_done", name: "Weigh Done", scheduledTime: "9999", effect: "COMPLETE(); trucksWeighed++", schedules: [] },
  ],
  cEvents: [
    { id: "c_load", name: "Start Loading", priority: 1,
      condition: "queue(Truck).length > 0 AND idle(Loader).count > 0",
      effect: "ASSIGN(Truck, Loader)",
      cSchedules: [{ eventId: "b_load_done", dist: "Triangular", distParams: { min: "3", mode: "5", max: "8" }, useEntityCtx: true }] },
    { id: "c_weigh", name: "Start Weighing", priority: 2,
      condition: "queue(Weigh).length > 0 AND idle(Scale).count > 0",
      effect: "ASSIGN(Weigh, Scale)",
      cSchedules: [{ eventId: "b_weigh_done", dist: "Uniform", distParams: { min: "1.5", max: "3" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_truck", name: "Truck", customerType: "Truck", capacity: "", discipline: "FIFO" },
    { id: "q_weigh", name: "Weigh", capacity: "", discipline: "FIFO" },
  ],
};

const DATA_CENTER = {
  name: "Data Center",
  description: "Compute cluster with 10 servers. Jobs arrive every 2 min, processed in Triangular(5,8,15) min. Multi-server resource pooling with capacity > 1.",
  entityTypes: [
    { id: "et_job", name: "Job", role: "customer", count: 0, attrDefs: [] },
    { id: "et_host", name: "Host", role: "server", count: 10, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Job Arrival", scheduledTime: "0", effect: "ARRIVE(Job)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } }] },
    { id: "b_process_done", name: "Process Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [{
    id: "c_process", name: "Process Job", priority: 1,
    condition: "queue(Job).length > 0 AND idle(Host).count > 0",
    effect: "ASSIGN(Job, Host)",
    cSchedules: [{ eventId: "b_process_done", dist: "Triangular", distParams: { min: "5", mode: "8", max: "15" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_job", name: "Job", customerType: "Job", capacity: "", discipline: "FIFO" }],
};

const OUTPATIENT_CLINIC = {
  name: "Outpatient Clinic",
  description: "Two-stage clinic: check-in with receptionist (2), then consultation with doctor (4). Patients arrive every 5 min. Uses RELEASE macro for multi-stage routing.",
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [] },
    { id: "et_recep", name: "Receptionist", role: "server", count: 2, attrDefs: [] },
    { id: "et_doctor", name: "Doctor", role: "server", count: 4, attrDefs: [] },
  ],
  stateVariables: [{ name: "checkedIn", initialValue: 0 }],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: "ARRIVE(Patient)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "5" } }] },
    { id: "b_checkin_done", name: "Check-in Done", scheduledTime: "9999", effect: "RELEASE(Receptionist, Consultation); checkedIn++", schedules: [] },
    { id: "b_consult_done", name: "Consultation Done", scheduledTime: "9999", effect: "COMPLETE()", schedules: [] },
  ],
  cEvents: [
    { id: "c_checkin", name: "Start Check-in", priority: 1,
      condition: "queue(Patient).length > 0 AND idle(Receptionist).count > 0",
      effect: "ASSIGN(Patient, Receptionist)",
      cSchedules: [{ eventId: "b_checkin_done", dist: "Uniform", distParams: { min: "2", max: "4" }, useEntityCtx: true }] },
    { id: "c_consult", name: "Start Consultation", priority: 2,
      condition: "queue(Consultation).length > 0 AND idle(Doctor).count > 0",
      effect: "ASSIGN(Consultation, Doctor)",
      cSchedules: [{ eventId: "b_consult_done", dist: "Triangular", distParams: { min: "8", mode: "15", max: "25" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_patient", name: "Patient", customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_consult", name: "Consultation", capacity: "", discipline: "FIFO" },
  ],
};

const WAREHOUSE = {
  name: "Warehouse Picking",
  description: "Orders arrive every 3 min, batched into groups of 5, then picked by 3 workers (8 min per batch). Demonstrates BATCH macro for order consolidation.",
  entityTypes: [
    { id: "et_order", name: "Order", role: "customer", count: 0, attrDefs: [] },
    { id: "et_picker", name: "Picker", role: "server", count: 3, attrDefs: [] },
  ],
  stateVariables: [{ name: "batchesPicked", initialValue: 0 }],
  bEvents: [
    { id: "b_arrive", name: "Order Arrival", scheduledTime: "0", effect: "ARRIVE(Order)",
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "3" } }] },
    { id: "b_pick_done", name: "Pick Done", scheduledTime: "9999", effect: "COMPLETE(); batchesPicked++", schedules: [] },
  ],
  cEvents: [
    { id: "c_batch", name: "Batch Orders", priority: 1,
      condition: "queue(Order).length >= 5",
      effect: "BATCH(Order, 5)",
      cSchedules: [] },
    { id: "c_pick", name: "Pick Batch", priority: 2,
      condition: "queue(Order).length > 0 AND idle(Picker).count > 0",
      effect: "ASSIGN(Order, Picker)",
      cSchedules: [{ eventId: "b_pick_done", dist: "Fixed", distParams: { value: "8" }, useEntityCtx: true }] },
  ],
  queues: [{ id: "q_order", name: "Order", customerType: "Order", capacity: "", discipline: "FIFO" }],
};

export const TEMPLATES = [
  { id: "mm1", ...MM1 },
  { id: "call-center", ...CALL_CENTER },
  { id: "er-triage", ...ER_TRIAGE },
  { id: "fast-food", ...FAST_FOOD },
  { id: "factory", ...FACTORY },
  { id: "airport", ...AIRPORT },
  { id: "construction", ...CONSTRUCTION },
  { id: "data-center", ...DATA_CENTER },
  { id: "outpatient-clinic", ...OUTPATIENT_CLINIC },
  { id: "warehouse", ...WAREHOUSE },
];
