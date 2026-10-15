// ── ASSIGN(Queue, ServerType, PREEMPT[, Criterion][, Policy][, MAX:n][, MINSERVICE:t]) ──
// Sprint 99 Phase 2 — preempt-and-assign (docs/reviews/sprint-99-preemption-plan.md).
//
// "Serve the head of Queue with a ServerType, taking one if none is idle":
//   1. an idle server of the type → exactly ASSIGN(Queue, ServerType);
//   2. otherwise, among busy servers whose job ranks strictly below the head of
//      Queue, pick a victim, interrupt it (preemptCustomer) and give THAT server
//      to the head in the same firing, so no other C-event can take it;
//   3. no idle server and no lower-ranked job → no-op.
//
// Rank is the queue discipline's key (PRIORITY(attr), PRIORITY, SPT, EDD; lower
// value = served first), or PRIORITY(attr) given as the criterion. Equal rank
// never preempts, so two jobs can't keep bumping each other. Among eligible
// victims the default takes the lowest-ranked (ties: least service so far);
// LONGEST / SHORTEST take the one with the most / least service so far.
//
// Policy — what the displaced job gets when it is next served:
//   RESUME (default)  its remaining time
//   RESTART           its full original duration again
//   RESAMPLE          a fresh sample
//   DROP:<Queue>      it joins <Queue> instead, starting that activity afresh
// MAX:n              a job is interrupted at most n times (over its life)
// MINSERVICE:t       only a job that has had at least t of its current service
//                    can be interrupted (a job just started is left alone)
import { claimServerForEntity, findEntityById, isCarriedClaim, listWaiting, preemptCustomer } from "./entities.js";
import { evaluatePredicate } from "./conditions.js";

export const PREEMPT_ASSIGN_PATTERN = /^ASSIGN\(\s*([^,)]+?)\s*,\s*([^,)]+?)\s*,\s*PREEMPT\s*(?:,\s*(.*?))?\s*\)$/i;

