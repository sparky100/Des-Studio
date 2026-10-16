// The Flow MCP server's tools, as plain functions (no MCP SDK here), so the
// repo's own test suite can exercise them directly. server.js wires them to
// MCP. Everything runs on the user's computer: models are JSON files in one
// folder, in the same format Flow exports and imports.
//
// The engine, validator, KPI extraction and confidence intervals are Flow's
// own (src/engine, src/llm/prompts.js), so numbers here match the app.

import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';
import { estimateRunComplexity, estimateMaxCycles } from '../../src/engine/complexity-estimator.js';
import { confidenceInterval95, summarizeReplicationResults, SUMMARY_METRICS } from '../../src/engine/statistics.js';
import { pickModelJsonFields } from '../../src/model/modelJsonFields.js';
import { buildKpis } from '../../src/llm/prompts.js';

export const VERSION = '0.1.0';
export const DEFAULT_REPLICATIONS = 10;
export const MAX_REPLICATIONS = 50;
const RUN_BUDGET_MS = 90_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class ToolError extends Error {}

// ── Numbers ────────────────────────────────────────────────────────────────

// 3 significant figures, thousands separators: 1234.5 → "1,230", 0.0123 → "0.012".
export function fmt(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const rounded = Number(v.toPrecision(Math.abs(v) < 1 ? 2 : 3));
  return Math.abs(rounded) >= 1000 ? Math.round(rounded).toLocaleString('en-US') : String(rounded);
}

// "18 minutes (95% CI 15–21)", or just the mean when there's no interval.
// Every quantity reported here (counts, waits, times, costs) is
// non-negative, so a t-interval dipping below zero is shown from 0.
export function fmtCi(ci, unit = '') {
  if (!ci || ci.mean == null) return '—';
  const u = unit ? ` ${unit}` : '';
  if (ci.lower == null || ci.upper == null) return `${fmt(ci.mean)}${u}`;
  return `${fmt(ci.mean)}${u} (95% CI ${fmt(Math.max(0, ci.lower))}–${fmt(ci.upper)})`;
}

// ── Models and files ───────────────────────────────────────────────────────

// Accepts a Flow export ({ name, model_json, … }), a bare model object, or
// either as a JSON string (some assistants send arguments stringified).
// Returns { name, description, model } with every model_json field present.
export function normaliseModelInput(input) {
  let payload = input;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); }
    catch (e) { throw new ToolError(`The model isn't valid JSON: ${e.message}`); }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ToolError('The model must be a Flow model JSON object.');
  }
  const source = payload.model_json && typeof payload.model_json === 'object' ? payload.model_json : payload;
  const name = String(payload.name || source.name || '').trim();
  const description = String(payload.description || source.description || '').trim();
  return { name, description, model: { name, description, ...pickModelJsonFields(source) } };
}

export function resolveInFolder(folder, file) {
  if (!file || typeof file !== 'string') throw new ToolError('Give the file name of a model in your Flow models folder.');
  const base = path.resolve(folder);
  const full = path.resolve(base, file.endsWith('.json') ? file : `${file}.json`);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new ToolError('Only files inside your Flow models folder can be used.');
  }
  return full;
}

async function readModelFile(folder, file) {
  const full = resolveInFolder(folder, file);
  let info;
  try { info = await stat(full); } catch { throw new ToolError(`There's no model called "${file}" in ${folder}. Use flow_list_models to see what's there.`); }
  if (info.size > MAX_FILE_BYTES) throw new ToolError(`"${file}" is larger than 5 MB, too big to load here.`);
  return { full, ...normaliseModelInput(await readFile(full, 'utf8')) };
}

// A model given inline or by file name — every tool that takes a model
// accepts either.
async function modelFrom(args, folder) {
  if (args.model != null) return normaliseModelInput(args.model);
  if (args.file) return readModelFile(folder, args.file);
  throw new ToolError('Pass either `model` (the model JSON) or `file` (a model in your Flow models folder).');
}

