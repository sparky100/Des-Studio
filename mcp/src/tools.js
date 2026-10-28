// The Flow MCP server's tools, as plain functions (no MCP SDK here), so the
// repo's own test suite can exercise them directly. server.js wires them to
// MCP. Everything runs on the user's computer: models are JSON files in one
// folder, in the same format Flow exports and imports.
//
// The engine, validator, KPI extraction and confidence intervals are Flow's
// own (src/engine, src/llm/prompts.js), so numbers here match the app.

import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { buildEngine } from '../../src/engine/index.js';
import { validateModel } from '../../src/engine/validation.js';
import { estimateRunComplexity, estimateMaxCycles } from '../../src/engine/complexity-estimator.js';
import { confidenceInterval95, summarizeReplicationResults, SUMMARY_METRICS, pairedTConfidenceInterval, bonferroniCI, buildWaitDistEntry, buildHistogram } from '../../src/engine/statistics.js';
import { pickModelJsonFields } from '../../src/model/modelJsonFields.js';
import { backingStatus, buildBackableUnits, coverageSummary, recordDisplayName } from '../../src/engine/backing-links.js';
import { backingRegisterWarnings } from '../../src/engine/backing-warnings.js';
import { buildImportLink } from '../../src/utils/importLink.js';
import { buildKpis, buildGoalGapsFromResults } from '../../src/llm/prompts.js';
import { enumerateSweepableParams, applySweepValue, isIntegerParamType } from '../../src/engine/sweep-params.js';

/* global __FLOW_MCP_VERSION__, __FLOW_MCP_BUILD__ */
// package.json is the one place the version is set: the bundle has it built
// in (build.mjs); run from source, it is read from there.
export const VERSION = typeof __FLOW_MCP_VERSION__ !== 'undefined'
  ? __FLOW_MCP_VERSION__
  : JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// The commit the bundle was built from ("dev" when run from source).
export const BUILD = typeof __FLOW_MCP_BUILD__ !== 'undefined' ? __FLOW_MCP_BUILD__ : 'dev';
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
  const sourceModelId = typeof payload.sourceModelId === 'string' && payload.sourceModelId ? payload.sourceModelId : null;
  return { name, description, sourceModelId, model: { name, description, ...pickModelJsonFields(source) } };
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
  const { name, description, sourceModelId, model } = await readModelFile(folder, file);
  const counts = ['entityTypes', 'queues', 'bEvents', 'cEvents', 'stateVariables', 'containerTypes', 'goals']
    .map(k => `${(model[k] || []).length} ${k}`).join(', ');
  const { name: _n, description: _d, graph: _g, ...body } = model;
  const origin = sourceModelId ? '\nExported from a model in Flow: flow_open_in_app can update that model.' : '';
  return `"${name || file}"${description ? ` — ${description}` : ''}\n${counts}${origin}\n\n${JSON.stringify(body, null, 2)}`;
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

// What the model's evidence and assumptions cover, as text: the headline
// coverage, the arrival and capacity parameters nothing backs, the contested
// assumptions, and the V-BACK warnings. Read-only.
export async function evidenceCoverage(args, folder) {
  const { model } = await modelFrom(args, folder);
  const opts = { schedules: model.schedules || [] };
  const summary = coverageSummary(model, opts);
  const links = model.backingLinks || [];
  const units = buildBackableUnits(model, opts);
  const keyUnbacked = units.filter(u => u.kind === 'parameter'
    && (u.impact === 'arrival' || u.impact === 'capacity')
    && backingStatus(links, u.targetType, u.targetId, u.targetPath) === 'unbacked');
  const contested = (model.assumptions || []).filter(a => a.contested);
  const warnings = backingRegisterWarnings(model);
  const hasRecords = (model.evidence || []).length + (model.assumptions || []).length > 0;

  const lines = [
    `Evidence coverage: ${summary.evidenced} of ${summary.total} elements and parameters evidenced (${summary.percentEvidenced}%), ${summary.assumed} assumption only, ${summary.unbacked} unbacked.`,
  ];
  if (!hasRecords) {
    lines.push('', 'Nothing is recorded yet. Give each arrival rate, capacity and routing choice that was not sourced from the user an assumption, and attach it to its parameter in the model JSON (see flow_get_schema section 16).');
  }
  if (keyUnbacked.length) {
    lines.push('', 'Arrival and capacity parameters with no evidence or assumption:');
    for (const u of keyUnbacked.slice(0, 20)) lines.push(`- ${u.label} · ${u.paramLabel}`);
    if (keyUnbacked.length > 20) lines.push(`- and ${keyUnbacked.length - 20} more`);
  }
  if (contested.length) {
    lines.push('', 'Contested assumptions:');
    for (const a of contested) lines.push(`- ${recordDisplayName(a)}: ${a.text || ''}`.trimEnd());
  }
  if (warnings.length) {
    lines.push('', 'Warnings:');
    for (const w of warnings) lines.push(`- ${w.code}: ${w.message}`);
  }
  return lines.join('\n');
}

// ── Running ────────────────────────────────────────────────────────────────

function num(v, fallback) {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : fallback;
}

// The settings a run uses: the call's overrides, else the model's own
// experiment defaults, else Flow's defaults. A model set to stop on a rule
// runs, as in Flow, with no time limit (maxSimTime null) unless the call
// gives one, which then caps the run.
export function runSettings(model, args = {}) {
  const ed = model.experimentDefaults || {};
  const replications = Math.min(MAX_REPLICATIONS, Math.max(1, Math.round(num(args.replications, DEFAULT_REPLICATIONS))));
  const terminationCondition = ed.terminationMode === 'condition' ? (ed.terminationCondition || null) : null;
  return {
    replications,
    maxSimTime: num(args.maxSimTime, terminationCondition ? null : num(ed.maxSimTime, 500)),
    warmupPeriod: num(args.warmupPeriod, num(ed.warmupPeriod, 0)),
    baseSeed: Math.round(num(args.seed, num(ed.seed, 12345))),
    terminationCondition,
  };
}

