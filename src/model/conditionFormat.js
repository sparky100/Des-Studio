function parseScalarValue(raw) {
  const text = String(raw ?? "").trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  const numeric = Number(text);
  return text !== "" && !Number.isNaN(numeric) ? numeric : text;
}

function formatScalarValue(value) {
  if (typeof value === "string" && /\s/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return String(value ?? "");
}

function isLogicalCondition(condition) {
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return false;
  const op = String(condition.operator || "").toUpperCase();
  return (op === "AND" || op === "OR") && Array.isArray(condition.clauses);
}

function isLeafCondition(condition) {
  return !!condition && typeof condition === "object" && !Array.isArray(condition) && !isLogicalCondition(condition);
}

export function buildConditionString(rows = []) {
  return rows
    .map((row, index) => {
      const clause = `${row.token} ${row.operator} ${row.value}`;
      return index === 0 ? clause : `${row.join} ${clause}`;
    })
    .join(" ");
}

export function rowsToPredicate(rows = []) {
  if (!rows.length) return null;
  const clauses = rows.map(row => ({
    variable: row.token,
    operator: row.operator,
    value: parseScalarValue(row.value),
  }));
  if (clauses.length === 1) return clauses[0];
  return {
    operator: rows[1]?.join || "AND",
    clauses,
  };
}

export function predicateToRows(predicate) {
  if (!predicate) return [];
  if (typeof predicate === "string") return parseConditionString(predicate);

  if (isLogicalCondition(predicate)) {
    const rows = predicate.clauses.flatMap((clause, index) => {
      const clauseRows = predicateToRows(clause);
      return clauseRows.map((row, rowIndex) => ({
        ...row,
        join: (index === 0 && rowIndex === 0) ? "AND" : predicate.operator,
      }));
    });
    return rows.map((row, index) => ({ ...row, id: `r${index}` }));
  }

  return [{
    id: "r0",
    token: predicate.variable || "",
    operator: predicate.operator || "==",
    value: formatScalarValue(predicate.value),
    join: "AND",
  }];
}

export function parseConditionString(condition = "") {
  const text = String(condition || "").trim();
  if (!text) return [];

  // Split on AND/OR at paren-depth 0 only, so queue(OR) is not split on the OR inside.
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") { depth++; current += ch; continue; }
    if (ch === ")") { depth--; current += ch; continue; }
    if (depth === 0) {
      const sub = text.slice(i);
      const prev = current.slice(-1);
      const atWordBoundary = !prev || /\W/.test(prev);
      if (atWordBoundary) {
        const andM = sub.match(/^AND\b/i);
        const orM  = sub.match(/^OR\b/i);
        if (andM) { parts.push(current, "AND"); current = ""; i += 2; continue; }
        if (orM)  { parts.push(current, "OR");  current = ""; i += 1; continue; }
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  const rows = [];
  let join = "AND";

  for (const partRaw of parts) {
    const part = partRaw.trim();
    if (!part) continue;
    if (part.toUpperCase() === "AND" || part.toUpperCase() === "OR") {
      join = part.toUpperCase();
      continue;
    }
    const match = part.match(/^(.+?)\s*(>=|<=|==|!=|>|<)\s*(.*)$/);
    if (!match) continue;
    rows.push({
      id: `r${rows.length}`,
      token: match[1].trim(),
      operator: match[2].trim(),
      value: match[3].trim(),
      join,
    });
    join = "AND";
  }

  return rows;
}

export function extractQueueNamesFromCondition(condition) {
  if (!condition) return [];
  if (typeof condition === "string") {
    return [...condition.matchAll(/queue\(([^)]+)\)/gi)].map(m => m[1].trim());
  }
  if (typeof condition !== "object" || Array.isArray(condition)) return [];
  if (Array.isArray(condition.clauses)) {
    return condition.clauses.flatMap(extractQueueNamesFromCondition);
  }
  const variable = String(condition.variable || condition.token || condition.left || "");
  const legacyMatch = variable.match(/^Queue\.([^.]+)\./i);
  if (legacyMatch) return [legacyMatch[1].trim()];
  const currentMatch = variable.match(/^queue\(([^)]+)\)/i);
  return currentMatch ? [currentMatch[1].trim()] : [];
}

export function variableToLegacyToken(variable = "") {
  const text = String(variable || "").trim();
  const queueMatch = text.match(/^Queue\.([^.]+)\.(length|count|size)$/i);
  if (queueMatch) return `queue(${queueMatch[1]}).length`;
  const idleMatch = text.match(/^Resource\.([^.]+)\.(idle|idleCount|available|availableCount)$/i);
  if (idleMatch) return `idle(${idleMatch[1]}).count`;
  const busyMatch = text.match(/^Resource\.([^.]+)\.(busy|busyCount)$/i);
  if (busyMatch) return `busy(${busyMatch[1]}).count`;
  return text;
}

export function predicateToLegacyString(condition) {
  if (!condition) return "";
  if (typeof condition === "string") return condition;
  if (typeof condition !== "object" || Array.isArray(condition)) return "";

  const op = String(condition.operator || "AND").toUpperCase();
  if (isLogicalCondition(condition)) {
    return condition.clauses
      .map(predicateToLegacyString)
      .filter(Boolean)
      .join(` ${op} `);
  }

  const variable = variableToLegacyToken(condition.variable);
  const operator = condition.operator || "==";
  if (!variable || !operator) return "";
  return `${variable} ${operator} ${formatScalarValue(condition.value)}`;
}

export function conditionToLegacyString(condition) {
  if (!condition) return "";
  if (typeof condition === "string") return condition;
  return predicateToLegacyString(condition);
}

export function migrateLegacyCondition(condition) {
  if (!condition) return null;
  if (typeof condition === "string") {
    return rowsToPredicate(parseConditionString(condition));
  }
  if (isLogicalCondition(condition)) {
    return {
      operator: String(condition.operator || "AND").toUpperCase(),
      clauses: condition.clauses
        .map(migrateLegacyCondition)
        .filter(Boolean),
    };
  }
  if (isLeafCondition(condition)) {
    const rawValue = condition.value;
    return {
      variable: condition.variable || "",
      operator: condition.operator || "==",
      value: parseScalarValue(String(rawValue ?? "")),
    };
  }
  return condition;
}

export function mapConditionVariables(condition, mapper = value => value) {
  if (!condition) return condition;
  if (typeof condition === "string") {
    return conditionToLegacyString(mapConditionVariables(migrateLegacyCondition(condition), mapper));
  }
  if (isLogicalCondition(condition)) {
    return {
      ...condition,
      clauses: condition.clauses.map(clause => mapConditionVariables(clause, mapper)),
    };
  }
  if (isLeafCondition(condition)) {
    const variable = condition.variable || "";
    return {
      ...condition,
      variable: mapper(variable),
    };
  }
  return condition;
}

function normalizeConditionShape(condition) {
  if (!condition) return null;
  return migrateLegacyCondition(condition);
}

function normalizeEventConditions(events = []) {
  return events.map(event => {
    if (event.condition == null) return event;
    return { ...event, condition: normalizeConditionShape(event.condition) };
  });
}

function normalizeQueueBalkConditions(queues = []) {
  return queues.map(queue => {
    if (queue.balkCondition == null) return queue;
    return { ...queue, balkCondition: normalizeConditionShape(queue.balkCondition) };
  });
}

function normalizeBEventRouting(bEvents = []) {
  return bEvents.map(event => {
    if (!Array.isArray(event.routing) || !event.routing.length) return event;
    return {
      ...event,
      routing: event.routing.map(branch => {
        if (branch?.condition == null) return branch;
        return { ...branch, condition: normalizeConditionShape(branch.condition) };
      }),
    };
  });
}

function normalizeCScheduleWhen(cEvents = []) {
  return cEvents.map(event => {
    if (!Array.isArray(event.cSchedules) || !event.cSchedules.length) return event;
    return {
      ...event,
      cSchedules: event.cSchedules.map(sched => {
        if (sched?.when == null) return sched;
        return { ...sched, when: normalizeConditionShape(sched.when) };
      }),
    };
  });
}

export function normalizeModelConditions(model = {}) {
  if (!model || typeof model !== "object") return model;
  const next = { ...model };
  if (Array.isArray(model.cEvents)) {
    next.cEvents = normalizeCScheduleWhen(normalizeEventConditions(model.cEvents));
  }
  if (Array.isArray(model.queues)) {
    next.queues = normalizeQueueBalkConditions(model.queues);
  }
  if (Array.isArray(model.bEvents)) {
    next.bEvents = normalizeBEventRouting(model.bEvents);
  }
  if (model.modelJson && typeof model.modelJson === "object") {
    next.modelJson = normalizeModelConditions(model.modelJson);
  }
  return next;
}

export function hasConditionDefinition(condition) {
  if (!condition) return false;
  if (typeof condition === "string") return condition.trim() !== "";
  if (Array.isArray(condition)) return condition.some(hasConditionDefinition);
  if (typeof condition !== "object") return false;
  if (Array.isArray(condition.clauses)) return condition.clauses.some(hasConditionDefinition);
  return String(condition.variable || "").trim() !== "";
}

export function isMeaningfulRoutingBranch(branch) {
  if (!branch || typeof branch !== "object") return false;
  return hasConditionDefinition(branch.condition);
}