export async function listModels(folder) {
  await mkdir(folder, { recursive: true });
  const entries = (await readdir(folder)).filter(f => f.toLowerCase().endsWith('.json')).sort();
  if (entries.length === 0) return `No models yet in ${folder}. Models saved with flow_save_model, or exported from Flow into this folder, will appear here.`;
  const rows = [];
  for (const file of entries) {
    const info = await stat(path.join(folder, file));
    let name = '';
    if (info.size <= MAX_FILE_BYTES) {
      try { name = normaliseModelInput(await readFile(path.join(folder, file), 'utf8')).name; } catch { name = '(not a readable Flow model)'; }
    }
    rows.push(`- ${file}${name ? ` — "${name}"` : ''} (modified ${info.mtime.toISOString().slice(0, 16).replace('T', ' ')})`);
  }
  return `Models in ${folder}:\n${rows.join('\n')}`;
}

export async function readModel(folder, file) {
  const { name, description, model } = await readModelFile(folder, file);
  const counts = ['entityTypes', 'queues', 'bEvents', 'cEvents', 'stateVariables', 'containerTypes', 'goals']
    .map(k => `${(model[k] || []).length} ${k}`).join(', ');
  const { name: _n, description: _d, graph: _g, ...body } = model;
  return `"${name || file}"${description ? ` — ${description}` : ''}\n${counts}\n\n${JSON.stringify(body, null, 2)}`;
}

// ── Validation ─────────────────────────────────────────────────────────────

function issueLine(i) {
  return `- [${i.code}] ${i.message}${i.tab ? ` (${i.tab})` : ''}`;
}

export function validationReport(model) {
  const { errors, warnings } = validateModel(model);
  const head = errors.length
    ? `${errors.length} error${errors.length === 1 ? '' : 's'} — Flow won't run this model until they're fixed.`
    : `No errors.${warnings.length ? '' : ' No warnings.'}`;
  const parts = [head];
  if (errors.length) parts.push('Errors:', ...errors.map(issueLine));
  if (warnings.length) parts.push(`Warnings (${warnings.length}) — worth checking, but the model will run:`, ...warnings.slice(0, 30).map(issueLine));
  if (warnings.length > 30) parts.push(`…and ${warnings.length - 30} more warnings`);
  if (errors.length) parts.push('For the rule behind an error code, see section 10 of the schema: flow_get_schema({ section: "10" }).');
  return { errors, warnings, text: parts.join('\n') };
}

export async function validate(args, folder) {
  const { model } = await modelFrom(args, folder);
  return validationReport(model).text;
}

// ── Running ────────────────────────────────────────────────────────────────

function num(v, fallback) {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : fallback;
}

// The settings a run uses: the call's overrides, else the model's own
// experiment defaults, else Flow's defaults.
export function runSettings(model, args = {}) {
  const ed = model.experimentDefaults || {};
  const replications = Math.min(MAX_REPLICATIONS, Math.max(1, Math.round(num(args.replications, DEFAULT_REPLICATIONS))));
  return {
    replications,
    maxSimTime: num(args.maxSimTime, num(ed.maxSimTime, 500)),
    warmupPeriod: num(args.warmupPeriod, num(ed.warmupPeriod, 0)),
    baseSeed: Math.round(num(args.seed, num(ed.seed, 12345))),
    terminationCondition: ed.terminationMode === 'condition' ? (ed.terminationCondition || null) : null,
  };
}

// Runs `settings.replications` replications (seed = baseSeed + index, as
// Flow's replication runner does), stopping early if the time budget runs out.
export function runReplicationsSync(model, settings, { budgetMs = RUN_BUDGET_MS, now = Date.now } = {}) {
  const estimate = estimateRunComplexity(model, { maxSimTime: settings.maxSimTime, replications: 1 });
  const maxCycles = estimateMaxCycles(estimate);
  const started = now();
  const results = [];
  const failures = [];
  for (let i = 0; i < settings.replications; i++) {
    if (i > 0 && now() - started > budgetMs) break;
    const seed = settings.baseSeed + i;
    try {
      const engine = buildEngine(model, seed, settings.warmupPeriod, settings.maxSimTime, settings.terminationCondition, maxCycles);
      results.push(engine.runAll());
    } catch (e) {
      failures.push({ seed, message: e?.message || String(e) });
    }
  }
  return { results, failures, elapsedMs: now() - started };
}

// [metric path, label, is a duration]
const KPI_ROWS = [
  ['summary.total', 'Arrived'],
  ['summary.served', 'Completed'],
  ['summary.servedRatio', 'Completion rate'],
  ['summary.avgWait', 'Average wait', true],
  ['summary.avgTimeInSystem', 'Average time in system', true],
  ['summary.reneged', 'Reneged (gave up waiting)'],
  ['summary.balked', 'Balked (didn’t join a queue)'],
  ['summary.totalCost', 'Total cost'],
];

