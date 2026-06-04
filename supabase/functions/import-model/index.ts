import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_JSON_KEYS = [
  "entityTypes", "stateVariables", "bEvents", "cEvents",
  "queues", "graph", "experimentDefaults", "goals", "containerTypes",
];

type ModelRecord = Record<string, unknown>;

function normalizeModel(payload: ModelRecord, nameOverride?: string): ModelRecord {
  const source: ModelRecord =
    payload.model_json && typeof payload.model_json === "object" && !Array.isArray(payload.model_json)
      ? (payload.model_json as ModelRecord)
      : payload;
  const baseName = String(
    nameOverride || payload.name || source.name || "Imported model"
  ).trim() || "Imported model";
  const model: ModelRecord = {
    name: nameOverride || `${baseName} (Imported)`,
    description: String(payload.description || source.description || ""),
    visibility: "private",
    access: {},
  };
  for (const key of MODEL_JSON_KEYS) {
    if (key === "graph" || key === "experimentDefaults") {
      model[key] =
        source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
          ? source[key]
          : key === "graph" ? null : {};
    } else {
      model[key] = Array.isArray(source[key]) ? source[key] : [];
    }
  }
  // Scalar settings stored only in model_json
  if (source.timeUnit) model.timeUnit = source.timeUnit;
  if (source.epoch)    model.epoch    = source.epoch;
  if (Array.isArray(source.dataSources)) model.dataSources = source.dataSources;
  if (Array.isArray(source.sections))    model.sections    = source.sections;
  return model;
}

function effectText(effect: unknown): string {
  if (Array.isArray(effect)) return effect.map(effectText).filter(Boolean).join(";");
  if (effect && typeof effect === "object") {
    const e = effect as ModelRecord;
    if (typeof e.effect === "string") return e.effect;
    const macro = String(e.macro || e.type || e.name || "").trim();
    if (!macro) return "";
    const args = Array.isArray(e.args)
      ? e.args
      : [e.entityType || e.customerType || e.queue || e.resourceType || e.serverType,
         e.serverType || e.resourceType].filter(Boolean);
    return `${macro}(${args.join(",")})`;
  }
  return String(effect || "");
}

