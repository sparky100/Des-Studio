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

  // V4: PRIORITY queue requires priority attribute
  queues.forEach(q => {
    if (String(q.discipline || "FIFO").toUpperCase() !== "PRIORITY") return;
    const ct = entityTypes.find(et =>
      String(et.name || "").trim().toLowerCase() === String(q.customerType || "").trim().toLowerCase()
    );
    if (!ct) {
      err("V4", `Queue '${q.name}' uses PRIORITY discipline but entity class '${q.customerType || "?"}' was not found.`);
    } else {
      const hasPriority = ((ct.attrDefs as ModelRecord[]) || []).some(a =>
        String(a.name || "").trim().toLowerCase() === "priority"
      );
      if (!hasPriority) {
        err("V4", `Queue '${q.name}' uses PRIORITY discipline but entity class '${ct.name}' has no 'priority' attribute.`);
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
      graph:              model.graph              || null,
      experimentDefaults: model.experimentDefaults || {},
      goals:              model.goals              || [],
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