// "480 minutes", or "until its stop rule is met" for a model that stops on
// a rule (with the cap, when the call set one).
export function runLength(settings, timeUnit) {
  if (!settings.terminationCondition) return `${fmt(settings.maxSimTime)} ${timeUnit}`;
  return `until its stop rule is met${settings.maxSimTime != null ? ` (at most ${fmt(settings.maxSimTime)} ${timeUnit})` : ''}`;
}

// "seeds 7–9", "seed 7", or the actual list when some were skipped.
export function seedList(seeds) {
  if (!seeds.length) return 'no seeds';
  if (seeds.length === 1) return `seed ${seeds[0]}`;
  const contiguous = seeds.every((s, i) => i === 0 || s === seeds[i - 1] + 1);
  return contiguous ? `seeds ${seeds[0]}–${seeds[seeds.length - 1]}` : `seeds ${seeds.join(', ')}`;
}

// Engine options for a batch replication: like Flow's batch runs, no event
// trace and no per-entity detail (neither is read from a batch result, and
// both cost time and memory on every replication).
const BATCH_ENGINE_OPTIONS = { collectTrace: false, entityDetail: false };

export function maxCyclesFor(model, settings) {
  return estimateMaxCycles(estimateRunComplexity(model, {
    terminationMode: settings.terminationCondition ? 'condition' : 'time',
    maxSimTime: settings.maxSimTime,
    replications: 1,
  }));
}

// Runs `settings.replications` replications (seed = baseSeed + index, as
// Flow's replication runner does), stopping early if the time budget runs out.
// `seeds[i]` is the seed `results[i]` ran with, so a failed replication
// never shifts which runs get paired across versions.
export function runReplicationsSync(model, settings, { budgetMs = RUN_BUDGET_MS, now = Date.now, collectTimeSeries = false } = {}) {
  const maxCycles = maxCyclesFor(model, settings);
  const started = now();
  const results = [];
  const seeds = [];
  const failures = [];
  for (let i = 0; i < settings.replications; i++) {
    if (i > 0 && now() - started > budgetMs) break;
    const seed = settings.baseSeed + i;
    try {
      const engine = buildEngine(model, seed, settings.warmupPeriod, settings.maxSimTime, settings.terminationCondition, maxCycles, 5000, collectTimeSeries, undefined, BATCH_ENGINE_OPTIONS);
      results.push(engine.runAll());
      seeds.push(seed);
    } catch (e) {
      failures.push({ seed, message: e?.message || String(e) });
    }
  }
  return { results, seeds, failures, elapsedMs: now() - started };
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
  const seeds = run.seeds || results.map((_, i) => settings.baseSeed + i);
  lines.push(`Ran ${n} replication${n === 1 ? '' : 's'} ${settings.terminationCondition ? '' : 'of '}${runLength(settings, timeUnit)}` +
    `${settings.warmupPeriod ? `, warm-up ${fmt(settings.warmupPeriod)}` : ', no warm-up'}, ${seedList(seeds)}.`);
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
  const run = runReplicationsSync(model, settings);
  const summary = summariseRun(model, settings, run);
  if (args.format === 'json') return JSON.stringify({ summary, ...runDetail(model, run) }, null, 2);
  if (!args.detail || !run.results.length) return summary;
  const d = runDetail(model, run);
  const lines = [summary, '', `Each replication (for a chart of the spread across runs), as CSV:`, '```csv', toCsv(d.perReplication.columns, d.perReplication.rows), '```'];
  for (const q of d.waitDistribution) {
    lines.push('', `${q.queue}: wait times of all ${q.n} who queued, pooled across replications — median ${fmt(q.p50)}, 90th percentile ${fmt(q.p90)}, 95th ${fmt(q.p95)}, 99th ${fmt(q.p99)} ${d.timeUnit}. Histogram as CSV:`, '```csv', toCsv(['from', 'to', 'count'], q.histogram.map(b => [b.from, b.to, b.count])), '```');
  }
  return lines.join('\n');
}

const round4 = v => (Number.isFinite(v) ? Number(v.toPrecision(4)) : null);