// A 0–1 share as "83% (95% CI 79–87%)", the interval kept within 0–100%.
export function pct(ci) {
  if (!ci || ci.mean == null) return '—';
  const p = v => fmt(Math.min(100, Math.max(0, v * 100)));
  if (ci.lower == null || ci.upper == null) return `${p(ci.mean)}%`;
  return `${p(ci.mean)}% (95% CI ${p(ci.lower)}–${p(ci.upper)}%)`;
}

// Reads a set of replication results the way a modeller would: headline
// KPIs with 95% CIs, per-queue waits, per-resource utilisation, then the
// things that should make you distrust or change the model.
export function summariseRun(model, settings, run) {
  const { results, failures } = run;
  const timeUnit = model.timeUnit || 'time units';
  const lines = [];
  const n = results.length;
  lines.push(`Ran ${n} replication${n === 1 ? '' : 's'} of ${fmt(settings.maxSimTime)} ${timeUnit}` +
    `${settings.warmupPeriod ? `, warm-up ${fmt(settings.warmupPeriod)}` : ', no warm-up'}, seeds ${settings.baseSeed}–${settings.baseSeed + Math.max(0, settings.replications - 1)}.`);
  if (n < settings.replications && failures.length === 0) {
    lines.push(`Stopped after ${n} of ${settings.replications} replications to stay within the time limit — ask for fewer replications or a shorter run for full results.`);
  }
  if (failures.length) {
    lines.push(`${failures.length} replication${failures.length === 1 ? '' : 's'} failed: ${[...new Set(failures.map(f => f.message))].slice(0, 3).join(' | ')}`);
  }
  if (n === 0) return lines.join('\n');

  const agg = summarizeReplicationResults(results, SUMMARY_METRICS);
  lines.push('', 'Results (mean across replications):');
  for (const [key, label, isTime] of KPI_ROWS) {
    const ci = agg[key];
    if (!ci || ci.mean == null) continue;
    if (key === 'summary.totalCost' && !ci.mean) continue;
    if ((key === 'summary.reneged' || key === 'summary.balked') && !ci.mean) continue;
    const value = key === 'summary.servedRatio' ? pct(ci) : fmtCi(ci, isTime ? timeUnit : '');
    lines.push(`- ${label}: ${value}`);
  }

  const perRep = results.map(r => buildKpis(model, r));
  const queues = (perRep[0]?.queues || []).map(q => q.name);
  if (queues.length) {
    lines.push('', 'Queues:');
    for (const qName of queues) {
      const waits = confidenceInterval95(perRep.map(k => k.queues?.find(q => q.name === qName)?.meanWait));
      const p95 = confidenceInterval95(perRep.map(k => k.queues?.find(q => q.name === qName)?.p95));
      if (waits.mean == null) { lines.push(`- ${qName}: no one queued here`); continue; }
      if (waits.mean === 0 && !(p95.mean > 0)) { lines.push(`- ${qName}: no waiting`); continue; }
      lines.push(`- ${qName}: average wait ${fmtCi(waits, timeUnit)}${p95.mean != null ? `; 95th percentile ${fmt(p95.mean)} ${timeUnit}` : ''}`);
    }
  }

  const resources = (perRep[0]?.resources || []).map(r => r.name);
  const busy = [];
  if (resources.length) {
    lines.push('', 'Resources (share of time busy):');
    for (const rName of resources) {
      const util = confidenceInterval95(perRep.map(k => {
        const u = k.resources?.find(r => r.name === rName)?.utilisation;
        return u == null ? null : u / 100;
      }));
      const count = perRep[0].resources.find(r => r.name === rName)?.count;
      lines.push(`- ${rName}${count != null ? ` (${count})` : ''}: ${pct(util)}`);
      if (util.mean != null && util.mean >= 0.95) busy.push({ name: rName, util: util.mean });
    }
  }

  // ── Things to check ──
  const checks = [];
  for (const b of busy) {
    checks.push(`${b.name} is busy ${Math.round(b.util * 100)}% of the time — a bottleneck. Queues feeding it will keep growing in a longer run; add capacity or reduce demand before reading waits as typical.`);
  }
  const waitingAtEnd = confidenceInterval95(results.map(r => r.summary?.terminatingState?.waitingAtEnd));
  const served = agg['summary.served']?.mean || 0;
  if (waitingAtEnd.mean != null && waitingAtEnd.mean >= Math.max(5, served * 0.1)) {
    checks.push(`About ${Math.round(waitingAtEnd.mean)} entities are still waiting when the run ends — the system is overloaded, or the run is too short to clear its queues.`);
  }
  if (served === 0) checks.push('Nothing completes. Check that arrivals happen and that every route ends (an entity may be stuck with nowhere to go).');
  if (results.some(r => r.cycleLimitReached || r.phaseCTruncated || r.scanLimitReached)) {
    checks.push('A run hit one of the engine’s safety limits, so it stopped early and the results are incomplete. This usually means C-events keep firing without time moving forward (a loop in the logic).');
  }
  const waitCi = agg['summary.avgWait'];
  if (n >= 3 && waitCi?.halfWidth != null && waitCi.mean > 0 && waitCi.halfWidth / waitCi.mean > 0.2) {
    checks.push(`Average wait varies a lot between replications (±${Math.round((waitCi.halfWidth / waitCi.mean) * 100)}%). Run more replications before comparing options.`);
  }
  if (n === 1) checks.push('One replication shows one possible day, not the typical one. Use 10 or more replications before drawing conclusions.');
  if (!settings.warmupPeriod && model.experimentDefaults?.terminationMode !== 'condition') {
    checks.push('No warm-up: results include the start, when the system is empty. That is right if it really starts empty (a clinic each morning); for a system that runs continuously, set a warm-up.');
  }
  const engineWarnings = [...new Set(results.flatMap(r => (r.warnings || []).map(w => (typeof w === 'string' ? w : w?.message)).filter(Boolean)))];
  for (const w of engineWarnings.slice(0, 6)) checks.push(`Engine: ${w}`);
  if (checks.length) lines.push('', 'Things to check:', ...checks.map(c => `- ${c}`));
  return lines.join('\n');
}

