// ui/shared/utils.js — General utility functions

import { pickModelJsonFields } from "../../model/modelJsonFields.js";

/**
 * Normalise an imported JSON payload (raw model or DB envelope) into a
 * clean model object ready for validateModel() and saveModel().
 * Accepts both { model_json: {...} } DB envelopes and plain model objects.
 */
export function extractImportedModelPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Import must be a flow model JSON object.");
  }
  const source = payload.model_json && typeof payload.model_json === "object"
    ? payload.model_json
    : payload;
  const sourceName = (payload.name || source.name || "Imported model").trim?.() || "Imported model";
  const model = {
    name: `${sourceName} (Imported)`,
    description: payload.description || source.description || "",
    visibility: "private",
    access: {},
  };
  // Every model_json field (model/modelJsonFields.js) — a hand-written list
  // here used to drop `distances`.
  Object.assign(model, pickModelJsonFields(source));
  // Never trust externally-supplied node positions on import: an LLM
  // asked to fill in flow's schema sometimes hallucinates a `graph` key
  // with arbitrary/overlapping x/y even though the schema never asks
  // for one. Always discard it so deriveGraphFromModel() computes a
  // fresh dagre auto-layout — the same effect as the "↺ Layout" reset
  // button (resetLayout in VisualDesignerPanel.jsx / relayoutModel in
  // graph-operations.js, both of which wipe graph.nodes to []).
  model.graph = null;
  return model;
}

/**
 * The model an import link updates in place: `target` (an existing model
 * from the library) with every model_json field replaced by the imported
 * one's. Unlike extractImportedModelPayload, the incoming layout is kept: a
 * file exported from Flow and edited by the Flow MCP still carries the
 * canvas positions. With no layout in the import, the target's is kept.
 */
export function buildModelUpdateFromImport(target, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Import must be a flow model JSON object.");
  }
  const source = payload.model_json && typeof payload.model_json === "object"
    ? payload.model_json
    : payload;
  const fields = pickModelJsonFields(source);
  if (!fields.graph) fields.graph = target.graph ?? null;
  return {
    ...target,
    ...fields,
    name: String(payload.name || source.name || target.name || "").trim() || target.name,
    description: payload.description ?? source.description ?? target.description ?? "",
  };
}

/** True when `userId` may change `model`: its owner or an editor. */
export function canEditModel(model, userId) {
  return !!model && !!userId && (model.owner_id === userId || model.access?.[userId] === "editor");
}

export function disciplineBase(d) {
  if (!d || d.toUpperCase() === "FIFO") return "FIFO";
  const m = String(d).match(/^PRIORITY\((\w+)\)$/i);
  if (m) return m[1].toLowerCase() === "priority" ? "PRIORITY" : "PRIORITY_ATTR";
  return String(d).toUpperCase();
}

export function disciplineAttr(d) {
  const m = String(d || "").match(/^PRIORITY\((\w+)\)$/i);
  return m ? m[1] : "priority";
}

export function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function downloadTextFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); URL.revokeObjectURL(url); }
}

export function downloadJsonFile(payload, filename) {
  downloadTextFile(JSON.stringify(payload, null, 2), filename, "application/json");
}

export function buildRunHistoryExportPayload(model, rows = [], exportedAt = new Date().toISOString()) {
  return {
    schema: "simmodlr.run-history.v1",
    exportedAt,
    model: { id: model?.id ?? null, name: model?.name ?? "Untitled model" },
    runs: rows.map(row => ({
      id: row.id,
      runLabel: row.run_label || "",
      ranAt: row.ran_at,
      seed: row.seed ?? null,
      replications: row.replications ?? 1,
      warmupPeriod: row.warmup_period ?? null,
      maxSimulationTime: row.max_simulation_time ?? null,
      totalArrived: row.total_arrived ?? 0,
      totalServed: row.total_served ?? 0,
      totalReneged: row.total_reneged ?? 0,
      renegeRate: row.renege_rate ?? null,
      avgWaitTime: row.avg_wait_time ?? null,
      avgServiceTime: row.avg_service_time ?? null,
      durationMs: row.duration_ms ?? null,
      resultsJson: row.results_json ?? null,
    })),
  };
}

export function buildRunHistoryCsv(rows = []) {
  const headers = ["runLabel","ranAt","seed","replications","warmupPeriod","maxSimulationTime",
    "totalArrived","totalServed","totalReneged","renegeRate","avgWaitTime","avgServiceTime","durationMs"];
  const dataRows = rows.map(row => [
    row.run_label || "", row.ran_at, row.seed ?? "", row.replications ?? 1,
    row.warmup_period ?? "", row.max_simulation_time ?? "",
    row.total_arrived ?? 0, row.total_served ?? 0, row.total_reneged ?? 0,
    row.renege_rate ?? "", row.avg_wait_time ?? "", row.avg_service_time ?? "",
    row.duration_ms ?? "",
  ]);
  return [headers, ...dataRows].map(r => r.map(csvEscape).join(",")).join("\n");
}

export function slugifyResultName(name = "model") {
  const slug = String(name || "model")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

/**
 * Human-friendly relative timestamp ("2d ago"). Pair with fullDate() in a
 * title attribute so the absolute date stays discoverable on hover.
 */
export function relativeTime(isoDate) {
  if (!isoDate) return "Never";
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function fullDate(isoDate) {
  if (!isoDate) return "";
  return new Date(isoDate).toLocaleString();
}

// Precision follows magnitude, so live readouts stay short: below 1 keeps two
// decimals (0.37), 1–10 keeps one (4.2), 10 and above is a whole number with
// thousands separators (20,387,362). Trailing zeros are dropped (0.50 → 0.5).
export function formatReadout(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 10) return Math.round(n).toLocaleString("en-GB");
  return String(Number(n.toFixed(abs < 1 ? 2 : 1)));
}