function toCsv(columns, rows) {
  const esc = v => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [columns.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

export const HISTOGRAM_BINS = 12;

// The data behind a run's charts: each replication's headline results,
// queue waits and resource utilisation (the spread across runs), and each
// queue's wait times pooled across replications (percentiles and a
// histogram). Plain function, so tests/mcp checks it directly.
export function runDetail(model, run) {
  const { results } = run;
  const seeds = run.seeds || [];
  const perRep = results.map(r => buildKpis(model, r));
  const queues = (perRep[0]?.queues || []).map(q => q.name);
  const resources = (perRep[0]?.resources || []).map(r => r.name);
  const kpis = KPI_ROWS.filter(([key]) => results.some(r => Number.isFinite(r.summary?.[key.split('.')[1]]) && (!['summary.totalCost', 'summary.reneged', 'summary.balked'].includes(key) || r.summary[key.split('.')[1]])));
  const columns = ['replication', 'seed', ...kpis.map(([, label]) => label), ...queues.map(q => `${q}: average wait`), ...resources.map(r => `${r}: % busy`)];
  const rows = results.map((r, i) => [
    i + 1, seeds[i] ?? null,
    ...kpis.map(([key]) => round4(r.summary?.[key.split('.')[1]])),
    ...queues.map(q => round4(perRep[i].queues?.find(x => x.name === q)?.meanWait)),
    ...resources.map(name => round4(perRep[i].resources?.find(x => x.name === name)?.utilisation)),
  ]);
  const waitDistribution = [];
  const names = [...new Set(results.flatMap(r => Object.keys(r.waitDist || {})))];
  for (const q of names) {
    const pooled = results.flatMap(r => r.waitDist?.[q]?.values || []).filter(Number.isFinite).sort((a, b) => a - b);
    if (!pooled.length) continue;
    const d = buildWaitDistEntry(pooled);
    const h = buildHistogram(pooled, { numBins: HISTOGRAM_BINS });
    waitDistribution.push({
      queue: q, n: d.n, mean: round4(d.mean), p50: round4(d.p50), p90: round4(d.p90), p95: round4(d.p95), p99: round4(d.p99),
      histogram: (h.bins || []).map(b => ({ from: round4(b.low), to: round4(b.high), count: b.count })),
    });
  }
  return { timeUnit: model.timeUnit || 'time units', perReplication: { columns, rows }, waitDistribution };
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
// Pairs the two runs by seed: only seeds that succeeded in both versions
// are compared, so a failed replication in either never misaligns the pairs.
export function pairBySeed(settings, runA, runB) {
  const seedsOf = run => run.seeds || run.results.map((_, i) => settings.baseSeed + i);
  const bySeedB = new Map(seedsOf(runB).map((seed, i) => [seed, runB.results[i]]));
  const seeds = [];
  const a = [];
  const b = [];
  seedsOf(runA).forEach((seed, i) => {
    if (!bySeedB.has(seed)) return;
    seeds.push(seed); a.push(runA.results[i]); b.push(bySeedB.get(seed));
  });
  return { seeds, a, b };
}

export function compareRuns(modelA, modelB, settings, runA, runB, labels = { a: 'A', b: 'B' }) {
  const timeUnit = modelA.timeUnit || 'time units';
  const paired = pairBySeed(settings, runA, runB);
  const n = paired.seeds.length;
  const lines = [`Compared "${labels.a}" (A) and "${labels.b}" (B): ${n} paired replications ${settings.terminationCondition ? '' : 'of '}${runLength(settings, timeUnit)} each, same random numbers in both (${seedList(paired.seeds)}), A's run settings for both.`];
  for (const [tag, run] of [['A', runA], ['B', runB]]) {
    if (run.failures.length) lines.push(`${tag}: ${run.failures.length} replication(s) failed: ${[...new Set(run.failures.map(f => f.message))].slice(0, 2).join(' | ')}`);
  }
  if (n < 2) { lines.push('Need at least 2 replications of each to compare.'); return lines.join('\n'); }
  const mA = comparableMetrics(modelA, paired.a, timeUnit);
  const mB = comparableMetrics(modelB, paired.b, timeUnit);
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
  const goalsA = goalLines(modelA, paired.a);
  const goalsB = goalLines(modelB, paired.b);
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
  // B covers the seeds A got through (A may have stopped early on time).
  const lastSeedA = runA.seeds.length ? runA.seeds[runA.seeds.length - 1] : null;
  const runB = runReplicationsSync(b.model, { ...settings, replications: lastSeedA != null ? lastSeedA - settings.baseSeed + 1 : settings.replications }, half);
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

// The over-time series behind flow_run_over_time: per period, the
// time-weighted average across replications of each queue's waiting count,
// each resource's % busy, work in progress and container levels.
export function overTimeData(model, settings, run, periods = DEFAULT_PERIODS) {
  const reps = run.results.filter(r => Array.isArray(r.timeSeries) && r.timeSeries.length);
  if (!reps.length) return { error: 'No time series was recorded for this run.' };
  const start = settings.warmupPeriod || 0;
  // A run that stops on a rule has no fixed length: cover the longest one.
  const end = settings.maxSimTime ?? Math.max(...reps.map(r => Number(r.finalTime) || 0));
  if (!(end > start)) return { error: 'The run ended before the warm-up did, so there is nothing to show over time.' };
  const width = (end - start) / periods;
  const avg = read => {
    const perRep = reps.map(r => periodAverages(r.timeSeries, read, start, end, periods));
    return perRep[0].map((_, k) => {
      const vals = perRep.map(p => p[k]).filter(v => v != null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    });
  };
  const series = [];
  const queues = (model.queues || []).map(q => q.name).filter(Boolean).slice(0, 10);
  for (const q of queues) series.push({ name: `Waiting in ${q}`, values: avg(s => s.byQueue?.[q]?.waiting) });
  const servers = (model.entityTypes || []).filter(e => e.role === 'server').map(e => e.name).slice(0, 8);
  for (const sName of servers) {
    series.push({ name: `${sName} busy %`, values: avg(s => { const b = s.byType?.[sName]; const avail = b ? b.total - (b.failed || 0) : 0; return avail > 0 ? (b.busy / avail) * 100 : null; }) });
  }
  series.push({ name: 'In system (WIP)', values: avg(s => s.wip) });
  for (const c of (model.containerTypes || []).map(c => c.name).filter(Boolean).slice(0, 4)) {
    series.push({ name: `${c} level`, values: avg(s => s.byContainer?.[c]) });
  }
  return {
    timeUnit: model.timeUnit || 'time units',
    replications: reps.length,
    warmup: start,
    periods: Array.from({ length: periods }, (_, k) => ({ from: round4(start + k * width), to: round4(start + (k + 1) * width) })),
    series: series.map(x => ({ ...x, values: x.values.map(round4) })),
  };
}

// Up to this many periods the answer is a table; beyond it, CSV (one row
// per period), which stays readable and goes straight into a chart.
const TABLE_PERIODS = 12;

export function summariseOverTime(model, settings, run, periods = DEFAULT_PERIODS) {
  const d = overTimeData(model, settings, run, periods);
  if (d.error) return d.error;
  const width = d.periods[0].to - d.periods[0].from;
  const intro = `Over time: average of ${d.replications} replication${d.replications === 1 ? '' : 's'}, ${periods} equal periods of ${fmt(width)} ${d.timeUnit}${d.warmup ? ` after a ${fmt(d.warmup)} warm-up` : ''}. Each value is the time-weighted average during that period.`;
  if (periods > TABLE_PERIODS) {
    const rows = d.periods.map((p, k) => [p.from, p.to, ...d.series.map(x => x.values[k])]);
    return [intro, 'One row per period, as CSV for a chart:', '```csv', toCsv(['from', 'to', ...d.series.map(x => x.name)], rows), '```'].join('\n');
  }
  const header = ['', ...d.periods.map(p => `${fmt(p.from)}–${fmt(p.to)}`)];
  return [intro, '', table(header, d.series.map(x => [x.name, ...x.values.map(cell)]))].join('\n');
}

export const MAX_PERIODS = 100;

export async function runOverTime(args, folder) {
  const { model } = await modelFrom(args, folder);
  const { errors, text } = validationReport(model);
  if (errors.length) return `Not run — fix these first.\n${text}`;
  const settings = runSettings(model, { replications: 5, ...args });
  const periods = Math.min(MAX_PERIODS, Math.max(2, Math.round(num(args.periods, DEFAULT_PERIODS))));
  const run = runReplicationsSync(model, settings, { collectTimeSeries: true });
  if (args.format === 'json') return JSON.stringify({ ...overTimeData(model, settings, run, periods), failures: run.failures }, null, 2);
  const failed = run.failures.length ? `\n${run.failures.length} replication(s) failed: ${run.failures[0].message}` : '';
  return summariseOverTime(model, settings, run, periods) + failed;
}

// ── Sweeping a parameter ───────────────────────────────────────────────────

export const MAX_SWEEP_POINTS = 12;
export const MAX_SWEEP_RUNS = 200;
export const DEFAULT_SWEEP_REPLICATIONS = 5;

// Flow's own list of what a Study can vary (server counts, shift and
// schedule capacities, queue and container capacities, distribution
// parameters, state-variable starting values), so a sweep here changes the
// model exactly as Flow's Studies do.
function paramLine(p) {
  return `- ${p.label}${p.subLabel ? ` (${p.subLabel})` : ''} — now ${p.currentValue}`;
}

export function listParamsText(params) {
  if (!params.length) return 'This model has nothing Flow can vary (no servers, capacities or distribution parameters).';
  return `Parameters you can vary (pass one as \`parameter\`, by its name as shown):\n${params.map(paramLine).join('\n')}`;
}

// Exact name (or path), then a unique partial match; anything else lists
// what exists.
export function findParam(params, query) {
  const q = String(query || '').trim().toLowerCase();
  const exact = params.filter(p => p.label.toLowerCase() === q || String(p.path).toLowerCase() === q);
  if (exact.length === 1) return exact[0];
  const partial = params.filter(p => `${p.label} ${p.subLabel || ''}`.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  const which = partial.length > 1 ? `"${query}" matches ${partial.length} parameters` : `No parameter matches "${query}"`;
  throw new ToolError(`${which}.\n${listParamsText(partial.length > 1 ? partial : params)}`);
}

// The values to try: `values` as given, or from–to in steps of `step`.
// Whole numbers only for counts and capacities.
export function sweepValues(args, param) {
  let values;
  if (Array.isArray(args.values) && args.values.length) {
    values = args.values.map(Number);
  } else if (args.from != null && args.to != null) {
    const from = Number(args.from);
    const to = Number(args.to);
    const step = Math.abs(Number(args.step ?? 1)) || 1;
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new ToolError('`from` and `to` must be numbers.');
    values = [];
    const dir = to >= from ? 1 : -1;
    for (let v = from; dir > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += dir * step) {
      values.push(+v.toFixed(6));
      if (values.length > MAX_SWEEP_POINTS) break;
    }
  } else {
    throw new ToolError('Give `values` (e.g. [2, 3, 4]) or `from`, `to` and optionally `step`.');
  }
  if (values.some(v => !Number.isFinite(v))) throw new ToolError('Every value must be a number.');
  if (isIntegerParamType(param.type)) values = values.map(v => Math.round(v));
  values = [...new Set(values)];
  if (values.length > MAX_SWEEP_POINTS) throw new ToolError(`That is more than ${MAX_SWEEP_POINTS} values. Use a coarser step or fewer values.`);
  return values;
}

// "12.3 ±1.4": the mean and the 95% half-width.
function meanPm(ci, scale = 1) {
  if (!ci || ci.mean == null) return '—';
  return ci.halfWidth != null ? `${fmt(ci.mean * scale)} ±${fmt(ci.halfWidth * scale)}` : fmt(ci.mean * scale);
}

// One row per value: completions, waits, time in system, each resource's
// share of time busy and how many goals were met in every replication.
// Every value runs on the same seeds, so differences between rows come from
// the parameter, not from different random numbers.
export function summariseSweep(model, param, settings, points) {
  const timeUnit = model.timeUnit || 'time units';
  const resources = (model.entityTypes || []).filter(e => e.role === 'server').map(e => e.name).slice(0, 4);
  const goals = model.goals || [];
  const header = ['Value', 'Completed', `Avg wait (${timeUnit})`, `Time in system (${timeUnit})`, ...resources.map(r => `${r} busy %`), ...(goals.length ? ['Goals met'] : [])];
  const rows = [];
  const notes = [];
  const goalMet = goals.map(() => []);
  for (const pt of points) {
    if (pt.error) { notes.push(`- ${pt.value}: not run — ${pt.error}`); continue; }
    const { results } = pt.run;
    if (!results.length) { notes.push(`- ${pt.value}: every replication failed (${pt.run.failures[0]?.message || 'unknown error'})`); continue; }
    const agg = summarizeReplicationResults(results, SUMMARY_METRICS);
    const perRep = results.map(r => buildKpis(pt.model, r));
    const util = name => confidenceInterval95(perRep.map(k => { const u = k.resources?.find(x => x.name === name)?.utilisation; return u == null ? null : u / 100; }));
    let goalCell = [];
    if (goals.length) {
      const gaps = results.map(r => buildGoalGapsFromResults(pt.model, r) || []);
      const metAll = goals.map((_, i) => gaps.every(g => g[i]?.met));
      metAll.forEach((met, i) => { if (met) goalMet[i].push(pt.value); });
      goalCell = [`${metAll.filter(Boolean).length}/${goals.length}`];
    }
    rows.push([String(pt.value), meanPm(agg['summary.served']), meanPm(agg['summary.avgWait']), meanPm(agg['summary.avgTimeInSystem']),
      ...resources.map(r => meanPm(util(r), 100)), ...goalCell]);
    if (pt.run.failures.length) notes.push(`- ${pt.value}: ${pt.run.failures.length} replication(s) failed`);
    if (pt.run.results.length < settings.replications && !pt.run.failures.length) notes.push(`- ${pt.value}: stopped after ${pt.run.results.length} replications (time limit)`);
  }
  const lines = [
    `Varied "${param.label}" (now ${param.currentValue}): ${points.length} values × ${settings.replications} replications ${settings.terminationCondition ? '' : 'of '}${runLength(settings, timeUnit)}${settings.warmupPeriod ? `, warm-up ${fmt(settings.warmupPeriod)}` : ''}. Every value uses the same random numbers (${seedList(Array.from({ length: settings.replications }, (_, i) => settings.baseSeed + i))}), so the rows differ only because of the parameter. Cells are mean ±95% half-width.`,
    '',
    rows.length ? table(header, rows) : 'No value ran successfully.',
  ];
  if (goals.length) {
    lines.push('', 'Values where each goal was met in every replication:');
    goals.forEach((g, i) => lines.push(`- ${g.label || g.metric}: ${goalMet[i].length ? goalMet[i].join(', ') : 'none'}`));
  }
  if (notes.length) lines.push('', 'Notes:', ...notes);
  lines.push('', 'To check one value against another properly, use flow_compare_models on the two versions.');
  return lines.join('\n');
}

export async function sweep(args, folder) {
  const { model } = await modelFrom(args, folder);
  const { errors, text } = validationReport(model);
  if (errors.length) return `Not run — fix these first.\n${text}`;
  const params = enumerateSweepableParams(model);
  if (!args.parameter) return listParamsText(params);
  const param = findParam(params, args.parameter);
  const values = sweepValues(args, param);
  const settings = runSettings(model, { replications: DEFAULT_SWEEP_REPLICATIONS, ...args });
  if (values.length * settings.replications > MAX_SWEEP_RUNS) {
    throw new ToolError(`${values.length} values × ${settings.replications} replications is more than ${MAX_SWEEP_RUNS} runs. Use fewer values or replications.`);
  }
  const started = Date.now();
  const points = [];
  for (const value of values) {
    if (Date.now() - started > RUN_BUDGET_MS) { points.push({ value, error: 'skipped to stay within the time limit' }); continue; }
    const pointModel = applySweepValue(model, param, value);
    const pointErrors = validateModel(pointModel).errors;
    if (pointErrors.length) { points.push({ value, error: pointErrors.map(e => `[${e.code}] ${e.message}`).slice(0, 2).join('; ') }); continue; }
    const budgetMs = Math.max(1000, (RUN_BUDGET_MS - (Date.now() - started)) / (values.length - points.length));
    points.push({ value, model: pointModel, run: runReplicationsSync(pointModel, settings, { budgetMs }) });
  }
  return summariseSweep(model, param, settings, points);
}

// ── Tracing one run ────────────────────────────────────────────────────────

export const DEFAULT_TRACE_LINES = 80;
export const MAX_TRACE_LINES = 400;
// A traced run keeps every event in memory; beyond this many expected
// events, ask for a time window instead.
const MAX_TRACE_EVENTS = 200_000;

const clip = (t, n = 300) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

// Entity #12 in a log message, but not #123.
function mentionsEntity(text, id) {
  return new RegExp(`#${id}(?!\\d)`).test(text);
}

// What happened in one replication: how often each rule (C-event) and
// event (B-event) fired, which never did, who was still in the system at
// the end and why, one entity's path if asked, and the event log.
export function summariseTrace(model, settings, seed, result, { from = 0, until = Infinity, entity = null, limit = DEFAULT_TRACE_LINES } = {}) {
  const timeUnit = model.timeUnit || 'time units';
  const log = result.log || [];
  const end = log.find(l => l.phase === 'END');
  const lines = [`One replication (seed ${seed}), ended at t=${fmt(result.finalTime)} ${timeUnit}${end ? ` — ${end.message}` : ''}.`];

  // Rules: evaluated / condition true / fired.
  const cStats = new Map((model.cEvents || []).map(ce => [ce.id, { name: ce.name, checked: 0, true: 0, fired: 0 }]));
  const bFired = new Map((model.bEvents || []).map(be => [be.id, { name: be.name, fired: 0 }]));
  for (const l of log) {
    if (l.cEval) {
      const st = cStats.get(l.cEval.eventId);
      if (st) { st.checked++; if (l.cEval.conditionTrue) st.true++; if (l.event?.fired) st.fired++; }
    } else if (l.event?.type === 'B' && l.event.fired) {
      const st = bFired.get(l.event.id);
      if (st) st.fired++;
    }
  }
  if (cStats.size) {
    lines.push('', 'Rules (C-events):');
    for (const st of cStats.values()) {
      if (st.fired) lines.push(`- "${st.name}" fired ${st.fired} time${st.fired === 1 ? '' : 's'}`);
      else if (st.true) lines.push(`- "${st.name}" NEVER FIRED: its condition was true ${st.true} time${st.true === 1 ? '' : 's'} but its effect did nothing (check the queue, server type or entity filter it names)`);
      else lines.push(`- "${st.name}" NEVER FIRED: its condition was never true (checked ${st.checked} time${st.checked === 1 ? '' : 's'})`);
    }
  }
  if (bFired.size) {
    lines.push('', 'Events (B-events):');
    for (const st of bFired.values()) lines.push(`- "${st.name}" ${st.fired ? `happened ${st.fired} time${st.fired === 1 ? '' : 's'}` : 'NEVER HAPPENED (nothing scheduled it, or not before the run ended)'}`);
  }

  // Still in the system at the end, grouped by where and in what state.
  const customers = (result.entitySummary || []).filter(e => e.role !== 'server' && e.status !== 'done' && e.status !== 'reneged' && e.status !== 'balked');
  if (customers.length) {
    const groups = new Map();
    for (const e of customers) {
      const where = e.status === 'serving' ? `being served${e.lastQueue ? ` after ${e.lastQueue}` : ''}` : `${e.status} in ${e.queue || e.lastQueue || '(no queue)'}`;
      const g = groups.get(where) || [];
      g.push(e);
      groups.set(where, g);
    }
    lines.push('', 'Still in the system at the end:');
    for (const [where, es] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const oldest = es.reduce((a, b) => ((a.arrivalTime ?? 0) <= (b.arrivalTime ?? 0) ? a : b));
      lines.push(`- ${es.length} ${where}; longest there since t=${fmt(oldest.lastStageStart ?? oldest.arrivalTime ?? 0)} (e.g. #${oldest.id}, ${oldest.type})`);
    }
  }

  // One entity's path.
  if (entity != null) {
    const e = (result.entitySummary || []).find(x => x.id === entity);
    if (!e) {
      lines.push('', `Entity #${entity} doesn't exist in this run.`);
    } else {
      lines.push('', `Entity #${e.id} (${e.type}): arrived t=${fmt(e.arrivalTime ?? 0)}, now ${e.status}${e.queue ? ` in ${e.queue}` : ''}.`);
      if (Object.keys(e.attrs || {}).length) lines.push(`  Attributes: ${clip(JSON.stringify(e.attrs), 200)}`);
      for (const st of e.stages || []) {
        lines.push(`  - ${st.queueName || '?'} → ${st.serverType || '?'}: waited ${fmt(st.stageWait ?? 0)}, served ${fmt(st.stageService ?? 0)}${st.interrupted ? ' (interrupted)' : ''}`);
      }
    }
  }

  // Event log: B-events and C-events that fired, in the window, optionally
  // only those that mention the entity.
  const events = log.filter(l => l.event?.fired && l.time >= from && l.time <= until && (entity == null || mentionsEntity(l.message || '', entity)));
  const scope = `${from > 0 || until < Infinity ? `t=${fmt(from)}–${until < Infinity ? fmt(until) : 'end'}` : 'whole run'}${entity != null ? `, entity #${entity}` : ''}`;
  lines.push('', `Event log (${scope}; ${events.length} event${events.length === 1 ? '' : 's'}):`);
  for (const l of events.slice(0, limit)) lines.push(`t=${fmt(l.time)}  ${clip(l.message || '')}`);
  if (events.length > limit) lines.push(`…${events.length - limit} more. Narrow it with from/until or entity, or raise limit (up to ${MAX_TRACE_LINES}).`);

  const warnings = [...new Set((result.warnings || []).map(w => (typeof w === 'string' ? w : w?.message)).filter(Boolean))];
  if (warnings.length) lines.push('', 'Engine warnings:', ...warnings.slice(0, 8).map(w => `- ${w}`));
  return lines.join('\n');
}

export async function traceRun(args, folder) {
  const { model } = await modelFrom(args, folder);
  const { errors, text } = validationReport(model);
  if (errors.length) return `Not run — fix these first.\n${text}`;
  const settings = runSettings(model, { ...args, replications: 1 });
  const from = Math.max(0, num(args.from, 0));
  const until = num(args.until, null);
  if (until != null && until <= from) throw new ToolError('`until` must be after `from`.');
  // Nothing after `until` is shown, so the run can stop there.
  const runSettingsForTrace = { ...settings, maxSimTime: until != null && (settings.maxSimTime == null || until < settings.maxSimTime) ? until : settings.maxSimTime };
  const estimate = estimateRunComplexity(model, { terminationMode: runSettingsForTrace.terminationCondition ? 'condition' : 'time', maxSimTime: runSettingsForTrace.maxSimTime, replications: 1 });
  if ((Number(estimate?.estimatedBEventFirings) || 0) > MAX_TRACE_EVENTS) {
    throw new ToolError(`This run is too long to trace in full (about ${fmt(estimate.estimatedBEventFirings)} events). Give \`until\` (and optionally \`from\`) to trace a stretch of it.`);
  }
  const entity = args.entity != null ? Math.round(Number(args.entity)) : null;
  const limit = Math.min(MAX_TRACE_LINES, Math.max(1, Math.round(num(args.limit, DEFAULT_TRACE_LINES))));
  const engine = buildEngine(model, settings.baseSeed, settings.warmupPeriod, runSettingsForTrace.maxSimTime, settings.terminationCondition,
    maxCyclesFor(model, runSettingsForTrace), 5000, false, undefined, { collectTrace: true, entityDetail: true });
  const result = engine.runAll();
  return summariseTrace(model, settings, settings.baseSeed, result, { from, until: until ?? Infinity, entity, limit });
}

// ── Editing a saved model ──────────────────────────────────────────────────

export const MAX_EDIT_CHANGES = 50;

// "entityTypes/Nurse/count" → ['entityTypes', 'Nurse', 'count']. A leading
// slash is optional; "~1" is a literal "/" and "~0" a literal "~" (as in
// JSON Pointer), for names that contain a slash.
export function parsePath(p) {
  const raw = String(p ?? '').trim().replace(/^\//, '');
  if (!raw) throw new ToolError('Every change needs a `path`, e.g. "entityTypes/Nurse/count".');
  return raw.split('/').map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

// An array element by index, id, or name (case-insensitive).
function arrayIndex(arr, seg, at) {
  if (/^\d+$/.test(seg)) {
    const i = Number(seg);
    if (i < arr.length) return i;
  }
  let i = arr.findIndex(x => x && typeof x === 'object' && x.id === seg);
  if (i < 0) i = arr.findIndex(x => x && typeof x === 'object' && String(x.name ?? '').trim().toLowerCase() === seg.trim().toLowerCase());
  if (i < 0) {
    const names = arr.map((x, k) => (x && typeof x === 'object' ? x.name ?? x.id ?? k : k)).slice(0, 20).join(', ');
    throw new ToolError(`"${at}" has no "${seg}". It has: ${names || 'nothing'}.`);
  }
  return i;
}

const show = v => (v === undefined ? '(not set)' : clip(JSON.stringify(v), 120));

// Applies one change in place: op "set" (default; creates the last key, or
// appends with "-" on an array), "remove", or "append" (adds to the array at
// path). Returns a one-line description.
export function applyChange(model, change) {
  const op = change?.op || 'set';
  if (!['set', 'remove', 'append'].includes(op)) throw new ToolError(`Unknown op "${op}" — use set, remove or append.`);
  if (op !== 'remove' && !('value' in (change || {}))) throw new ToolError(`The change to "${change?.path}" needs a \`value\`.`);
  const segs = parsePath(change.path);
  let node = model;
  for (let k = 0; k < segs.length - 1; k++) {
    const at = segs.slice(0, k + 1).join('/');
    const seg = segs[k];
    const next = Array.isArray(node) ? node[arrayIndex(node, seg, segs.slice(0, k).join('/') || '(model)')] : node?.[seg];
    if (next == null || typeof next !== 'object') throw new ToolError(`"${at}" doesn't exist${next != null ? ' or is not an object or list' : ''}.`);
    node = next;
  }
  const last = segs[segs.length - 1];
  const parentPath = segs.slice(0, -1).join('/') || '(model)';
  if (op === 'append') {
    const arr = Array.isArray(node) ? node[arrayIndex(node, last, parentPath)] : node[last];
    if (!Array.isArray(arr)) throw new ToolError(`"${change.path}" is not a list, so nothing can be appended to it.`);
    arr.push(change.value);
    return `${change.path}: appended ${show(change.value)}`;
  }
  if (Array.isArray(node)) {
    if (op === 'set' && last === '-') { node.push(change.value); return `${change.path}: appended ${show(change.value)}`; }
    const i = arrayIndex(node, last, parentPath);
    const before = node[i];
    if (op === 'remove') { node.splice(i, 1); return `${change.path}: removed ${show(before)}`; }
    node[i] = change.value;
    return `${change.path}: ${show(before)} → ${show(change.value)}`;
  }
  const before = node[last];
  if (op === 'remove') {
    if (!(last in node)) throw new ToolError(`"${change.path}" doesn't exist.`);
    delete node[last];
    return `${change.path}: removed ${show(before)}`;
  }
  node[last] = change.value;
  return `${change.path}: ${show(before)} → ${show(change.value)}`;
}

// Validation messages that appear in `after` but not in `before`, and the
// reverse, so the assistant sees what its edit changed.
function issueDiff(before, after) {
  const key = i => `${i.code}|${i.message}`;
  const had = new Set(before.map(key));
  const has = new Set(after.map(key));
  return { added: after.filter(i => !had.has(key(i))), fixed: before.filter(i => !has.has(key(i))) };
}

export async function editModel(args, folder) {
  if (!args.file) throw new ToolError('Give the `file` to edit (a model in your Flow models folder). To change a model you hold as JSON, edit it and use flow_save_model.');
  const changes = Array.isArray(args.changes) ? args.changes : [];
  if (!changes.length) throw new ToolError('Give at least one change, e.g. { "path": "entityTypes/Nurse/count", "value": 3 }.');
  if (changes.length > MAX_EDIT_CHANGES) throw new ToolError(`At most ${MAX_EDIT_CHANGES} changes at a time.`);
  const { full, name, description, sourceModelId, model } = await readModelFile(folder, args.file);
  const original = JSON.parse(await readFile(full, 'utf8'));
  const graph = (original?.model_json ?? original)?.graph ?? null;
  const edited = structuredClone(model);
  const done = [];
  for (const [i, change] of changes.entries()) {
    try { done.push(applyChange(edited, change)); }
    catch (e) { throw new ToolError(`Change ${i + 1} (${change?.path ?? 'no path'}) not applied, and nothing was saved: ${e.message}`); }
  }
  const before = validateModel(model);
  const after = validationReport(edited);
  const errs = issueDiff(before.errors, after.errors);
  const warns = issueDiff(before.warnings, after.warnings);
  const lines = [`Changes to "${name || args.file}":`, ...done.map(d => `- ${d}`), ''];
  if (errs.added.length) lines.push('New errors:', ...errs.added.map(issueLine));
  if (errs.fixed.length) lines.push('Errors fixed:', ...errs.fixed.map(issueLine));
  if (warns.added.length) lines.push(`New warnings (${warns.added.length}):`, ...warns.added.slice(0, 15).map(issueLine));
  lines.push(after.errors.length ? `${after.errors.length} error${after.errors.length === 1 ? '' : 's'} in total after the change.` : 'No errors after the change.');
  if (args.dryRun) return [...lines, '', 'Dry run: nothing was saved.'].join('\n');
  if (after.errors.length && !args.allowErrors) {
    return [...lines, '', 'Not saved — the edited model has errors. Fix them in the same call, or pass allowErrors: true to save a work in progress.'].join('\n');
  }
  const envelope = exportEnvelope({ name: name || path.basename(full, '.json'), description, model: edited, graph, sourceModelId });
  await writeFile(full, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return [...lines, '', `Saved over ${full}. To see the change in Flow, use flow_open_in_app${sourceModelId ? ' (it offers to update the model it was exported from)' : ''}, or import the file (+ New Model → Import a file).`].join('\n');
}

// ── Saving ─────────────────────────────────────────────────────────────────

export function safeFileName(name) {
  const cleaned = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || 'Untitled model';
}

// The same envelope Flow's own Export writes, so Flow's Import (and anyone
// reading the file) treats it like any other exported model.
// `graph` is the canvas layout (positions only; Flow derives the structure
// from the model), kept when editing a file Flow exported.
// `sourceModelId` is the Flow model the file was exported from; kept through
// edits so flow_open_in_app can offer to update that model.
export function exportEnvelope({ name, description, model, graph = null, sourceModelId = null }, exportedAt = new Date().toISOString()) {
  const payload = {
    name: name || 'Untitled model',
    model_json: { ...pickModelJsonFields(model), graph },
    exportedAt,
    appVersion: `flow-mcp ${VERSION}+${BUILD}`,
  };
  if (description) payload.description = description;
  if (sourceModelId) payload.sourceModelId = sourceModelId;
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
  // Overwriting a file exported from Flow keeps its link to that model.
  let sourceModelId = null;
  if (args.overwrite) {
    try { sourceModelId = normaliseModelInput(await readFile(full, 'utf8')).sourceModelId; } catch { /* new file, or not a model */ }
  }
  await writeFile(full, `${JSON.stringify(exportEnvelope({ name, description, model: input.model, sourceModelId }), null, 2)}\n`, 'utf8');
  const status = errors.length
    ? `with ${errors.length} error${errors.length === 1 ? '' : 's'} (Flow will import it, but it won't run until they're fixed)`
    : warnings.length ? `with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : 'with no errors or warnings';
  return `Saved "${name}" as ${full} ${status}.\nTo open it in Flow: flow_open_in_app with file "${file}", or + New Model → Import a file → choose "${file}".`;
}

// ── Opening in Flow ────────────────────────────────────────────────────────

export const DEFAULT_APP_URL = 'https://des.simmodlr.app';
// Comfortably under what browsers accept in a URL (Chrome: 2 MB).
export const MAX_LINK_CHARS = 1_500_000;

// A local page that sends the browser on to the import link. Going through a
// file, rather than passing the link to the OS, avoids Windows' 8,191
// character command-line limit; the model stays in the URL fragment, which
// the browser never sends to a server.
export function redirectPage(link, name) {
  const safe = JSON.stringify(link).replace(/</g, '\\u003c');
  const title = String(name || 'model').replace(/[<>&"]/g, '');
  return `<!doctype html>\n<meta charset="utf-8">\n<title>Opening ${title} in Flow…</title>\n<p>Opening ${title} in Flow… If nothing happens, <a id="go">click here</a>.</p>\n<script>const u=${safe};document.getElementById('go').href=u;location.replace(u);</script>\n`;
}

/**
 * Builds the "open in Flow" link for a model file and opens it in the
 * browser. `deps` is for tests: { openFile(path), tempDir }.
 */
export async function openInApp(args, folder, deps = {}) {
  if (!args.file) throw new ToolError('Give the `file` to open (a model in your Flow models folder). Save a new model with flow_save_model first.');
  const { name, description, sourceModelId, model } = await readModelFile(folder, args.file);
  const { errors } = validateModel(model);
  const targetId = args.asNew ? null : sourceModelId;
  const appUrl = deps.appUrl || process.env.FLOW_APP_URL || DEFAULT_APP_URL;
  const link = await buildImportLink({ ...model, name, description }, { baseUrl: appUrl, targetId });
  if (link.length > MAX_LINK_CHARS) {
    return `"${name || args.file}" is too large to open with a link. Import the file in Flow instead: + New Model → Import a file → choose "${args.file}".`;
  }
  const dir = deps.tempDir || path.join(os.tmpdir(), 'flow-mcp');
  await mkdir(dir, { recursive: true });
  const page = path.join(dir, 'open-in-flow.html');
  await writeFile(page, redirectPage(link, name), 'utf8');
  // FLOW_MCP_NO_BROWSER=1 (tests, headless setups) writes the page without opening it.
  const opener = deps.openFile || (process.env.FLOW_MCP_NO_BROWSER === '1' ? () => { throw new Error('disabled'); } : openWithSystem);
  let opened = true;
  try { await opener(page); } catch { opened = false; }
  const lines = [
    opened ? `Opened "${name || args.file}" in Flow in the browser.` : `Couldn't open the browser. Ask the person to open this file in their browser: ${page}`,
    targetId
      ? 'Flow shows a preview. Because the file was exported from Flow, the person can choose "Update" to replace that model (the current one is kept as a version first) or save it as a new model.'
      : 'Flow shows a preview, and the person chooses "Save to my models" to add it to their library.',
    'The person must be signed in to Flow in that browser; the model goes straight from this computer to the browser and is not sent anywhere else.',
  ];
  if (errors.length) lines.push(`Note: the model has ${errors.length} validation error${errors.length === 1 ? '' : 's'}; Flow will import it but it won't run until they're fixed.`);
  return lines.join('\n');
}

export function openWithSystem(file) {
  const [cmd, cmdArgs] = process.platform === 'win32' ? ['explorer.exe', [file]]
    : process.platform === 'darwin' ? ['open', [file]]
    : ['xdg-open', [file]];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