function validateModel(model: ModelRecord): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (code: string, msg: string) => errors.push(`[${code}] ${msg}`);
  const warn = (code: string, msg: string) => warnings.push(`[${code}] ${msg}`);

  const entityTypes = (model.entityTypes as ModelRecord[]) || [];
  const bEvents     = (model.bEvents as ModelRecord[]) || [];
  const cEvents     = (model.cEvents as ModelRecord[]) || [];
  const queues      = (model.queues as ModelRecord[]) || [];

  // V1: Entity names unique and non-empty
  const seen = new Set<string>();
  entityTypes.forEach((et, i) => {
    const name = String(et.name || "").trim();
    if (!name) {
      err("V1", `Entity class at position ${i + 1} has an empty name.`);
    } else if (seen.has(name)) {
      err("V1", `Duplicate entity class name: '${name}'.`);
    } else {
      seen.add(name);
    }
  });

  // V2: Attribute names unique within entity class
  entityTypes.forEach(et => {
    const attrSeen = new Set<string>();
    ((et.attrDefs as ModelRecord[]) || []).forEach(a => {
      const name = String(a.name || "").trim();
      if (!name) return;
      if (attrSeen.has(name)) {
        err("V2", `Duplicate attribute '${name}' in entity class '${et.name || "?"}'.`);
      }
      attrSeen.add(name);
    });
  });

  const queueNamesLower = new Set<string>(
    queues.map(q => String(q.name || "").trim().toLowerCase()).filter(Boolean)
  );

  // V3: defaultValue must match declared valueType
  entityTypes.forEach(et => {
    ((et.attrDefs as ModelRecord[]) || []).forEach(a => {
      if (a.defaultValue === undefined || a.defaultValue === "") return;
      const val = a.defaultValue;
      if (a.valueType === "number") {
        if (isNaN(parseFloat(String(val))) || !isFinite(Number(val))) {
          err("V3", `Attribute '${a.name || "?"}' in '${et.name || "?"}': default value '${val}' is not a valid number.`);
        }
      } else if (a.valueType === "boolean") {
        if (val !== "true" && val !== "false") {
          err("V3", `Attribute '${a.name || "?"}' in '${et.name || "?"}': default value '${val}' is not 'true' or 'false'.`);
        }
      }
    });
  });

  // V4: PRIORITY queue requires a numeric priority attribute
  queues.forEach(q => {
    if (String(q.discipline || "FIFO").toUpperCase() !== "PRIORITY") return;
    const ct = entityTypes.find(et =>
      String(et.name || "").trim().toLowerCase() === String(q.customerType || "").trim().toLowerCase()
    );
    if (!ct) {
      err("V4", `Queue '${q.name}' uses PRIORITY discipline but entity class '${q.customerType || "?"}' was not found.`);
    } else {
      const priorityAttr = ((ct.attrDefs as ModelRecord[]) || []).find(a =>
        String(a.name || "").trim().toLowerCase() === "priority"
      );
      if (!priorityAttr) {
        err("V4", `Queue '${q.name}' uses PRIORITY discipline but entity class '${ct.name}' has no 'priority' attribute.`);
      } else if (priorityAttr.valueType !== "number") {
        err("V4", `Queue '${q.name}' uses PRIORITY discipline but entity class '${ct.name}' must define 'priority' as a number.`);
      }
    }
  });

  // V8: Must have at least one arrival source
  const hasArrive = bEvents.some(b => /ARRIVE\s*\(/i.test(effectText(b.effect)));
  const hasSink   = bEvents.some(b => {
    const t = effectText(b.effect);
    return /COMPLETE\s*\(/i.test(t) || /RENEGE\s*\(/i.test(t);
  });

  if (!hasArrive && !hasSink) {
    err("V8", "No arrival source and no sink: add an ARRIVE(Type) effect and a COMPLETE() or RENEGE() effect.");
  } else if (!hasArrive) {
    warn("V8", "No B-Event with an ARRIVE(Type) effect — the simulation will have no entity arrivals.");
  } else if (!hasSink) {
    warn("V8", "No B-Event with a COMPLETE() or RENEGE() effect — entities may never leave the system.");
  }

  // V9: C-Event conditions must reference defined queues
  cEvents.forEach(c => {
    if (!c.condition) return;
    const cond = String(c.condition || "");
    const queueRefs = [...cond.matchAll(/queue\(([^)]+)\)/gi)].map(m => m[1].trim().toLowerCase());
    queueRefs.forEach(ref => {
      if (!queueNamesLower.has(ref)) {
        err("V9", `C-Event '${c.name || c.id}' condition references unknown queue '${ref}'.`);
      }
    });
  });

  // V19: Server count must be integer >= 1
  entityTypes.forEach(et => {
    if (et.role !== "server") return;
    const raw = et.count;
    if (raw === undefined || raw === null || raw === "") return;
    const n = parseInt(String(raw), 10);
    if (!Number.isInteger(n) || n < 1) {
      err("V19", `Server type '${et.name || et.id}' count '${raw}' must be an integer >= 1.`);
    }
  });

  // V20: Queue capacity must be integer >= 1 when set
  queues.forEach(q => {
    if (q.capacity === undefined || q.capacity === null || q.capacity === "") return;
    const n = parseInt(String(q.capacity), 10);
    if (!Number.isInteger(n) || n < 1) {
      err("V20", `Queue '${q.name || q.id}' capacity '${q.capacity}' must be an integer >= 1.`);
    }
    if (q.overflowDestination != null) {
      const dest = String(q.overflowDestination).trim();
      if (dest && !queueNamesLower.has(dest.toLowerCase())) {
        err("V20", `Queue '${q.name || q.id}' overflowDestination '${dest}' does not match any defined queue.`);
      }
    }
  });

  // V20 cont: balk probability 0-1
  bEvents.forEach(b => {
    if (b.balkProbability == null) return;
    const p = parseFloat(String(b.balkProbability));
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      err("V21", `B-Event '${b.name || b.id}' balkProbability '${b.balkProbability}' must be between 0 and 1.`);
    }
  });

  // V5: Distribution parameter bounds
  function checkDistBounds(dist: string, params: ModelRecord, context: string) {
    const d = String(dist || "").trim();
    if (!d || d === "ServerAttr" || d === "EntityAttr" || d === "Piecewise") return;
    const p = params || {};
    switch (d) {
      case "Exponential": {
        const m = parseFloat(String(p.mean ?? ""));
        if (isNaN(m) || m <= 0) err("V5", `${context}: Exponential mean must be > 0 (got '${p.mean ?? ""}')`);
        break;
      }
      case "Uniform": {
        const lo = parseFloat(String(p.min ?? "")), hi = parseFloat(String(p.max ?? ""));
        if (isNaN(lo) || isNaN(hi)) err("V5", `${context}: Uniform requires numeric min and max.`);
        else if (hi <= lo) err("V5", `${context}: Uniform max (${hi}) must be > min (${lo}).`);
        break;
      }
      case "Normal": {
        const s = parseFloat(String(p.stddev ?? ""));
        if (isNaN(s) || s <= 0) err("V5", `${context}: Normal stddev must be > 0 (got '${p.stddev ?? ""}')`);
        break;
      }
      case "Triangular": {
        const a = parseFloat(String(p.min ?? "")), c = parseFloat(String(p.mode ?? "")), b = parseFloat(String(p.max ?? ""));
        if (isNaN(a) || isNaN(c) || isNaN(b)) err("V5", `${context}: Triangular requires numeric min, mode, and max.`);
        else if (!(a <= c && c <= b)) err("V5", `${context}: Triangular requires min ≤ mode ≤ max (got ${a}, ${c}, ${b}).`);
        break;
      }
      case "Fixed": {
        const v = parseFloat(String(p.value ?? ""));
        if (p.value === undefined || p.value === "" || isNaN(v)) err("V5", `${context}: Fixed requires a numeric value (got '${p.value ?? ""}')`);
        break;
      }
      case "Erlang": {
        const k = parseInt(String(p.k ?? ""), 10), m = parseFloat(String(p.mean ?? ""));
        if (isNaN(k) || k < 1) err("V5", `${context}: Erlang k must be a positive integer (got '${p.k ?? ""}')`);
        if (isNaN(m) || m <= 0) err("V5", `${context}: Erlang mean must be > 0 (got '${p.mean ?? ""}')`);
        break;
      }
    }
  }
  bEvents.forEach(b => {
    ((b.schedules as ModelRecord[]) || []).forEach((s, j) => {
      if (s.rows || s.times) return;
      if (s.dist) checkDistBounds(String(s.dist), (s.distParams as ModelRecord) || {}, `B-Event '${b.name || b.id}' schedule ${j + 1}`);
    });
  });
  cEvents.forEach(c => {
    ((c.cSchedules as ModelRecord[]) || []).forEach((s, j) => {
      if (s.dist) checkDistBounds(String(s.dist), (s.distParams as ModelRecord) || {}, `C-Event '${c.name || c.id}' schedule ${j + 1}`);
    });
  });

  // V10: Attribute names must not collide with built-in namespaces
  entityTypes.forEach(et => {
    ((et.attrDefs as ModelRecord[]) || []).forEach(a => {
      const name = String(a.name || "").trim();
      if (!name) return;
      if (/^(Resource|Queue)\b/i.test(name)) {
        err("V10", `Attribute '${name}' in entity class '${et.name || "?"}' conflicts with the built-in 'Resource' or 'Queue' namespace.`);
      }
    });
  });

  // V25: RENEGE() argument must be exactly 'ctx'
  const checkRenege = (events: ModelRecord[], prefix: string) => {
    events.forEach(ev => {
      const text = effectText(ev.effect);
      const m = text.match(/\bRENEGE\(\s*([^)]+)\s*\)/i);
      if (m && m[1].trim().toLowerCase() !== "ctx") {
        err("V25", `${prefix} '${ev.name || ev.id}' uses RENEGE('${m[1].trim()}') — must be RENEGE(ctx).`);
      }
    });
  };
  checkRenege(bEvents, "B-Event");
  checkRenege(cEvents, "C-Event");

  // V26: Container id/capacity/initialLevel validity
  const containerTypes = (model.containerTypes as ModelRecord[]) || [];
  const containerIds = new Set<string>();
  containerTypes.forEach((ct, i) => {
    const id = String(ct.id || "").trim();
    if (!id) {
      err("V26", `Container at position ${i + 1} has an empty id.`);
    } else if (containerIds.has(id.toLowerCase())) {
      err("V26", `Duplicate container id: '${id}'.`);
    } else {
      containerIds.add(id.toLowerCase());
    }
    const cap = parseFloat(String(ct.capacity ?? ""));
    if (!isNaN(cap) && cap <= 0) err("V26", `Container '${id || i + 1}': capacity must be > 0.`);
    const init = parseFloat(String(ct.initialLevel ?? ""));
    if (!isNaN(init)) {
      if (init < 0) err("V26", `Container '${id || i + 1}': initialLevel must be >= 0.`);
      if (!isNaN(cap) && cap > 0 && init > cap) err("V26", `Container '${id || i + 1}': initialLevel (${init}) exceeds capacity (${cap}).`);
    }
  });

  // V27: FILL/DRAIN must reference a declared container
  const checkContainerRefs = (events: ModelRecord[], prefix: string) => {
    events.forEach(ev => {
      const text = effectText(ev.effect);
      const hits = text.match(/\b(FILL|DRAIN)\([^)]+\)/gi) || [];
      hits.forEach(hit => {
        const inner = hit.match(/\b(FILL|DRAIN)\(([^,)]+)/i);
        if (!inner) return;
        const name = inner[2].trim();
        if (!containerIds.has(name.toLowerCase())) {
          err("V27", `${prefix} '${ev.name || ev.id}' ${inner[1].toUpperCase()} references undeclared container '${name}'.`);
        }
      });
    });
  };
  checkContainerRefs(bEvents, "B-Event");
  checkContainerRefs(cEvents, "C-Event");

  // V28: epoch must be a valid ISO 8601 datetime when set
  if (model.epoch != null && model.epoch !== "") {
    const d = new Date(String(model.epoch));
    if (isNaN(d.getTime())) {
      err("V28", `Model epoch '${model.epoch}' is not a valid ISO 8601 datetime.`);
    }
  }

  return { errors, warnings };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")              ?? "";
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey      = Deno.env.get("SUPABASE_ANON_KEY")         ?? "";

  // Auth: extract and verify JWT
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(
      JSON.stringify({ ok: false, errors: ["Authentication required."] }),
      { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ ok: false, errors: ["Invalid or expired authentication token."] }),
      { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let body: ModelRecord;
  try {
    body = await request.json() as ModelRecord;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, errors: ["Request body is not valid JSON."] }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  if (!body.model || typeof body.model !== "object" || Array.isArray(body.model)) {
    return new Response(
      JSON.stringify({ ok: false, errors: ["Request must include a 'model' object."] }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const nameOverride = body.name ? String(body.name).trim() : undefined;
  const model = normalizeModel(body.model as ModelRecord, nameOverride);
  const { errors, warnings } = validateModel(model);

  if (errors.length > 0) {
    return new Response(
      JSON.stringify({ ok: false, errors, warnings }),
      { status: 422, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, serviceKey);
  const row = {
    name:            model.name,
    description:     model.description     || "",
    visibility:      "private",
    access:          {},
    entity_types:    model.entityTypes     || [],
    state_variables: model.stateVariables  || [],
    b_events:        model.bEvents         || [],
    c_events:        model.cEvents         || [],
    queues:          model.queues          || [],
    goals:           model.goals           || [],
    model_json: {
      schemaVersion:      1,
      entityTypes:        model.entityTypes        || [],
      stateVariables:     model.stateVariables     || [],
      bEvents:            model.bEvents            || [],
      cEvents:            model.cEvents            || [],
      queues:             model.queues             || [],
      containerTypes:     model.containerTypes     || [],
      graph:              model.graph              || null,
      experimentDefaults: model.experimentDefaults || {},
      goals:              model.goals              || [],
      timeUnit:           model.timeUnit           || "minutes",
      epoch:              model.epoch              || null,
      ...(Array.isArray(model.dataSources) && model.dataSources.length ? { dataSources: model.dataSources } : {}),
      ...(Array.isArray(model.sections)    && model.sections.length    ? { sections:    model.sections }    : {}),
    },
    owner_id: user.id,
  };

  const { data, error: dbError } = await adminClient
    .from("des_models")
    .insert(row)
    .select("id")
    .single();

  if (dbError) {
    return new Response(
      JSON.stringify({ ok: false, errors: [`Database error: ${dbError.message}`] }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, modelId: (data as { id: string }).id, warnings }),
    { status: 201, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