export async function run(args, folder) {
  const { model } = await modelFrom(args, folder);
  const { errors, text } = validationReport(model);
  if (errors.length) return `Not run — fix these first.\n${text}`;
  const settings = runSettings(model, args);
  return summariseRun(model, settings, runReplicationsSync(model, settings));
}

// ── Saving ─────────────────────────────────────────────────────────────────

export function safeFileName(name) {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || 'Untitled model';
}

// The same envelope Flow's own Export writes, so Flow's Import (and anyone
// reading the file) treats it like any other exported model.
export function exportEnvelope({ name, description, model }, exportedAt = new Date().toISOString()) {
  const payload = {
    name: name || 'Untitled model',
    model_json: { ...pickModelJsonFields(model), graph: null },
    exportedAt,
    appVersion: `flow-mcp ${VERSION}`,
  };
  if (description) payload.description = description;
  return payload;
}

export async function save(args, folder) {
  const input = normaliseModelInput(args.model);
  const name = String(args.name || input.name || '').trim();
  if (!name) throw new ToolError('Give the model a name.');
  const description = String(args.description ?? input.description ?? '').trim();
  const { errors, warnings, text } = validationReport(input.model);
  if (errors.length && !args.allowErrors) {
    return `Not saved — the model has errors. Fix them (or pass allowErrors: true to save a work in progress).\n${text}`;
  }
  await mkdir(folder, { recursive: true });
  const base = safeFileName(name);
  let file = `${base}.json`;
  if (!args.overwrite) {
    for (let k = 2; ; k++) {
      try { await stat(path.join(folder, file)); file = `${base} (${k}).json`; } catch { break; }
    }
  }
  const full = resolveInFolder(folder, file);
  await writeFile(full, `${JSON.stringify(exportEnvelope({ name, description, model: input.model }), null, 2)}\n`, 'utf8');
  const status = errors.length
    ? `with ${errors.length} error${errors.length === 1 ? '' : 's'} (Flow will import it, but it won't run until they're fixed)`
    : warnings.length ? `with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'with no errors or warnings';
  return `Saved "${name}" as ${full} ${status}.\nTo open it in Flow: + New Model → Import a file → choose "${file}".`;
}