/** Split on commas that are not inside parentheses. @param {string} text */
function splitTopLevel(text) {
  /** @type {string[]} */
  const out = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Options after PREEMPT. Unknown or repeated options are reported in `errors`.
 * @param {string|null|undefined} rest
 */
export function parsePreemptOptions(rest) {
  /** @type {{ criterion: null|{kind: "priority", attr: string}|{kind: "longest"|"shortest"}, policy: "RESUME"|"RESTART"|"RESAMPLE"|"DROP", dropQueue: string|null, maxPreemptions: number|null, minService: number|null, errors: string[] }} */
  const opts = { criterion: null, policy: "RESUME", dropQueue: null, maxPreemptions: null, minService: null, errors: [] };
  let policySet = false;
  for (const token of splitTopLevel(rest || "")) {
    let m;
    if ((m = token.match(/^PRIORITY\(\s*(\w+)\s*\)$/i))) {
      if (opts.criterion) opts.errors.push(`more than one criterion ("${token}")`);
      opts.criterion = { kind: "priority", attr: m[1] };
    } else if (/^(LONGEST|SHORTEST)$/i.test(token)) {
      if (opts.criterion) opts.errors.push(`more than one criterion ("${token}")`);
      opts.criterion = { kind: /** @type {"longest"|"shortest"} */ (token.toLowerCase()) };
    } else if (/^(RESUME|RESTART|RESAMPLE)$/i.test(token)) {
      if (policySet) opts.errors.push(`more than one policy ("${token}")`);
      opts.policy = /** @type {"RESUME"|"RESTART"|"RESAMPLE"} */ (token.toUpperCase());
      policySet = true;
    } else if ((m = token.match(/^DROP\s*:\s*(.+)$/i))) {
      if (policySet) opts.errors.push(`more than one policy ("${token}")`);
      opts.policy = "DROP";
      opts.dropQueue = m[1].trim();
      policySet = true;
    } else if ((m = token.match(/^MAX\s*:\s*(.+)$/i))) {
      const n = Number(m[1]);
      if (!Number.isInteger(n) || n < 1) opts.errors.push(`MAX:${m[1]} must be a whole number of at least 1`);
      else opts.maxPreemptions = n;
    } else if ((m = token.match(/^MINSERVICE\s*:\s*(.+)$/i))) {
      const t = Number(m[1]);
      if (!Number.isFinite(t) || t < 0) opts.errors.push(`MINSERVICE:${m[1]} must be a number of at least 0`);
      else opts.minService = t;
    } else {
      opts.errors.push(`unknown option "${token}" — expected PRIORITY(attr), LONGEST, SHORTEST, RESUME, RESTART, RESAMPLE, DROP:Queue, MAX:n or MINSERVICE:t`);
    }
  }
  return opts;
}

/**
 * Case-insensitive numeric attribute, Infinity when missing (the queue
 * discipline convention: a job without the attribute ranks last).
 * @param {Record<string, any>} entity
 * @param {string[]} names
 */
function numericAttr(entity, names) {
  const attrs = entity?.attrs;
  if (!attrs) return Infinity;
  for (const name of names) {
    const upper = name.toUpperCase();
    for (const key of Object.keys(attrs)) {
      if (key.toUpperCase() === upper && attrs[key] != null && attrs[key] !== "") {
        const v = Number(attrs[key]);
        return Number.isFinite(v) ? v : Infinity;
      }
    }
  }
  return Infinity;
}

/**
 * The attribute(s) jobs are ranked by (lower value = served first), from the
 * PRIORITY(attr) criterion or else the queue discipline. Null when neither
 * ranks jobs (FIFO, LIFO, …).
 * @param {string|null|undefined} discipline
 * @param {ReturnType<typeof parsePreemptOptions>["criterion"]} criterion
 * @returns {string[]|null}
 */
export function preemptRankAttrs(discipline, criterion) {
  if (criterion?.kind === "priority") return [criterion.attr];
  const d = String(discipline || "FIFO").trim();
  const m = d.match(/^PRIORITY\(\s*(\w+)\s*\)$/i);
  if (m) return [m[1]];
  if (/^PRIORITY$/i.test(d)) return ["priority"];
  if (/^SPT$/i.test(d)) return ["serviceTime", "processingTime"];
  if (/^EDD$/i.test(d)) return ["dueDate"];
  return null;
}

/**
 * @param {RegExpMatchArray} match
 * @param {Record<string, any>} ctx  the macro context
 * @param {(queue: string, serverType: string) => void} plainAssign  runs ASSIGN(queue, serverType)
 */
export function applyPreemptAssign(match, ctx, plainAssign) {
  const qToken = match[1].trim();
  const sType = match[2].trim();
  const label = `ASSIGN(${qToken}, ${sType}, PREEMPT)`;
  const { entities, helpers, clock, msgs, setLastCustId, setLastSrvId, _arbitration } = ctx;
  const opts = parsePreemptOptions(match[3]);
  if (opts.errors.length) {
    for (const e of opts.errors) msgs.push(`${label}: ${e}`);
    ctx.markNoOp?.();
    return;
  }

  // 1. An idle server: an ordinary ASSIGN.
  const idle = typeof helpers.firstIdleOf === "function" ? helpers.firstIdleOf(sType) : (helpers.idleOf?.(sType) || [])[0];
  if (idle) { plainAssign(qToken, sType); return; }

  const matchedQ = helpers.findQueueConfig?.(qToken);
  const discipline = matchedQ?.discipline || "FIFO";
  const filterFn = ctx.entityFilter
    ? (/** @type {any} */ entity) => evaluatePredicate(ctx.entityFilter, { currentEntity: entity })
    : null;
  const head = listWaiting(matchedQ ? matchedQ.name : qToken, discipline, entities, filterFn, !!matchedQ, true, ctx.index)[0] ?? null;
  if (!head) {
    msgs.push(`${label}: no match — queue empty, no idle ${sType}`);
    ctx.markNoOp?.();
    return;
  }
  const rankAttrs = preemptRankAttrs(discipline, opts.criterion);
  if (!rankAttrs) {
    msgs.push(`${label}: no idle ${sType}, and queue "${qToken}" (${discipline}) doesn't rank jobs — give it a PRIORITY discipline or add PRIORITY(attr)`);
    ctx.markNoOp?.();
    return;
  }

  // 2. Busy servers whose job ranks strictly below the head.
  const headRank = numericAttr(head, rankAttrs);
  const typeKey = sType.toLowerCase();
  const pool = ctx.index?.servers || entities;
  let protectedCount = 0;
  /** @type {{ srv: any, cust: any, rank: number, elapsed: number }[]} */
  const eligible = [];
  for (const srv of pool) {
    if (srv.role !== "server" || String(srv.type).trim().toLowerCase() !== typeKey) continue;
    if ((srv.status !== "busy" && srv.status !== "serving") || srv._suspended) continue;
    const cust = findEntityById(ctx.index, entities, srv.currentCustId);
    if (!cust || cust.status !== "serving" || isCarriedClaim(cust, srv, ctx)) continue;
    const rank = numericAttr(cust, rankAttrs);
    if (!(rank > headRank)) continue;
    const elapsed = clock - (cust.serviceStart ?? clock);
    if ((opts.maxPreemptions != null && (cust._preemptCount ?? 0) >= opts.maxPreemptions)
      || (opts.minService != null && elapsed < opts.minService)) { protectedCount++; continue; }
    eligible.push({ srv, cust, rank, elapsed });
  }
  if (!eligible.length) {
    const why = protectedCount ? `${protectedCount} lower-ranked job(s) protected by MAX/MINSERVICE` : `no ${sType} is serving a lower-ranked job`;
    msgs.push(`${label}: no match — no idle ${sType}; ${why}`);
    ctx.markNoOp?.();
    return;
  }
  const kind = opts.criterion?.kind;
  eligible.sort((a, b) => {
    if (kind === "longest") return b.elapsed - a.elapsed;
    if (kind === "shortest") return a.elapsed - b.elapsed;
    return (b.rank - a.rank) || (a.elapsed - b.elapsed);
  });
  const { srv, cust: victim, rank: victimRank } = eligible[0];

  // 3. Interrupt the victim and hand its server to the head.
  const fullDuration = victim._serviceFullDuration;
  if (opts.policy === "DROP") victim.lastQueue = opts.dropQueue;
  const remaining = preemptCustomer(victim, srv, clock, ctx, "PREEMPT");
  victim._preemptCount = (victim._preemptCount ?? 0) + 1;
  // Per-activity count of servers taken, for the Run canvas card.
  if (ctx.state && ctx.ceventId) {
    const takes = ctx.state.__preemptTakes || (ctx.state.__preemptTakes = {});
    takes[ctx.ceventId] = (takes[ctx.ceventId] || 0) + 1;
  }
  if (opts.policy === "RESTART" && fullDuration != null) victim._remainingService = fullDuration;
  else if (opts.policy === "RESAMPLE" || opts.policy === "DROP") delete victim._remainingService;

  const queuedAt = head.queue;
  if (!claimServerForEntity(head, srv, clock, ctx.index, ctx, null)) {
    msgs.push(`${label}: interrupted #${victim.id} but could not claim server #${srv.id}`);
    return;
  }
  head.lastQueue = queuedAt ?? head.lastQueue;
  head.ceventName = ctx.ceventName;
  setLastCustId(head.id);
  setLastSrvId(srv.id);

  if (_arbitration && typeof _arbitration === "object") {
    Object.assign(_arbitration, {
      type: "preemption",
      serverType: sType,
      serverId: srv.id,
      preemptedEntity: victim.id,
      assignedEntity: head.id,
      rankedBy: rankAttrs[0],
      preemptedRank: victimRank,
      assignedRank: headRank,
      policy: opts.policy,
      ...(opts.dropQueue ? { dropQueue: opts.dropQueue } : {}),
      remainingService: +remaining.toFixed(4),
      reason: `${kind === "longest" ? "most service so far" : kind === "shortest" ? "least service so far" : "lowest-ranked"} of ${eligible.length} lower-ranked in service${protectedCount ? `, ${protectedCount} protected by MAX/MINSERVICE` : ""}`,
    });
  }
  const policyNote = opts.policy === "RESUME" ? `remaining ${remaining.toFixed(3)} t`
    : opts.policy === "RESTART" ? "restarts in full"
      : opts.policy === "RESAMPLE" ? "new sample on resume"
        : `→ ${opts.dropQueue}`;
  const fmtRank = (/** @type {number} */ v) => (Number.isFinite(v) ? String(+v.toFixed(3)) : "none");
  msgs.push(
    `#${head.id} (${head.type}, ${rankAttrs[0]}=${fmtRank(headRank)}) took server #${srv.id} (${srv.type}) from #${victim.id} ` +
    `(${rankAttrs[0]}=${fmtRank(victimRank)}) [${policyNote}] [waited ${(clock - head.arrivalTime).toFixed(3)} t]`
  );
}
