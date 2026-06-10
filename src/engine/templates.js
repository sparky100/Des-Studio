// Curated runnable template models for one-click instant run.
// Rule: ARRIVE always uses two arguments — ARRIVE(EntityType, QueueName) —
// so the queue name is explicit and matches the registered queue definition.

// ── Academic / Benchmark ──────────────────────────────────────────────────────

const MM1 = {
  name: "M/M/1 Queue",
  description: "Classic single-server queue with exponential arrivals (rate 0.9) and exponential service (rate 1.0). Utilisation 90%. The canonical benchmark model.",
  domain: "Academic",
  templateMeta: {
    scenarioType: "Single-server queue",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Arrival mean 1.111 (rate ≈0.9/min). Service mean 1.0. Increase server count to convert to M/M/c.",
    limitations: "Single server only. No abandonment, finite capacity, or routing.",
  },
  entityTypes: [
    { id: "et_cust", name: "Customer", role: "customer", count: 0, attrDefs: [] },
    { id: "et_srv",  name: "Server",   role: "server",   count: 1, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: ["ARRIVE(Customer, Customer)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.111" } }] },
    { id: "b_complete", name: "Complete", scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [{
    id: "c_seize", name: "Seize", priority: 1,
    condition: "queue(Customer).length > 0 AND idle(Server).count > 0",
    effect: ["ASSIGN(Customer, Server)"],
    cSchedules: [{ eventId: "b_complete", dist: "Exponential", distParams: { mean: "1" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_cust", name: "Customer", customerType: "Customer", capacity: "", discipline: "FIFO" }],
};

// ── Healthcare ────────────────────────────────────────────────────────────────

const ER_TRIAGE = {
  name: "ER Triage",
  description: "Two-stage emergency room. Patients arrive, see a triage nurse (2 nurses), then queue for a doctor (3 doctors). Priority queue for treatment.",
  domain: "Healthcare",
  templateMeta: {
    scenarioType: "Two-stage priority queue",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Arrival mean 2 min. Triage Uniform(2,5) min. Treatment Triangular(5,10,20) min. Priority 1=urgent, 5=routine.",
    limitations: "No bed capacity constraint. Priority assigned at arrival, not re-triaged.",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [
      { id: "a_priority", name: "priority", valueType: "number", defaultValue: 3, mutable: true, dist: "Uniform", distParams: { min: "1", max: "5" } },
    ]},
    { id: "et_nurse",  name: "Nurse",  role: "server", count: 2, attrDefs: [] },
    { id: "et_doctor", name: "Doctor", role: "server", count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: ["ARRIVE(Patient, Patient)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } }] },
    { id: "b_triage_done",    name: "Triage Done",    scheduledTime: "9999", effect: ["RELEASE(Nurse, Treatment)"], schedules: [] },
    { id: "b_treatment_done", name: "Treatment Done", scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c_triage", name: "Triage", priority: 1,
      condition: "queue(Patient).length > 0 AND idle(Nurse).count > 0",
      effect: ["ASSIGN(Patient, Nurse)"],
      cSchedules: [{ eventId: "b_triage_done", dist: "Uniform", distParams: { min: "2", max: "5" }, useEntityCtx: true }] },
    { id: "c_treat", name: "Treat Patient", priority: 2,
      condition: "queue(Treatment).length > 0 AND idle(Doctor).count > 0",
      effect: ["ASSIGN(Treatment, Doctor)"],
      cSchedules: [{ eventId: "b_treatment_done", dist: "Triangular", distParams: { min: "5", mode: "10", max: "20" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_patient",   name: "Patient",   customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_treatment", name: "Treatment", customerType: "Patient", capacity: "", discipline: "PRIORITY" },
  ],
};

const OUTPATIENT_CLINIC = {
  name: "Outpatient Clinic",
  description: "Two-stage clinic: check-in with receptionist (2), then consultation with doctor (4). Patients arrive every 5 min. Uses RELEASE macro for multi-stage routing.",
  domain: "Healthcare",
  templateMeta: {
    scenarioType: "Two-stage multi-server clinic",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Arrival mean 5 min. Check-in Uniform(2,4) min. Consultation Triangular(8,15,25) min.",
    limitations: "No appointment scheduling, no no-show modelling, no bed capacity constraint.",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient",       role: "customer", count: 0, attrDefs: [] },
    { id: "et_recep",   name: "Receptionist",  role: "server",   count: 2, attrDefs: [] },
    { id: "et_doctor",  name: "Doctor",        role: "server",   count: 4, attrDefs: [] },
  ],
  stateVariables: [{ name: "checkedIn", initialValue: "0" }],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: ["ARRIVE(Patient, Patient)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "5" } }] },
    { id: "b_checkin_done", name: "Check-in Done", scheduledTime: "9999",
      effect: ["RELEASE(Receptionist, Consultation)", "checkedIn++"], schedules: [] },
    { id: "b_consult_done", name: "Consultation Done", scheduledTime: "9999",
      effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c_checkin", name: "Check In", priority: 1,
      condition: "queue(Patient).length > 0 AND idle(Receptionist).count > 0",
      effect: ["ASSIGN(Patient, Receptionist)"],
      cSchedules: [{ eventId: "b_checkin_done", dist: "Uniform", distParams: { min: "2", max: "4" }, useEntityCtx: true }] },
    { id: "c_consult", name: "Consult", priority: 2,
      condition: "queue(Consultation).length > 0 AND idle(Doctor).count > 0",
      effect: ["ASSIGN(Consultation, Doctor)"],
      cSchedules: [{ eventId: "b_consult_done", dist: "Triangular", distParams: { min: "8", mode: "15", max: "25" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_patient",  name: "Patient",      customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_consult",  name: "Consultation", customerType: "Patient", capacity: "", discipline: "FIFO" },
  ],
};

const WARD_ADMISSION = {
  name: "Ward Bed Admission",
  description: "Patients admitted via assessment (2 nurses), then assigned to one of 10 ward beds. Bed capacity constraint causes queuing when the ward is full. Models bed-blocking.",
  domain: "Healthcare",
  templateMeta: {
    scenarioType: "Finite-capacity bed admission",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Arrival mean 4 h. Assessment Uniform(0.5,1.5) h. Length of stay Triangular(6,24,72) h. Beds: 10 (finite).",
    limitations: "No discharge delay modelling. Patients balk if admission queue is full (capacity 5).",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [] },
    { id: "et_nurse",   name: "Nurse",   role: "server",   count: 2,  attrDefs: [] },
    { id: "et_bed",     name: "Bed",     role: "server",   count: 10, attrDefs: [] },
  ],
  stateVariables: [
    { name: "admissions", initialValue: "0" },
    { name: "bedBlocks",  initialValue: "0" },
  ],
  bEvents: [
    { id: "b_arrive", name: "Patient Arrival", scheduledTime: "0", effect: ["ARRIVE(Patient, Admission)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "4" } }] },
    { id: "b_assessed", name: "Assessment Done", scheduledTime: "9999",
      effect: ["RELEASE(Nurse, Ward)", "admissions++"], schedules: [] },
    { id: "b_discharged", name: "Patient Discharged", scheduledTime: "9999",
      effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c_assess", name: "Assess Patient", priority: 1,
      condition: "queue(Admission).length > 0 AND idle(Nurse).count > 0",
      effect: ["ASSIGN(Admission, Nurse)"],
      cSchedules: [{ eventId: "b_assessed", dist: "Uniform", distParams: { min: "0.5", max: "1.5" }, useEntityCtx: true }] },
    { id: "c_admit", name: "Admit to Ward", priority: 2,
      condition: "queue(Ward).length > 0 AND idle(Bed).count > 0",
      effect: ["ASSIGN(Ward, Bed)"],
      cSchedules: [{ eventId: "b_discharged", dist: "Triangular", distParams: { min: "6", mode: "24", max: "72" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_admission", name: "Admission", customerType: "Patient", capacity: "5",  discipline: "FIFO" },
    { id: "q_ward",      name: "Ward",      customerType: "Patient", capacity: "20", discipline: "FIFO" },
  ],
};

// ── Service Systems ───────────────────────────────────────────────────────────

const CALL_CENTER = {
  name: "Call Center",
  description: "Multi-server call centre with 3 agents, exponential arrivals (rate 1.5), exponential service (rate 0.4), and caller abandonment after 10 time units.",
  domain: "Service Systems",
  templateMeta: {
    scenarioType: "Multi-server queue with abandonment",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE", "RENEGE"],
    paramGuide: "Arrival mean 0.667 min (rate 1.5). Service mean 2.5 min. Patience 10 min. Agents: 3.",
    limitations: "Single skill pool. No priority or callback modelling.",
  },
  entityTypes: [
    { id: "et_caller", name: "Caller", role: "customer", count: 0, attrDefs: [] },
    { id: "et_agent",  name: "Agent",  role: "server",   count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Arrival", scheduledTime: "0", effect: ["ARRIVE(Caller, Caller)"],
      schedules: [
        { eventId: "b_arrive",  dist: "Exponential", distParams: { mean: "0.667" } },
        { eventId: "b_renege",  dist: "Fixed",        distParams: { value: "10" }, isRenege: true },
      ] },
    { id: "b_complete", name: "Complete",          scheduledTime: "9999", effect: ["COMPLETE()"],    schedules: [] },
    { id: "b_renege",   name: "Abandonment Timer", scheduledTime: "9999", effect: ["RENEGE(ctx)"],   schedules: [] },
  ],
  cEvents: [{
    id: "c_seize", name: "Assign Agent", priority: 1,
    condition: "queue(Caller).length > 0 AND idle(Agent).count > 0",
    effect: ["ASSIGN(Caller, Agent)"],
    cSchedules: [{ eventId: "b_complete", dist: "Exponential", distParams: { mean: "2.5" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_caller", name: "Caller", customerType: "Caller", capacity: "", discipline: "FIFO" }],
};

const FAST_FOOD = {
  name: "Fast Food Drive-Through",
  description: "Three-stage drive-through: Order → Payment → Pickup. 1 cashier, 2 kitchen staff. FIFO queues between each stage.",
  domain: "Service Systems",
  templateMeta: {
    scenarioType: "Three-stage sequential routing",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Arrival mean 1.5 min. Order Uniform(0.5,1.5) min. Payment Uniform(0.3,0.8) min. Pickup Uniform(1,3) min.",
    limitations: "Single lane — no parallel order stations. No balking or jockeying.",
  },
  entityTypes: [
    { id: "et_cust",    name: "Customer", role: "customer", count: 0, attrDefs: [] },
    { id: "et_cashier", name: "Cashier",  role: "server",   count: 1, attrDefs: [] },
    { id: "et_kitchen", name: "Kitchen",  role: "server",   count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive",      name: "Arrival",      scheduledTime: "0",    effect: ["ARRIVE(Customer, Order)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.5" } }] },
    { id: "b_order_done",  name: "Order Taken",  scheduledTime: "9999", effect: ["RELEASE(Cashier, Payment)"], schedules: [] },
    { id: "b_pay_done",    name: "Payment Done", scheduledTime: "9999", effect: ["RELEASE(Cashier, Pickup)"],  schedules: [] },
    { id: "b_pickup_done", name: "Pickup Done",  scheduledTime: "9999", effect: ["COMPLETE()"],               schedules: [] },
  ],
  cEvents: [
    { id: "c_order",  name: "Take Order",   priority: 1,
      condition: "queue(Order).length > 0 AND idle(Cashier).count > 0",
      effect: ["ASSIGN(Order, Cashier)"],
      cSchedules: [{ eventId: "b_order_done",  dist: "Uniform", distParams: { min: "0.5", max: "1.5" }, useEntityCtx: true }] },
    { id: "c_pay",    name: "Take Payment", priority: 2,
      condition: "queue(Payment).length > 0 AND idle(Cashier).count > 0",
      effect: ["ASSIGN(Payment, Cashier)"],
      cSchedules: [{ eventId: "b_pay_done",    dist: "Uniform", distParams: { min: "0.3", max: "0.8" }, useEntityCtx: true }] },
    { id: "c_pickup", name: "Serve Food",   priority: 3,
      condition: "queue(Pickup).length > 0 AND idle(Kitchen).count > 0",
      effect: ["ASSIGN(Pickup, Kitchen)"],
      cSchedules: [{ eventId: "b_pickup_done", dist: "Uniform", distParams: { min: "1",   max: "3"   }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_order",   name: "Order",   customerType: "Customer", capacity: "", discipline: "FIFO" },
    { id: "q_pay",     name: "Payment", customerType: "Customer", capacity: "", discipline: "FIFO" },
    { id: "q_pickup",  name: "Pickup",  customerType: "Customer", capacity: "", discipline: "FIFO" },
  ],
};

const AIRPORT = {
  name: "Airport Security",
  description: "Two-stage security screening with limited queue capacity. Document check (2 officers) then baggage scan (3 scanners). Queue capacity 15 at each stage causes balking.",
  domain: "Service Systems",
  templateMeta: {
    scenarioType: "Two-stage finite-capacity queue with balking",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Arrival mean 1 min. Document check Triangular(0.5,1,2) min. Baggage scan Triangular(1,2,4) min. Queue cap 15.",
    limitations: "No fast-track or priority lane. Balking is hard — passengers exit if queue full.",
  },
  entityTypes: [
    { id: "et_passenger", name: "Passenger", role: "customer", count: 0, attrDefs: [] },
    { id: "et_officer",   name: "Officer",   role: "server",   count: 2, attrDefs: [] },
    { id: "et_scanner",   name: "Scanner",   role: "server",   count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive",   name: "Arrival",             scheduledTime: "0",    effect: ["ARRIVE(Passenger, Documents)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1" } }] },
    { id: "b_doc_done", name: "Document Check Done", scheduledTime: "9999", effect: ["RELEASE(Officer, ScanQueue)"], schedules: [] },
    { id: "b_scan_done", name: "Scan Done",          scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c_doc",  name: "Check Documents", priority: 1,
      condition: "queue(Documents).length > 0 AND idle(Officer).count > 0",
      effect: ["ASSIGN(Documents, Officer)"],
      cSchedules: [{ eventId: "b_doc_done",  dist: "Triangular", distParams: { min: "0.5", mode: "1", max: "2" }, useEntityCtx: true }] },
    { id: "c_scan", name: "Scan Baggage",    priority: 2,
      condition: "queue(ScanQueue).length > 0 AND idle(Scanner).count > 0",
      effect: ["ASSIGN(ScanQueue, Scanner)"],
      cSchedules: [{ eventId: "b_scan_done", dist: "Triangular", distParams: { min: "1",   mode: "2", max: "4" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_docs", name: "Documents", customerType: "Passenger", capacity: "15", discipline: "FIFO" },
    { id: "q_scan", name: "ScanQueue", customerType: "Passenger", capacity: "15", discipline: "FIFO" },
  ],
};

const BANK_BRANCH = {
  name: "Bank Branch",
  description: "Customer service branch with 4 tellers. Priority queue: Premium customers (priority 1) served before Standard (priority 3). Demonstrates multi-server priority queue.",
  domain: "Service Systems",
  templateMeta: {
    scenarioType: "Multi-server priority queue",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Arrival mean 3 min. Service Uniform(3,8) min. 4 tellers. ~30% of customers are Premium (priority 1 vs 3).",
    limitations: "Single shared queue for all tellers. No appointment customers or online channel.",
  },
  entityTypes: [
    { id: "et_cust",   name: "Customer", role: "customer", count: 0, attrDefs: [
      { id: "a_pri", name: "priority", valueType: "number", defaultValue: 3, mutable: false,
        dist: "Uniform", distParams: { min: "1", max: "5" } },
    ]},
    { id: "et_teller", name: "Teller",   role: "server",   count: 4, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive",   name: "Arrival",  scheduledTime: "0",    effect: ["ARRIVE(Customer, Queue)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "3" } }] },
    { id: "b_complete", name: "Complete", scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [{
    id: "c_serve", name: "Serve Customer", priority: 1,
    condition: "queue(Queue).length > 0 AND idle(Teller).count > 0",
    effect: ["ASSIGN(Queue, Teller)"],
    cSchedules: [{ eventId: "b_complete", dist: "Uniform", distParams: { min: "3", max: "8" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_main", name: "Queue", customerType: "Customer", capacity: "", discipline: "PRIORITY" }],
};

const RETAIL_CHECKOUT = {
  name: "Retail Checkout",
  description: "Supermarket checkout with 6 staffed lanes and a waiting area (capacity 20). Shoppers balk when the waiting area is full. Service time varies by basket size.",
  domain: "Service Systems",
  templateMeta: {
    scenarioType: "Multi-server finite-capacity queue with balking",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Arrival mean 1.5 min. Service Triangular(2,5,15) min. 6 checkouts. Waiting area cap 20.",
    limitations: "No self-checkout lane. No express lane (basket-size routing not modelled).",
  },
  entityTypes: [
    { id: "et_shopper",  name: "Shopper",   role: "customer", count: 0, attrDefs: [] },
    { id: "et_checkout", name: "Checkout",  role: "server",   count: 6, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive",   name: "Shopper Arrives", scheduledTime: "0",    effect: ["ARRIVE(Shopper, Waiting)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "1.5" } }] },
    { id: "b_complete", name: "Checkout Done",   scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [{
    id: "c_checkout", name: "Open Checkout", priority: 1,
    condition: "queue(Waiting).length > 0 AND idle(Checkout).count > 0",
    effect: ["ASSIGN(Waiting, Checkout)"],
    cSchedules: [{ eventId: "b_complete", dist: "Triangular", distParams: { min: "2", mode: "5", max: "15" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_wait", name: "Waiting", customerType: "Shopper", capacity: "20", discipline: "FIFO" }],
};

// ── Manufacturing ─────────────────────────────────────────────────────────────

const FACTORY = {
  name: "Factory Assembly",
  description: "Assembly line where 3 parts are batched into 1 product, then assembled by 2 workers. Parts arrive at rate 0.5/min. Demonstrates the BATCH macro.",
  domain: "Manufacturing",
  templateMeta: {
    scenarioType: "Batch assembly line",
    keyMacros: ["ARRIVE", "BATCH", "ASSIGN", "COMPLETE"],
    paramGuide: "Part arrival mean 2 min. Assembly Fixed(2) min. Batch size 3. Workers: 2.",
    limitations: "Single-stage assembly only. No WIP buffer limits or machine breakdown.",
  },
  entityTypes: [
    { id: "et_part",   name: "Part",   role: "customer", count: 0, attrDefs: [] },
    { id: "et_worker", name: "Worker", role: "server",   count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive",        name: "Part Arrival",    scheduledTime: "0",    effect: ["ARRIVE(Part, Parts)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } }] },
    { id: "b_assemble_done", name: "Assembly Done",   scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c_batch",    name: "Batch Parts",      priority: 1,
      condition: "queue(Parts).length >= 3",
      effect: ["BATCH(Parts, 3)"],
      cSchedules: [] },
    { id: "c_assemble", name: "Assemble Product", priority: 2,
      condition: "queue(Parts).length > 0 AND idle(Worker).count > 0",
      effect: ["ASSIGN(Parts, Worker)"],
      cSchedules: [{ eventId: "b_assemble_done", dist: "Fixed", distParams: { value: "2" }, useEntityCtx: true }] },
  ],
  queues: [{ id: "q_parts", name: "Parts", customerType: "Part", capacity: "", discipline: "FIFO" }],
};

const CONSTRUCTION = {
  name: "Construction Logistics",
  description: "Truck hauling: trucks arrive at a loader (2), then queue for a weigh station (1), then depart. Two-stage routing with state variable counters.",
  domain: "Manufacturing",
  templateMeta: {
    scenarioType: "Two-stage sequential routing with state variables",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Truck arrival mean 2.5 min. Loading Triangular(3,5,8) min. Weighing Uniform(1.5,3) min.",
    limitations: "No truck breakdown or priority loading. Counter variables are display-only.",
  },
  entityTypes: [
    { id: "et_truck",  name: "Truck",  role: "customer", count: 0, attrDefs: [] },
    { id: "et_loader", name: "Loader", role: "server",   count: 2, attrDefs: [] },
    { id: "et_scale",  name: "Scale",  role: "server",   count: 1, attrDefs: [] },
  ],
  stateVariables: [
    { name: "trucksLoaded",  initialValue: "0" },
    { name: "trucksWeighed", initialValue: "0" },
  ],
  bEvents: [
    { id: "b_arrive",    name: "Truck Arrival", scheduledTime: "0",    effect: ["ARRIVE(Truck, Truck)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2.5" } }] },
    { id: "b_load_done", name: "Load Done",     scheduledTime: "9999",
      effect: ["RELEASE(Loader, Weigh)", "trucksLoaded++"], schedules: [] },
    { id: "b_weigh_done", name: "Weigh Done",   scheduledTime: "9999",
      effect: ["COMPLETE()", "trucksWeighed++"], schedules: [] },
  ],
  cEvents: [
    { id: "c_load",  name: "Load Truck",  priority: 1,
      condition: "queue(Truck).length > 0 AND idle(Loader).count > 0",
      effect: ["ASSIGN(Truck, Loader)"],
      cSchedules: [{ eventId: "b_load_done",  dist: "Triangular", distParams: { min: "3", mode: "5", max: "8" }, useEntityCtx: true }] },
    { id: "c_weigh", name: "Weigh Truck", priority: 2,
      condition: "queue(Weigh).length > 0 AND idle(Scale).count > 0",
      effect: ["ASSIGN(Weigh, Scale)"],
      cSchedules: [{ eventId: "b_weigh_done", dist: "Uniform",    distParams: { min: "1.5", max: "3" },          useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_truck", name: "Truck", customerType: "Truck", capacity: "", discipline: "FIFO" },
    { id: "q_weigh", name: "Weigh", customerType: "Truck", capacity: "", discipline: "FIFO" },
  ],
};

const WAREHOUSE = {
  name: "Warehouse Picking",
  description: "Orders arrive every 3 min, batched into groups of 5, then picked by 3 workers (8 min per batch). Demonstrates BATCH macro for order consolidation.",
  domain: "Manufacturing",
  templateMeta: {
    scenarioType: "Batch consolidation and picking",
    keyMacros: ["ARRIVE", "BATCH", "ASSIGN", "COMPLETE"],
    paramGuide: "Order arrival mean 3 min. Pick time Fixed(8) min. Batch size 5. Pickers: 3.",
    limitations: "Uniform batch size only. No partial-batch dispatch or urgent-order priority.",
  },
  entityTypes: [
    { id: "et_order",  name: "Order",  role: "customer", count: 0, attrDefs: [] },
    { id: "et_picker", name: "Picker", role: "server",   count: 3, attrDefs: [] },
  ],
  stateVariables: [{ name: "batchesPicked", initialValue: "0" }],
  bEvents: [
    { id: "b_arrive",   name: "Order Arrival", scheduledTime: "0",    effect: ["ARRIVE(Order, Order)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "3" } }] },
    { id: "b_pick_done", name: "Pick Done",    scheduledTime: "9999",
      effect: ["COMPLETE()", "batchesPicked++"], schedules: [] },
  ],
  cEvents: [
    { id: "c_batch", name: "Batch Orders", priority: 1,
      condition: "queue(Order).length >= 5",
      effect: ["BATCH(Order, 5)"],
      cSchedules: [] },
    { id: "c_pick",  name: "Pick Batch",   priority: 2,
      condition: "queue(Order).length > 0 AND idle(Picker).count > 0",
      effect: ["ASSIGN(Order, Picker)"],
      cSchedules: [{ eventId: "b_pick_done", dist: "Fixed", distParams: { value: "8" }, useEntityCtx: true }] },
  ],
  queues: [{ id: "q_order", name: "Order", customerType: "Order", capacity: "", discipline: "FIFO" }],
};

// ── Logistics ─────────────────────────────────────────────────────────────────

const PORT_BERTH = {
  name: "Port Berth Operations",
  description: "Vessels arrive at port and queue for one of 3 berths. Unloading takes 4–16 hours. High utilisation demonstrates congestion and berth capacity planning.",
  domain: "Logistics",
  templateMeta: {
    scenarioType: "Multi-server high-utilisation queue",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Vessel arrival mean 8 h. Unloading Triangular(4,8,16) h. Berths: 3. Utilisation ~83%.",
    limitations: "No tidal windows, cargo type differentiation, or berth priority. Single vessel type.",
  },
  entityTypes: [
    { id: "et_vessel", name: "Vessel", role: "customer", count: 0, attrDefs: [] },
    { id: "et_berth",  name: "Berth",  role: "server",   count: 3, attrDefs: [] },
  ],
  stateVariables: [{ name: "vesselsDeparted", initialValue: "0" }],
  bEvents: [
    { id: "b_arrive",  name: "Vessel Arrival", scheduledTime: "0",    effect: ["ARRIVE(Vessel, Anchorage)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "8" } }] },
    { id: "b_depart",  name: "Vessel Departs", scheduledTime: "9999",
      effect: ["COMPLETE()", "vesselsDeparted++"], schedules: [] },
  ],
  cEvents: [{
    id: "c_berth", name: "Assign Berth", priority: 1,
    condition: "queue(Anchorage).length > 0 AND idle(Berth).count > 0",
    effect: ["ASSIGN(Anchorage, Berth)"],
    cSchedules: [{ eventId: "b_depart", dist: "Triangular", distParams: { min: "4", mode: "8", max: "16" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_anchorage", name: "Anchorage", customerType: "Vessel", capacity: "", discipline: "FIFO" }],
};

// ── Technology ────────────────────────────────────────────────────────────────

const DATA_CENTER = {
  name: "Data Center",
  description: "Compute cluster with 10 servers. Jobs arrive every 2 min, processed in Triangular(5,8,15) min. Multi-server resource pooling with capacity > 1.",
  domain: "Technology",
  templateMeta: {
    scenarioType: "Large multi-server resource pool",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Job arrival mean 2 min. Processing Triangular(5,8,15) min. Hosts: 10. Utilisation ~65%.",
    limitations: "Homogeneous job types only. No job priority, preemption, or checkpointing.",
  },
  entityTypes: [
    { id: "et_job",  name: "Job",  role: "customer", count: 0,  attrDefs: [] },
    { id: "et_host", name: "Host", role: "server",   count: 10, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive",       name: "Job Arrival",  scheduledTime: "0",    effect: ["ARRIVE(Job, Job)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } }] },
    { id: "b_process_done", name: "Process Done", scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [{
    id: "c_process", name: "Process Job", priority: 1,
    condition: "queue(Job).length > 0 AND idle(Host).count > 0",
    effect: ["ASSIGN(Job, Host)"],
    cSchedules: [{ eventId: "b_process_done", dist: "Triangular", distParams: { min: "5", mode: "8", max: "15" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_job", name: "Job", customerType: "Job", capacity: "", discipline: "FIFO" }],
};

// ── Healthcare (Sprint 33) ────────────────────────────────────────────────────

const SURGICAL_SUITE = {
  name: "Surgical Suite",
  description: "Operating room with elective and emergency surgeries. Each surgery requires a surgeon AND anesthetist simultaneously (COSEIZE). Queue prioritizes by urgency attribute. Emergency patients (urgency 1) are served first.",
  domain: "Healthcare",
  templateMeta: {
    scenarioType: "Multi-resource surgery with priority queue",
    keyMacros: ["ARRIVE", "COSEIZE", "COMPLETE"],
    paramGuide: "Patient arrival mean 10 min. Surgery Triangular(10,20,40) min. Urgency Uniform(1,5) — lower is more urgent. 2 surgeons, 2 anesthetists.",
    limitations: "No preemption modelling. Priority handled via queue discipline only.",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [
      { id: "a_urgency", name: "urgency", valueType: "number", defaultValue: 3, mutable: false,
        dist: "Uniform", distParams: { min: "1", max: "5" } },
    ]},
    { id: "et_surgeon", name: "Surgeon", role: "server", count: 2, attrDefs: [] },
    { id: "et_anesthetist", name: "Anesthetist", role: "server", count: 2, attrDefs: [] },
  ],
  stateVariables: [
    { name: "surgeriesCompleted", initialValue: "0" },
  ],
  bEvents: [
    { id: "b_arrive", name: "Patient Arrival", scheduledTime: "0", effect: ["ARRIVE(Patient, SurgeryQueue)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "10" } }] },
    { id: "b_surgery_done", name: "Surgery Complete", scheduledTime: "9999", effect: ["COMPLETE()", "surgeriesCompleted++"], schedules: [] },
  ],
  cEvents: [
    { id: "c_surgery", name: "Perform Surgery", priority: 1,
      condition: "queue(SurgeryQueue).length > 0 AND idle(Surgeon).count > 0 AND idle(Anesthetist).count > 0",
      effect: ["COSEIZE(SurgeryQueue, Surgeon, Anesthetist)"],
      cSchedules: [{ eventId: "b_surgery_done", dist: "Triangular", distParams: { min: "10", mode: "20", max: "40" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_surgery", name: "SurgeryQueue", customerType: "Patient", capacity: "", discipline: "PRIORITY(urgency)" },
  ],
};

// ── Manufacturing (Sprint 33) ─────────────────────────────────────────────────

const ORDER_FULFILLMENT = {
  name: "Order Fulfillment",
  description: "Orders and items arrive independently and must be synchronized (MATCH) before packing. Orders have due dates and are processed in Earliest Due Date order. Demonstrates entity matching and EDD queue discipline.",
  domain: "Manufacturing",
  templateMeta: {
    scenarioType: "Entity synchronization with due-date scheduling",
    keyMacros: ["ARRIVE", "MATCH", "ASSIGN", "COMPLETE"],
    paramGuide: "Order arrival mean 5 min. Item arrival mean 5 min. Pack time Triangular(3,5,8) min. 2 packers. Due dates Uniform(30,120).",
    limitations: "Single item per order. No partial fulfillment or backorder modelling.",
  },
  entityTypes: [
    { id: "et_order", name: "Order", role: "customer", count: 0, attrDefs: [
      { id: "a_dueDate", name: "dueDate", valueType: "number", defaultValue: 60, mutable: false,
        dist: "Uniform", distParams: { min: "30", max: "120" } },
    ]},
    { id: "et_item", name: "Item", role: "customer", count: 0, attrDefs: [] },
    { id: "et_packer", name: "Packer", role: "server", count: 2, attrDefs: [] },
  ],
  stateVariables: [
    { name: "ordersFulfilled", initialValue: "0" },
  ],
  bEvents: [
    { id: "b_order_arrive", name: "Order Arrival", scheduledTime: "0", effect: ["ARRIVE(Order, OrderQueue)"],
      schedules: [{ eventId: "b_order_arrive", dist: "Exponential", distParams: { mean: "5" } }] },
    { id: "b_item_arrive", name: "Item Arrival", scheduledTime: "0", effect: ["ARRIVE(Item, ItemQueue)"],
      schedules: [{ eventId: "b_item_arrive", dist: "Exponential", distParams: { mean: "5" } }] },
    { id: "b_pack_done", name: "Pack Complete", scheduledTime: "9999", effect: ["COMPLETE()", "ordersFulfilled++"], schedules: [] },
  ],
  cEvents: [
    { id: "c_match", name: "Match Order with Item", priority: 1,
      condition: "queue(OrderQueue).length > 0 AND queue(ItemQueue).length > 0",
      effect: ["MATCH(Order, OrderQueue, Item, ItemQueue, FulfillmentQueue)"],
      cSchedules: [] },
    { id: "c_pack", name: "Pack Order", priority: 2,
      condition: "queue(FulfillmentQueue).length > 0 AND idle(Packer).count > 0",
      effect: ["ASSIGN(FulfillmentQueue, Packer)"],
      cSchedules: [{ eventId: "b_pack_done", dist: "Triangular", distParams: { min: "3", mode: "5", max: "8" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_order", name: "OrderQueue", customerType: "Order", capacity: "", discipline: "EDD" },
    { id: "q_item", name: "ItemQueue", customerType: "Item", capacity: "", discipline: "FIFO" },
    { id: "q_fulfillment", name: "FulfillmentQueue", customerType: "Order", capacity: "", discipline: "EDD" },
  ],
};

// ── Export ────────────────────────────────────────────────────────────────────

// ── Sprint 41-45: New capability templates ───────────────────────────────────

const MACHINE_SHOP_FAILURES = {
  name: "Machine Shop with Failures",
  description: "CNC machine shop with 3 machines subject to random breakdowns (MTBF 120 min) and repair (MTTR 20 min). Jobs queue and wait for an available, working machine. Shows how server downtime reduces effective throughput.",
  domain: "Manufacturing",
  templateMeta: {
    scenarioType: "Multi-server queue with server failures and repair",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Job arrival mean 5 min. Processing Triangular(10,15,25) min. MTBF 120 min, MTTR 20 min → ≈86% availability per machine.",
    limitations: "No job priority or routing. Failure model uses exponential MTBF/MTTR.",
  },
  entityTypes: [
    { id: "et_job",     name: "Job",     role: "customer", count: 0, attrDefs: [] },
    { id: "et_machine", name: "Machine", role: "server",   count: 3, attrDefs: [],
      mtbfDist: "Exponential", mtbfDistParams: { mean: "120" },
      mttrDist: "Exponential", mttrDistParams: { mean: "20" } },
  ],
  stateVariables: [],
  goals: [
    { metric: "served",  operator: ">=", target: "40",  label: "served >= 40" },
    { metric: "avgWait", operator: "<",  target: "15",  label: "avgWait < 15 min" },
  ],
  bEvents: [
    { id: "b_arrive",   name: "Job Arrives",     scheduledTime: "0",    effect: ["ARRIVE(Job, JobQueue)"],
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "5" } }] },
    { id: "b_complete", name: "Machining Done",  scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [{
    id: "c_seize", name: "Machine Job", priority: 1,
    condition: "queue(JobQueue).length > 0 AND idle(Machine).count > 0",
    effect: ["ASSIGN(JobQueue, Machine)"],
    cSchedules: [{ eventId: "b_complete", dist: "Triangular", distParams: { min: "10", mode: "15", max: "25" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_job", name: "JobQueue", customerType: "Job", capacity: "", discipline: "FIFO" }],
};

const PRIORITY_ED_BALKING = {
  name: "Priority ED with Balking",
  description: "Emergency department with priority triage (severity 1–5). High-severity patients jump the queue. Patients balk at a 10% rate when the department is busy. Use the PRIORITY discipline and goal-aware sweep to find minimum doctor count.",
  domain: "Healthcare",
  templateMeta: {
    scenarioType: "Priority queue with balking and attribute-based ordering",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE"],
    paramGuide: "Arrival mean 4 min. Severity Uniform(1,5). Consultation Triangular(15,25,40) min. 3 doctors. Balk probability 10%.",
    limitations: "No triage pre-assessment stage. Severity assigned once at arrival.",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [
      { id: "a_pri", name: "priority", valueType: "number", defaultValue: 3, mutable: false,
        dist: "Uniform", distParams: { min: "1", max: "5" } },
    ]},
    { id: "et_doctor", name: "Doctor", role: "server", count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  goals: [
    { metric: "avgWait", operator: "<",  target: "20", label: "avgWait < 20 min" },
    { metric: "reneged", operator: "<",  target: "10", label: "balked < 10" },
  ],
  bEvents: [
    { id: "b_arrive",   name: "Patient Arrives",     scheduledTime: "0",    effect: ["ARRIVE(Patient, Waiting)"],
      balkProbability: 0.1,
      schedules: [{ eventId: "b_arrive", dist: "Exponential", distParams: { mean: "4" } }] },
    { id: "b_complete", name: "Consultation Done",   scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [{
    id: "c_consult", name: "Consult", priority: 1,
    condition: "queue(Waiting).length > 0 AND idle(Doctor).count > 0",
    effect: ["ASSIGN(Waiting, Doctor)"],
    cSchedules: [{ eventId: "b_complete", dist: "Triangular", distParams: { min: "15", mode: "25", max: "40" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_wait", name: "Waiting", customerType: "Patient", capacity: "30", discipline: "PRIORITY" }],
};

const COST_CALL_CENTRE = {
  name: "Cost-Optimised Call Centre",
  description: "Call centre where each handled call incurs a £5 service cost and each abandoned call incurs a £2 penalty. Goal: keep totalCost under £500 and avgWait under 3 min. Use the goal-aware parametric sweep on agent count to find the cheapest configuration that meets both goals.",
  domain: "Service Systems",
  templateMeta: {
    scenarioType: "Multi-server queue with cost tracking and goal-feasibility sweep",
    keyMacros: ["ARRIVE", "ASSIGN", "COMPLETE", "RENEGE", "COST"],
    paramGuide: "Call arrival mean 2 min. Handle time Exponential mean 5 min. 3 agents. Renege after 8 min. Service cost £5, abandonment penalty £2.",
    limitations: "Flat per-call cost — no per-minute agent cost modelling.",
  },
  entityTypes: [
    { id: "et_call",  name: "Call",  role: "customer", count: 0, attrDefs: [] },
    { id: "et_agent", name: "Agent", role: "server",   count: 3, attrDefs: [] },
  ],
  stateVariables: [],
  goals: [
    { metric: "totalCost", operator: "<",  target: "500", label: "totalCost < £500" },
    { metric: "avgWait",   operator: "<",  target: "3",   label: "avgWait < 3 min" },
  ],
  bEvents: [
    { id: "b_arrive",   name: "Call Arrives",    scheduledTime: "0",
      effect: ["ARRIVE(Call, Queue)"],
      schedules: [
        { eventId: "b_arrive", dist: "Exponential", distParams: { mean: "2" } },
        { eventId: "b_renege", dist: "Constant",    distParams: { value: "8" }, isRenege: true },
      ]},
    { id: "b_renege",   name: "Call Abandoned",  scheduledTime: "9999",
      effect: ["RENEGE(ctx)", "COST(2)"],
      schedules: [] },
    { id: "b_complete", name: "Call Handled",    scheduledTime: "9999",
      effect: ["COMPLETE()", "COST(5)"],
      schedules: [] },
  ],
  cEvents: [{
    id: "c_answer", name: "Answer Call", priority: 1,
    condition: "queue(Queue).length > 0 AND idle(Agent).count > 0",
    effect: ["ASSIGN(Queue, Agent)"],
    cSchedules: [{ eventId: "b_complete", dist: "Exponential", distParams: { mean: "5" }, useEntityCtx: true }],
  }],
  queues: [{ id: "q_calls", name: "Queue", customerType: "Call", capacity: "20", discipline: "FIFO" }],
};

// ── Capability showcases (Sprints 62-66) ─────────────────────────────────────

const APPOINTMENT_CLINIC = {
  name: "Appointment Clinic",
  description: "GP morning clinic with 15 pre-scheduled patient appointments from 08:00–11:30. Showcases: Schedule distribution with per-arrival attributes (severity, type), real-world clock (epoch 2026-05-19 08:00), attribute-conditional routing (severity ≤ 2 → Urgent Care, severity 3 → Standard Care), and cSchedule.when predicates (severity 1: Fixed 8 min, severity 2: Fixed 15 min, severity 3: Exponential mean 25 min).",
  domain: "Healthcare",
  epoch: "2026-05-19T08:00:00.000Z",
  timeUnit: "minutes",
  templateMeta: {
    scenarioType: "Scheduled arrivals with attribute-conditional routing and service-time branching",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "15 appointments at 15-min intervals 08:00–11:30. Assessment Fixed 5 min. Urgent sev-1: Fixed 8 min, Urgent sev-2: Fixed 15 min. Standard sev-3: Exponential mean 25 min. 2 clinicians.",
    limitations: "No walk-in patients, no no-shows, no appointment rescheduling. Schedule is exhausted after 15 arrivals.",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0, attrDefs: [
      { id: "a_severity", name: "severity", valueType: "number", dist: "Uniform", distParams: { min: "1", max: "3" } },
      { id: "a_type",     name: "type",     valueType: "string", defaultValue: "Routine" },
    ]},
    { id: "et_clinician", name: "Clinician", role: "server", count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive", name: "Patient Arrives", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Appointments)"],
      schedules: [{ eventId: "b_arrive", dist: "Schedule", distParams: {
        rows: [
          { time: 0,   attrs: { severity: 3, type: "Routine" } },
          { time: 15,  attrs: { severity: 1, type: "Urgent"  } },
          { time: 30,  attrs: { severity: 2, type: "Routine" } },
          { time: 45,  attrs: { severity: 3, type: "Routine" } },
          { time: 60,  attrs: { severity: 1, type: "Urgent"  } },
          { time: 75,  attrs: { severity: 2, type: "Routine" } },
          { time: 90,  attrs: { severity: 3, type: "Routine" } },
          { time: 105, attrs: { severity: 1, type: "Urgent"  } },
          { time: 120, attrs: { severity: 2, type: "Routine" } },
          { time: 135, attrs: { severity: 3, type: "Routine" } },
          { time: 150, attrs: { severity: 1, type: "Urgent"  } },
          { time: 165, attrs: { severity: 2, type: "Routine" } },
          { time: 180, attrs: { severity: 3, type: "Routine" } },
          { time: 195, attrs: { severity: 1, type: "Urgent"  } },
          { time: 210, attrs: { severity: 2, type: "Routine" } },
        ],
      }}]},
    { id: "b_assess_done", name: "Assessment Done", scheduledTime: "9999",
      effect: ["RELEASE(Clinician)"],
      routing: [
        { condition: { variable: "Entity.severity", operator: "<=", value: 2 }, queueName: "Urgent Care" },
      ],
      defaultQueueName: "Standard Care",
      schedules: [] },
    { id: "b_urgent_done",   name: "Urgent Care Complete",   scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
    { id: "b_standard_done", name: "Standard Care Complete", scheduledTime: "9999", effect: ["COMPLETE()"], schedules: [] },
  ],
  cEvents: [
    { id: "c_assess", name: "Assess", priority: 1,
      condition: "queue(Appointments).length > 0 AND idle(Clinician).count > 0",
      effect: ["ASSIGN(Appointments, Clinician)"],
      cSchedules: [{ eventId: "b_assess_done", dist: "Fixed", distParams: { value: "5" }, useEntityCtx: true }] },
    { id: "c_urgent", name: "Treat Urgent", priority: 2,
      condition: "queue(Urgent Care).length > 0 AND idle(Clinician).count > 0",
      effect: ["ASSIGN(Urgent Care, Clinician)"],
      cSchedules: [
        { eventId: "b_urgent_done", dist: "Fixed", distParams: { value: "8"  }, when: { variable: "Entity.severity", operator: "==", value: 1 }, useEntityCtx: true },
        { eventId: "b_urgent_done", dist: "Fixed", distParams: { value: "15" }, useEntityCtx: true },
      ] },
    { id: "c_standard", name: "Treat Standard", priority: 3,
      condition: "queue(Standard Care).length > 0 AND idle(Clinician).count > 0",
      effect: ["ASSIGN(Standard Care, Clinician)"],
      cSchedules: [{ eventId: "b_standard_done", dist: "Exponential", distParams: { mean: "25" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_appts",    name: "Appointments",  customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_urgent",   name: "Urgent Care",   customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_standard", name: "Standard Care", customerType: "Patient", capacity: "", discipline: "FIFO" },
  ],
};

// ── Transport / Live Plan ─────────────────────────────────────────────────────
// TfL real-time arrivals feed → scheduleFeed plan injection.
// Each scheduled train at King's Cross St. Pancras becomes one entity
// (the alighting passenger cohort). No auth needed; TfL API is CORS-open.
// Set epoch to the current datetime before running for live alignment.

const TFL_STATION_PLAN = {
  name: "London Underground — Live Train Plan (TfL)",
  description: "Station crowd-flow model for King's Cross St. Pancras. Each scheduled train (Victoria & Northern lines) from the TfL live arrivals API becomes a 'Train' entity representing its alighting passenger cohort. Cohorts flow through Platform Supervisors then Ticket Barriers. Set epoch to the current datetime to align ISO arrival times; the Exponential(4 min) fallback runs without any setup.",
  domain: "Transport",
  templateMeta: {
    scenarioType: "Real-time plan injection — station crowd flow and barrier capacity",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Update epoch to the current datetime (ISO 8601, e.g. 2026-05-24T14:00:00) before running live. TfL data covers the next ~30 min; maxSimTime 45 captures all trains and their processing. Fallback when TfL unavailable: Exponential(4 min) between trains. 2 supervisors (platform, 1–3 min), 6 barriers (0.5–2 min).",
    limitations: "Each Train entity represents a whole passenger cohort, not individual passengers. TfL returns a rolling ~30-min prediction window — re-run to refresh the forecast. No CORS proxy required; api.tfl.gov.uk supports cross-origin browser requests. Change the StopPoint ID in dataSources.url for a different station.",
  },
  epoch: "2026-05-24T14:00:00",   // ← update to current datetime before running live
  timeUnit: "minutes",
  entityTypes: [
    { id: "et_train",      name: "Train",      role: "customer", count: 0, attrDefs: [
      { name: "line", valueType: "string", defaultValue: "Unknown", mutable: false },
    ]},
    { id: "et_supervisor", name: "Supervisor", role: "server",   count: 2, attrDefs: [] },
    { id: "et_barrier",    name: "Barrier",    role: "server",   count: 6, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: "b_train_arrive",
      name: "Train Arrives",
      scheduledTime: "0",
      effect: ["ARRIVE(Train, Platform)"],
      // No static rows — dist is the offline fallback.
      // When liveDataMode fires, prefetchScheduleFeeds injects TfL rows and
      // flips dist to "Schedule" so every planned arrival fires in order.
      schedules: [{
        eventId: "b_train_arrive",
        dist: "Exponential",
        distParams: { mean: "4" },
      }],
    },
    {
      id: "b_platform_clear",
      name: "Platform Cleared",
      scheduledTime: "9999",
      effect: ["RELEASE(Supervisor, Barrier Queue)"],
      schedules: [],
    },
    {
      id: "b_exit_done",
      name: "Cohort Exits",
      scheduledTime: "9999",
      effect: ["COMPLETE()"],
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: "c_clear_platform",
      name: "Clear Platform",
      priority: 1,
      condition: "queue(Platform).length > 0 AND idle(Supervisor).count > 0",
      effect: ["ASSIGN(Platform, Supervisor)"],
      cSchedules: [{
        eventId: "b_platform_clear",
        dist: "Uniform",
        distParams: { min: "1", max: "3" },
        useEntityCtx: true,
      }],
    },
    {
      id: "c_process_barrier",
      name: "Process Barrier",
      priority: 2,
      condition: "queue(Barrier Queue).length > 0 AND idle(Barrier).count > 0",
      effect: ["ASSIGN(Barrier Queue, Barrier)"],
      cSchedules: [{
        eventId: "b_exit_done",
        dist: "Uniform",
        distParams: { min: "0.5", max: "2" },
        useEntityCtx: true,
      }],
    },
  ],
  queues: [
    { id: "q_platform", name: "Platform",     customerType: "Train", capacity: "", discipline: "FIFO" },
    { id: "q_barrier",  name: "Barrier Queue", customerType: "Train", capacity: "", discipline: "FIFO" },
  ],
  goals: [
    { metric: "summary.avgWait",    operator: "<",  target: 3, label: "Mean platform wait < 3 min" },
    { metric: "summary.avgSojourn", operator: "<",  target: 8, label: "Mean total exit time < 8 min" },
  ],
  containerTypes: [],
  dataSources: [{
    id: "ds_tfl",
    label: "TfL Arrivals — King's Cross St. Pancras",
    type: "scheduleFeed",
    url: "https://api.tfl.gov.uk/StopPoint/940GZZLUKSKX/Arrivals",
    entityType: "Train",
    targetBEventId: "b_train_arrive",
    timeField: "expectedArrival",
    attrMap: {
      lineName: "line",
      vehicleId: "entityId",
    },
  }],
  experimentDefaults: {
    maxSimTime: 45,
    warmupPeriod: 0,
    replications: 5,
    liveDataMode: "calibrated_batch",
  },
};

// ── Aviation / Live Data ──────────────────────────────────────────────────────
// First real-time template: uses OpenSky Network adapter to feed live aircraft
// inter-arrival times. experimentDefaults.liveDataMode "calibrated_batch" tells
// the engine to prefetch the OpenSky data once before each run begins.

const PLANE_ARRIVALS_LIVE = {
  name: "Airport Arrivals — Live (OpenSky)",
  description: "Real-time aircraft arrival and ground-handling model. Arrival inter-arrival times are pulled live from the OpenSky Network for the configured airport (default: London Heathrow, EGLL). Gate controllers assign stands (2–8 min), then ground crews perform turnaround (25–90 min). Run in calibrated_batch mode to use actual traffic data; falls back to 3.5 min mean if the API is unreachable.",
  domain: "Transport",
  templateMeta: {
    scenarioType: "Real-time two-stage arrival and ground handling with OpenSky live data",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Live interArrivalMean from OpenSky (fallback 3.5 min ≈ 17 arr/hr). Gate assignment Uniform(2,8) min. Turnaround Triangular(25,45,90) min. Change airportIcao in dataSources to any of: EGLL, KJFK, KLAX, KORD, EDDF, RJTT, YSSY, LFPG.",
    limitations: "Uses OpenSky public API (unauthenticated, rate-limited). No aircraft-type differentiation, slot system, or runway capacity constraint. Turnaround time is synthetic — not sourced from live data. interArrivalMean updates only after ≥2 arrivals are detected; allow a few minutes for the adapter to warm up.",
  },
  entityTypes: [
    { id: "et_aircraft",  name: "Aircraft",        role: "customer", count: 0, attrDefs: [] },
    { id: "et_gate_ctrl", name: "Gate Controller", role: "server",   count: 3, attrDefs: [] },
    { id: "et_gnd_crew",  name: "Ground Crew",     role: "server",   count: 5, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    {
      id: "b_arrive",
      name: "Aircraft Arrives",
      scheduledTime: "0",
      effect: ["ARRIVE(Aircraft, Holding Stack)"],
      schedules: [{
        eventId: "b_arrive",
        dist: "Exponential",
        distParams: { mean: "3.5" },
        paramSource: {
          sourceId: "ds_opensky",
          field: "interArrivalMean",
          targetParam: "mean",
          fallback: "3.5",
        },
      }],
    },
    {
      id: "b_gate_done",
      name: "Gate Assigned",
      scheduledTime: "9999",
      effect: ["RELEASE(Gate Controller, Turnaround Bay)"],
      schedules: [],
    },
    {
      id: "b_turnaround_done",
      name: "Turnaround Complete",
      scheduledTime: "9999",
      effect: ["COMPLETE()"],
      schedules: [],
    },
  ],
  cEvents: [
    {
      id: "c_assign_gate",
      name: "Assign Gate",
      priority: 1,
      condition: "queue(Holding Stack).length > 0 AND idle(Gate Controller).count > 0",
      effect: ["ASSIGN(Holding Stack, Gate Controller)"],
      cSchedules: [{
        eventId: "b_gate_done",
        dist: "Uniform",
        distParams: { min: "2", max: "8" },
        useEntityCtx: true,
      }],
    },
    {
      id: "c_turnaround",
      name: "Turn Around",
      priority: 2,
      condition: "queue(Turnaround Bay).length > 0 AND idle(Ground Crew).count > 0",
      effect: ["ASSIGN(Turnaround Bay, Ground Crew)"],
      cSchedules: [{
        eventId: "b_turnaround_done",
        dist: "Triangular",
        distParams: { min: "25", mode: "45", max: "90" },
        useEntityCtx: true,
      }],
    },
  ],
  queues: [
    { id: "q_holding",    name: "Holding Stack",  customerType: "Aircraft", capacity: "", discipline: "FIFO" },
    { id: "q_turnaround", name: "Turnaround Bay", customerType: "Aircraft", capacity: "", discipline: "FIFO" },
  ],
  goals: [
    { metric: "summary.avgSojourn", operator: "<=", target: 90, label: "Mean sojourn ≤ 90 min (gate assignment + turnaround)" },
    { metric: "summary.avgWait",    operator: "<",  target: 15, label: "Mean holding wait < 15 min" },
  ],
  containerTypes: [],
  dataSources: [{
    id: "ds_opensky",
    label: "OpenSky Network — Live Arrivals",
    type: "openSky",
    url: "https://opensky-network.org/api/states/all",
    airportIcao: "EGLL",
    radiusNm: 50,
    refreshSecs: 30,
  }],
  experimentDefaults: {
    maxSimTime: 480,
    warmupPeriod: 60,
    replications: 5,
    liveDataMode: "calibrated_batch",
  },
};

const AE_FULL_DEPARTMENT = {
  name: "A&E Full Department",
  description: "Generic large urban A&E department over a 24-hour period. Three arrival streams (walk-in, ambulance, GP referral) are triaged and streamed into Minors, Majors, or Resus pathways. Majors and Resus patients proceed through doctor consultation, investigations (70–90% probability), observation, and a discharge decision. Minors receive fast-track consultation and are discharged directly. Day/night shift staffing changes at 08:00 and 22:00. NHS 4-hour target goal included.",
  domain: "Healthcare",
  timeUnit: "minutes",
  templateMeta: {
    scenarioType: "Multi-pathway A&E with shift schedules, probabilistic routing, and 24-hour demand profile",
    keyMacros: ["ARRIVE", "ASSIGN", "RELEASE", "COMPLETE"],
    paramGuide: "Peak arrival ~9 Majors/hr + 2.3 Resus/hr + 8.6 Minors/hr. Assessment Nurse 15 night / 30 day. A&E Doctor 5 night / 10 day. Triage Nurse 2 night / 3 day. Resus Doctor 2 (constant).",
    limitations: "Assessment Nurse uses exclusive ASSIGN — models active nursing intervention, not passive monitoring. Priority starvation: investigations (priority 6-7) are served before observations (priority 8-9) when nurses are scarce.",
  },
  entityTypes: [
    { id: "et_patient", name: "Patient", role: "customer", count: 0,
      attrDefs: [{ name: "acuity", mutable: false, valueType: "string", defaultValue: "majors" }] },
    { id: "et_triage_nurse", name: "Triage Nurse", role: "server", count: 2, attrDefs: [],
      shiftSchedule: [{ time: 0, capacity: 2 }, { time: 480, capacity: 3 }, { time: 1320, capacity: 2 }] },
    { id: "et_ae_doctor", name: "A&E Doctor", role: "server", count: 5, attrDefs: [],
      shiftSchedule: [{ time: 0, capacity: 5 }, { time: 480, capacity: 10 }, { time: 1320, capacity: 5 }] },
    { id: "et_assessment_nurse", name: "Assessment Nurse", role: "server", count: 15, attrDefs: [],
      shiftSchedule: [{ time: 0, capacity: 15 }, { time: 480, capacity: 30 }, { time: 1320, capacity: 15 }] },
    { id: "et_resus_doctor", name: "Resus Doctor", role: "server", count: 2, attrDefs: [] },
  ],
  stateVariables: [],
  bEvents: [
    { id: "b_arrive_walkin_minors", name: "Walk-in Arrival (Minors)", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Triage Queue)"],
      schedules: [{ dist: "Piecewise", eventId: "b_arrive_walkin_minors", distParams: { periods: [
        { dist: "Exponential", startTime: "0",    distParams: { mean: "20" } },
        { dist: "Exponential", startTime: "480",  distParams: { mean: "10" } },
        { dist: "Exponential", startTime: "720",  distParams: { mean: "7"  } },
        { dist: "Exponential", startTime: "960",  distParams: { mean: "12" } },
        { dist: "Exponential", startTime: "1200", distParams: { mean: "18" } },
      ]}}] },
    { id: "b_arrive_walkin_majors", name: "Walk-in Arrival (Majors)", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Triage Queue)"],
      schedules: [{ dist: "Piecewise", eventId: "b_arrive_walkin_majors", distParams: { periods: [
        { dist: "Exponential", startTime: "0",    distParams: { mean: "40" } },
        { dist: "Exponential", startTime: "480",  distParams: { mean: "20" } },
        { dist: "Exponential", startTime: "720",  distParams: { mean: "14" } },
        { dist: "Exponential", startTime: "960",  distParams: { mean: "24" } },
        { dist: "Exponential", startTime: "1200", distParams: { mean: "36" } },
      ]}}] },
    { id: "b_arrive_walkin_resus", name: "Walk-in Arrival (Resus)", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Triage Queue)"],
      schedules: [{ dist: "Piecewise", eventId: "b_arrive_walkin_resus", distParams: { periods: [
        { dist: "Exponential", startTime: "0",    distParams: { mean: "120" } },
        { dist: "Exponential", startTime: "480",  distParams: { mean: "60"  } },
        { dist: "Exponential", startTime: "720",  distParams: { mean: "42"  } },
        { dist: "Exponential", startTime: "960",  distParams: { mean: "72"  } },
        { dist: "Exponential", startTime: "1200", distParams: { mean: "108" } },
      ]}}] },
    { id: "b_arrive_amb_majors", name: "Ambulance Arrival (Majors)", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Triage Queue)"],
      schedules: [{ dist: "Exponential", eventId: "b_arrive_amb_majors", distParams: { mean: "22" } }] },
    { id: "b_arrive_amb_resus", name: "Ambulance Arrival (Resus)", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Triage Queue)"],
      schedules: [{ dist: "Exponential", eventId: "b_arrive_amb_resus", distParams: { mean: "66" } }] },
    { id: "b_arrive_gp_majors", name: "GP Referral Arrival (Majors)", scheduledTime: "0",
      effect: ["ARRIVE(Patient, Triage Queue)"],
      schedules: [{ dist: "Piecewise", eventId: "b_arrive_gp_majors", distParams: { periods: [
        { dist: "Exponential", startTime: "0",    distParams: { mean: "9999" } },
        { dist: "Exponential", startTime: "480",  distParams: { mean: "30"   } },
        { dist: "Exponential", startTime: "1080", distParams: { mean: "9999" } },
      ]}}] },
    { id: "b_triage_done", name: "Triage Complete", scheduledTime: "9999",
      effect: ["RELEASE(Triage Nurse)"], schedules: [],
      probabilisticRouting: [
        { queueName: "Minors Waiting", probability: 0.3 },
        { queueName: "Majors Waiting", probability: 0.6 },
        { queueName: "Resus Waiting",  probability: 0.1 },
      ] },
    { id: "b_minors_done", name: "Minors Consultation Done", scheduledTime: "9999",
      effect: ["COMPLETE()"], schedules: [] },
    { id: "b_majors_consult_done", name: "Majors Consultation Done", scheduledTime: "9999",
      effect: ["RELEASE(A&E Doctor)"], schedules: [],
      probabilisticRouting: [
        { queueName: "Majors Investigations", probability: 0.7 },
        { queueName: "Majors Observation",    probability: 0.3 },
      ] },
    { id: "b_resus_consult_done", name: "Resus Consultation Done", scheduledTime: "9999",
      effect: ["RELEASE(Resus Doctor)"], schedules: [],
      probabilisticRouting: [
        { queueName: "Resus Investigations", probability: 0.9 },
        { queueName: "Resus Observation",    probability: 0.1 },
      ] },
    { id: "b_majors_inv_done", name: "Majors Investigations Done", scheduledTime: "9999",
      effect: ["RELEASE(Assessment Nurse, Majors Observation)"], schedules: [] },
    { id: "b_resus_inv_done", name: "Resus Investigations Done", scheduledTime: "9999",
      effect: ["RELEASE(Assessment Nurse, Resus Observation)"], schedules: [] },
    { id: "b_majors_obs_done", name: "Majors Observation Done", scheduledTime: "9999",
      effect: ["RELEASE(Assessment Nurse, Discharge Decision Queue)"], schedules: [] },
    { id: "b_resus_obs_done", name: "Resus Observation Done", scheduledTime: "9999",
      effect: ["RELEASE(Assessment Nurse, Discharge Decision Queue)"], schedules: [] },
    { id: "b_discharge_done", name: "Discharge Decision Made", scheduledTime: "9999",
      effect: ["COMPLETE()", "RELEASE(A&E Doctor)"], schedules: [] },
  ],
  cEvents: [
    { id: "c_start_discharge", name: "Start Discharge Decision", priority: 1,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Discharge Decision Queue).length", operator: ">", value: 0 },
        { variable: "idle(A&E Doctor).count",                 operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Discharge Decision Queue, A&E Doctor)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_discharge_done", distParams: { min: "5", mode: "10", max: "20" }, useEntityCtx: true }] },
    { id: "c_start_triage", name: "Start Triage", priority: 2,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Triage Queue).length", operator: ">", value: 0 },
        { variable: "idle(Triage Nurse).count",   operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Triage Queue, Triage Nurse)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_triage_done", distParams: { min: "2", mode: "5", max: "10" }, useEntityCtx: true }] },
    { id: "c_start_minors", name: "Start Minors Consultation", priority: 3,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Minors Waiting).length", operator: ">", value: 0 },
        { variable: "idle(A&E Doctor).count",        operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Minors Waiting, A&E Doctor)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_minors_done", distParams: { min: "8", mode: "15", max: "30" }, useEntityCtx: true }] },
    { id: "c_start_majors_consult", name: "Start Majors Consultation", priority: 4,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Majors Waiting).length", operator: ">", value: 0 },
        { variable: "idle(A&E Doctor).count",        operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Majors Waiting, A&E Doctor)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_majors_consult_done", distParams: { min: "10", mode: "20", max: "45" }, useEntityCtx: true }] },
    { id: "c_start_resus_consult", name: "Start Resus Consultation", priority: 5,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Resus Waiting).length", operator: ">", value: 0 },
        { variable: "idle(Resus Doctor).count",     operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Resus Waiting, Resus Doctor)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_resus_consult_done", distParams: { min: "15", mode: "30", max: "60" }, useEntityCtx: true }] },
    { id: "c_start_majors_inv", name: "Start Majors Investigations", priority: 6,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Majors Investigations).length", operator: ">", value: 0 },
        { variable: "idle(Assessment Nurse).count",         operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Majors Investigations, Assessment Nurse)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_majors_inv_done", distParams: { min: "20", mode: "45", max: "90" }, useEntityCtx: true }] },
    { id: "c_start_resus_inv", name: "Start Resus Investigations", priority: 7,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Resus Investigations).length", operator: ">", value: 0 },
        { variable: "idle(Assessment Nurse).count",        operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Resus Investigations, Assessment Nurse)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_resus_inv_done", distParams: { min: "20", mode: "45", max: "90" }, useEntityCtx: true }] },
    { id: "c_start_majors_obs", name: "Start Majors Observation", priority: 8,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Majors Observation).length", operator: ">", value: 0 },
        { variable: "idle(Assessment Nurse).count",      operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Majors Observation, Assessment Nurse)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_majors_obs_done", distParams: { min: "30", mode: "90", max: "180" }, useEntityCtx: true }] },
    { id: "c_start_resus_obs", name: "Start Resus Observation", priority: 9,
      condition: { operator: "AND", clauses: [
        { variable: "queue(Resus Observation).length", operator: ">", value: 0 },
        { variable: "idle(Assessment Nurse).count",     operator: ">", value: 0 },
      ]},
      effect: ["ASSIGN(Resus Observation, Assessment Nurse)"],
      cSchedules: [{ dist: "Triangular", eventId: "b_resus_obs_done", distParams: { min: "60", mode: "120", max: "240" }, useEntityCtx: true }] },
  ],
  queues: [
    { id: "q_triage",    name: "Triage Queue",           customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_minors",    name: "Minors Waiting",          customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_majors",    name: "Majors Waiting",          customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_resus",     name: "Resus Waiting",           customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_majors_inv", name: "Majors Investigations",  customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_resus_inv",  name: "Resus Investigations",   customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_majors_obs", name: "Majors Observation",     customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_resus_obs",  name: "Resus Observation",      customerType: "Patient", capacity: "", discipline: "FIFO" },
    { id: "q_discharge",  name: "Discharge Decision Queue", customerType: "Patient", capacity: "", discipline: "FIFO" },
  ],
  goals: [
    { label: "Average total A&E time ≤ 4 hours (NHS target)", metric: "summary.avgTimeInSystem", target: 240, operator: "<=" },
    { label: "Average triage wait ≤ 15 minutes", scope: { id: "q_triage", name: "Triage Queue", type: "queue" }, metric: "summary.avgWait", target: 15, operator: "<=" },
  ],
  sections: [
    { id: "sec_arrival",  name: "Arrivals",            color: "#4A90D9",
      memberIds: ["b_arrive_walkin_minors","b_arrive_walkin_majors","b_arrive_walkin_resus","b_arrive_amb_majors","b_arrive_amb_resus","b_arrive_gp_majors","q_triage","et_triage_nurse","c_start_triage","b_triage_done"],
      entryQueues: ["q_triage"], exitQueues: ["q_minors","q_majors","q_resus"] },
    { id: "sec_minors",   name: "Minors (Fast-Track)", color: "#27AE60",
      memberIds: ["q_minors","c_start_minors","b_minors_done"],
      entryQueues: ["q_minors"], exitQueues: [] },
    { id: "sec_majors",   name: "Majors",              color: "#E67E22",
      memberIds: ["q_majors","c_start_majors_consult","b_majors_consult_done","q_majors_inv","c_start_majors_inv","b_majors_inv_done","q_majors_obs","c_start_majors_obs","b_majors_obs_done"],
      entryQueues: ["q_majors"], exitQueues: ["q_discharge"] },
    { id: "sec_resus",    name: "Resus",               color: "#E74C3C",
      memberIds: ["q_resus","et_resus_doctor","c_start_resus_consult","b_resus_consult_done","q_resus_inv","c_start_resus_inv","b_resus_inv_done","q_resus_obs","c_start_resus_obs","b_resus_obs_done"],
      entryQueues: ["q_resus"], exitQueues: ["q_discharge"] },
    { id: "sec_discharge", name: "Discharge / Admit",  color: "#8E44AD",
      memberIds: ["q_discharge","et_ae_doctor","et_assessment_nurse","c_start_discharge","b_discharge_done"],
      entryQueues: ["q_discharge"], exitQueues: [] },
  ],
  experimentDefaults: { maxSimTime: 1440, warmupPeriod: 120, replications: 3, terminationMode: "time" },
};

export const TEMPLATES = [
  // Academic
  { id: "mm1",             ...MM1 },
  // Healthcare
  { id: "er-triage",       ...ER_TRIAGE },
  { id: "outpatient-clinic", ...OUTPATIENT_CLINIC },
  { id: "ward-admission",  ...WARD_ADMISSION },
  { id: "surgical-suite",  ...SURGICAL_SUITE },
  { id: "appointment-clinic", ...APPOINTMENT_CLINIC },
  { id: "ae-full-department", ...AE_FULL_DEPARTMENT },
  // Service Systems
  { id: "call-center",     ...CALL_CENTER },
  { id: "fast-food",       ...FAST_FOOD },
  { id: "airport",         ...AIRPORT },
  { id: "bank-branch",     ...BANK_BRANCH },
  { id: "retail-checkout", ...RETAIL_CHECKOUT },
  // Manufacturing
  { id: "factory",         ...FACTORY },
  { id: "construction",    ...CONSTRUCTION },
  { id: "warehouse",       ...WAREHOUSE },
  { id: "order-fulfillment", ...ORDER_FULFILLMENT },
  // Logistics
  { id: "port-berth",      ...PORT_BERTH },
  // Technology
  { id: "data-center",     ...DATA_CENTER },
  // Capability showcases (Sprint 41-45)
  { id: "machine-shop-failures",  ...MACHINE_SHOP_FAILURES },
  { id: "priority-ed-balking",    ...PRIORITY_ED_BALKING },
  { id: "cost-call-centre",       ...COST_CALL_CENTRE },
  // Transport / Live Plan
  { id: "tfl-station-plan",       ...TFL_STATION_PLAN },
  // Aviation / Live Data
  { id: "plane-arrivals-live",    ...PLANE_ARRIVALS_LIVE },
];
