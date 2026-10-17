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
import { confidenceInterval95, summarizeReplicationResults, SUMMARY_METRICS, pairedTConfidenceInterval, bonferroniCI } from '../../src/engine/statistics.js';
import { pickModelJsonFields } from '../../src/model/modelJsonFields.js';
import { buildKpis, buildGoalGapsFromResults } from '../../src/llm/prompts.js';

export const VERSION = '0.2.0';
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
export function runReplicationsSync(model, settings, { budgetMs = RUN_BUDGET_MS, now = Date.now, collectTimeSeries = false } = {}) {
  const estimate = estimateRunComplexity(model, { maxSimTime: settings.maxSimTime, replications: 1 });
  const maxCycles = estimateMaxCycles(estimate);
  const started = now();
  const results = [];
  const failures = [];
  for (let i = 0; i < settings.replications; i++) {
    if (i > 0 && now() - started > budgetMs) break;
    const seed = settings.baseSeed + i;
    try {
      const engine = buildEngine(model, seed, settings.warmupPeriod, settings.maxSimTime, settings.terminationCondition, maxCycles, 5000, collectTimeSeries);
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

  lines.push(...routeLines(results, timeUnit));
  lines.push(...goalLines(model, results));

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

// How entities finished, by route (summary.outcomes), when there is more
// than one way to finish or any route ends other than by completing.
export function routeLines(results, timeUnit) {
  const labels = new Map();
  for (const r of results) {
    for (const o of Object.values(r.summary?.outcomes || {})) {
      if (!labels.has(o.routeLabel)) labels.set(o.routeLabel, { status: o.status });
    }
  }
  if (labels.size < 2 && [...labels.values()].every(l => l.status === 'completed')) return [];
  const lines = ['', 'How entities finished (per replication):'];
  for (const [label, { status }] of labels) {
    const pick = f => results.map(r => Object.values(r.summary?.outcomes || {}).find(o => o.routeLabel === label)?.[f] ?? (f === 'count' ? 0 : null));
    const count = confidenceInterval95(pick('count'));
    const sojourn = confidenceInterval95(pick('avgSojourn'));
    lines.push(`- ${label}${status && status !== 'completed' ? ` (${status})` : ''}: ${fmtCi(count)}${sojourn.mean != null ? `; average time in system ${fmt(sojourn.mean)} ${timeUnit}` : ''}`);
  }
  return lines;
}

const SHARE_METRIC = /utili[sz]ation|ratio|rate|share|pct|percent/i;
const TIME_METRIC = /wait|sojourn|timeInSystem|avgSvc|service/i;

// The model's own goals, evaluated per replication with Flow's goal code:
// value with CI, the target, and how many replications met it.
export function goalLines(model, results) {
  if (!(model.goals || []).length || results.length === 0) return [];
  const perRep = results.map(r => buildGoalGapsFromResults(model, r) || []);
  const goals = perRep[0];
  if (!goals.length) return [];
  const lines = ['', 'Goals:'];
  goals.forEach((g, i) => {
    const values = perRep.map(rep => rep[i]?.current);
    const ci = confidenceInterval95(values);
    const metCount = perRep.filter(rep => rep[i]?.met).length;
    const asShare = SHARE_METRIC.test(g.metric) && Math.abs(g.target) <= 1;
    const unit = TIME_METRIC.test(g.metric) && model.timeUnit ? ` ${model.timeUnit}` : '';
    const bare = v => (asShare ? fmt(v * 100) : fmt(v));
    const suffix = asShare ? '%' : unit;
    const show = v => `${bare(v)}${suffix}`;
    if (ci.mean == null) { lines.push(`- ${g.label}: can't be evaluated from this run`); return; }
    const value = ci.lower == null ? show(ci.mean) : `${show(ci.mean)} (95% CI ${bare(Math.max(0, ci.lower))}–${bare(ci.upper)}${suffix})`;
    const verdict = metCount === results.length ? 'met in every replication' : metCount === 0 ? 'missed in every replication' : `met in ${metCount} of ${results.length} replications`;
    lines.push(`- ${metCount === results.length ? '✓' : metCount === 0 ? '✗' : '~'} ${g.label}: ${value} vs target ${g.operator} ${show(g.target)} — ${verdict}`);
  });
  return lines;
}

export async function run(args, folder) {
  const { model } = await modelFrom(args, folder);
  const { errors, text } = validationReport(model);
  if (errors.length) return `Not run — fix these first.\n${text}`;
  const settings = runSettings(model, args);
  return summariseRun(model, settings, runReplicationsSync(model, settings));
}

// ── Comparing two versions ─────────────────────────────────────────────────

// Per-replication values for every metric worth comparing: the headline
// KPIs, each queue's average wait, each resource's utilisation.
function comparableMetrics(model, results, timeUnit) {
  const metrics = new Map();
  for (const [key, label, isTime] of KPI_ROWS) {
    metrics.set(key, { label, unit: isTime ? timeUnit : '', share: key === 'summary.servedRatio', values: results.map(r => r.summary?.[key.split('.')[1]]) });
  }
  const perRep = results.map(r => buildKpis(model, r));
  for (const q of perRep[0]?.queues || []) {
    metrics.set(`queue:${q.name}`, { label: `${q.name}: average wait`, unit: timeUnit, values: perRep.map(k => k.queues?.find(x => x.name === q.name)?.meanWait) });
  }
  for (const res of perRep[0]?.resources || []) {
    metrics.set(`resource:${res.name}`, { label: `${res.name}: share of time busy`, share: true, values: perRep.map(k => { const u = k.resources?.find(x => x.name === res.name)?.utilisation; return u == null ? null : u / 100; }) });
  }
  return metrics;
}

// Runs both versions with the SAME settings and random numbers (seed i in
// both — common random numbers), so the paired differences isolate the
// change itself. Differences get paired 95% intervals with Flow's own
// Bonferroni correction across all compared metrics (as Flow's scenario
// comparison does), so "real difference" means the same as in the app.
export function compareRuns(modelA, modelB, settings, runA, runB, labels = { a: 'A', b: 'B' }) {
  const timeUnit = modelA.timeUnit || 'time units';
  const n = Math.min(runA.results.length, runB.results.length);
  const lines = [`Compared "${labels.a}" (A) and "${labels.b}" (B): ${n} paired replications of ${fmt(settings.maxSimTime)} ${timeUnit} each, same random numbers in both (seeds ${settings.baseSeed}–${settings.baseSeed + n - 1}), A's run settings for both.`];
  for (const [tag, run] of [['A', runA], ['B', runB]]) {
    if (run.failures.length) lines.push(`${tag}: ${run.failures.length} replication(s) failed: ${[...new Set(run.failures.map(f => f.message))].slice(0, 2).join(' | ')}`);
  }
  if (n < 2) { lines.push('Need at least 2 replications of each to compare.'); return lines.join('\n'); }
  const mA = comparableMetrics(modelA, runA.results.slice(0, n), timeUnit);
  const mB = comparableMetrics(modelB, runB.results.slice(0, n), timeUnit);
  const rows = [];
  for (const [key, a] of mA) {
    const b = mB.get(key);
    if (!b) continue;
    const ca = confidenceInterval95(a.values);
    const cb = confidenceInterval95(b.values);
    if (ca.mean == null || cb.mean == null) continue;
    if (!ca.mean && !cb.mean) continue;
    rows.push({ key, a, ca, cb, ci: pairedTConfidenceInterval(b.values, a.values) });
  }
  const corrected = bonferroniCI(rows.map(r => r.ci), 0.05);
  const show = (v, row) => (row.a.share ? `${fmt(v * 100)}%` : `${fmt(v)}${row.a.unit ? ` ${row.a.unit}` : ''}`);
  const signed = (v, row) => `${v > 0 ? '+' : ''}${fmt(row.a.share ? v * 100 : v)}`;
  const unitOf = row => (row.a.share ? ' points' : row.a.unit ? ` ${row.a.unit}` : '');
  const showDiff = (v, row) => `${signed(v, row)}${unitOf(row)}`;
  const real = [];
  const chance = [];
  rows.forEach((row, i) => {
    const c = corrected[i];
    const line = `- ${row.a.label}: A ${show(row.ca.mean, row)} → B ${show(row.cb.mean, row)}`;
    if (c.meanDiff == null) { chance.push(`${line} (no spread to test)`); return; }
    const interval = c.correctedLower != null ? ` (95% CI ${signed(c.correctedLower, row)} to ${signed(c.correctedUpper, row)}${unitOf(row)})` : '';
    const text = `${line}; difference ${showDiff(c.meanDiff, row)}${interval}`;
    (c.significant95 ? real : chance).push(text);
  });
  lines.push('', 'Real differences (the interval excludes zero, after correcting for comparing several measures at once):', ...(real.length ? real : ['- none']));
  lines.push('', 'Could be chance (the interval includes zero — run more replications to tell):', ...(chance.length ? chance : ['- none']));
  const goalsA = goalLines(modelA, runA.results.slice(0, n));
  const goalsB = goalLines(modelB, runB.results.slice(0, n));
  if (goalsA.length) lines.push('', 'Goals in A:', ...goalsA.slice(2));
  if (goalsB.length) lines.push('', 'Goals in B:', ...goalsB.slice(2));
  return lines.join('\n');
}

export async function compare(args, folder) {
  const a = await modelFrom({ model: args.modelA, file: args.fileA }, folder);
  const b = await modelFrom({ model: args.modelB, file: args.fileB }, folder);
  for (const [tag, m] of [['A', a], ['B', b]]) {
    const { errors, text } = validationReport(m.model);
    if (errors.length) return `Not run — version ${tag} has errors.\n${text}`;
  }
  const settings = runSettings(a.model, { replications: 20, ...args });
  const half = { budgetMs: RUN_BUDGET_MS / 2 };
  const runA = runReplicationsSync(a.model, settings, half);
  const runB = runReplicationsSync(b.model, { ...settings, replications: runA.results.length || settings.replications }, half);
  return compareRuns(a.model, b.model, settings, runA, runB, { a: args.labelA || a.name || 'A', b: args.labelB || b.name || 'B' });
}

// ── Results over time ──────────────────────────────────────────────────────

export const DEFAULT_PERIODS = 8;

// Time-weighted average of a step series over each period: the engine
// samples state at event times, and each value holds until the next sample.
export function periodAverages(samples, read, start, end, periods) {
  const width = (end - start) / periods;
  const sums = new Array(periods).fill(0);
  const covered = new Array(periods).fill(0);
  for (let i = 0; i < samples.length; i++) {
    const v = read(samples[i]);
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const t0 = Math.max(start, samples[i].t);
    const t1 = Math.min(end, i + 1 < samples.length ? samples[i + 1].t : end);
    if (t1 <= t0) continue;
    for (let k = Math.max(0, Math.floor((t0 - start) / width)); k < periods; k++) {
      const p0 = start + k * width;
      const p1 = p0 + width;
      if (p0 >= t1) break;
      const overlap = Math.min(t1, p1) - Math.max(t0, p0);
      if (overlap > 0) { sums[k] += v * overlap; covered[k] += overlap; }
    }
  }
  return sums.map((s, k) => (covered[k] > 0 ? s / covered[k] : null));
}

// Table cells: whole numbers for big values, one decimal for small ones,
// and 0 for anything that rounds to it (an "0.00059" queue is empty).
function cell(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a < 0.05) return '0';
  return a >= 10 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1);
}

function table(header, rows) {
  const all = [header, ...rows];
  const widths = header.map((_, c) => Math.max(...all.map(r => String(r[c] ?? '').length)));
  return all.map(r => r.map((cell, c) => (c === 0 ? String(cell).padEnd(widths[c]) : String(cell ?? '—').padStart(widths[c]))).join('  ')).join('\n');
}

// Queue lengths, resource utilisation and work in progress per period,
// averaged across replications — answers "when does it go wrong?".
export function summariseOverTime(model, settings, run, periods = DEFAULT_PERIODS) {
  const timeUnit = model.timeUnit || 'time units';
  const reps = run.results.filter(r => Array.isArray(r.timeSeries) && r.timeSeries.length);
  if (!reps.length) return 'No time series was recorded for this run.';
  const start = settings.warmupPeriod || 0;
  const end = settings.maxSimTime;
  const width = (end - start) / periods;
  const avg = read => {
    const perRep = reps.map(r => periodAverages(r.timeSeries, read, start, end, periods));
    return perRep[0].map((_, k) => {
      const vals = perRep.map(p => p[k]).filter(v => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  };
  const rows = [];
  const queues = (model.queues || []).map(q => q.name).filter(Boolean).slice(0, 10);
  for (const q of queues) rows.push([`Waiting in ${q}`, ...avg(s => s.byQueue?.[q]?.waiting).map(cell)]);
  const servers = (model.entityTypes || []).filter(e => e.role === 'server').map(e => e.name).slice(0, 8);
  for (const sName of servers) {
    rows.push([`${sName} busy %`, ...avg(s => { const b = s.byType?.[sName]; const avail = b ? b.total - (b.failed || 0) : 0; return avail > 0 ? (b.busy / avail) * 100 : null; }).map(cell)]);
  }
  rows.push(['In system (WIP)', ...avg(s => s.wip).map(cell)]);
  for (const c of (model.containerTypes || []).map(c => c.name).filter(Boolean).slice(0, 4)) {
    rows.push([`${c} level`, ...avg(s => s.byContainer?.[c]).map(cell)]);
  }
  const header = ['', ...Array.from({ length: periods }, (_, k) => `${fmt(start + k * width)}–${fmt(start + (k + 1) * width)}`)];
  return [
    `Over time: average of ${reps.length} replication${reps.length === 1 ? '' : 's'}, ${periods} equal periods of ${fmt(width)} ${timeUnit}${start ? ` after a ${fmt(start)} warm-up` : ''}. Each cell is the time-weighted average during that period.`,
    '',
    table(header, rows),
  ].join('\n');
}

export const MAX_PERIODS = 24;

export async function runOverTime(args, folder) {
  const { model } = await modelFrom(args, folder);
  const { errors, text } = validationReport(model);
  if (errors.length) return `Not run — fix these first.\n${text}`;
  const settings = runSettings(model, { replications: 5, ...args });
  const periods = Math.min(MAX_PERIODS, Math.max(2, Math.round(num(args.periods, DEFAULT_PERIODS))));
  const run = runReplicationsSync(model, settings, { collectTimeSeries: true });
  const failed = run.failures.length ? `\n${run.failures.length} replication(s) failed: ${run.failures[0].message}` : '';
  return summariseOverTime(model, settings, run, periods) + failed;
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
