// reports/reportGenerator.js — Self-contained HTML report generator

import { callLLMOnce } from '../llm/apiClient.js';
import {
  buildModelDescriptionPrompt,
  buildReportRecommendationsPrompt,
  parseReportRecommendations,
  buildGoalGaps,
} from '../llm/prompts.js';
import { simToWall, formatWallTime } from '../engine/clockUtils.js';

// ── Utilities ──────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  try {
    const d = new Date(iso || Date.now());
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(iso || ''); }
}

function sanitizeFilename(name) {
  return String(name || 'report').replace(/[/\\:*?"<>|]/g, '-');
}

function fin(value, decimals = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(decimals) : null;
}

function timeVal(value, unit) {
  const s = fin(value, 1);
  return s !== null ? `${s} ${unit}` : null;
}

function getSummary(results = {}) {
  return results.summary || results.results?.summary || {};
}

// Formats at most 1 decimal place; returns null if not finite
function formatN(value) {
  const n = Number(value);
  return Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : null;
}

// Always returns a whole-number string — used for entity counts (served, reneged)
function formatInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? String(Math.round(n)) : null;
}

// Formats a decimal ratio (0–1) as a percentage string
function formatPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : null;
}

// Formats financial values in English: £1.24 million, £45.34 thousand, £123
function formatCurrency(value, symbol = '£') {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(2)} million`;
  if (abs >= 1_000)     return `${symbol}${(n / 1_000).toFixed(2)} thousand`;
  return `${symbol}${n.toFixed(2)}`;
}

// For multi-rep runs, use the aggregateStats mean rather than the single-run value.
function resolveValue(metricPath, summary, aggStats = {}) {
  const key = `summary.${metricPath}`;
  const agg = aggStats[key];
  if (agg && Number.isFinite(agg.mean) && agg.n >= 2) return agg.mean;
  return summary[metricPath];
}

const COST_METRICS = new Set(['totalCost', 'costPerServed']);

function formatMetric(metricPath, summary, aggStats, unit) {
  const val = resolveValue(metricPath, summary, aggStats);
  if (val == null || !Number.isFinite(Number(val))) return null;
  if (COST_METRICS.has(metricPath)) return formatCurrency(val);
  return formatN(val);
}

function outcomeRows(summary = {}) {
  return Object.entries(summary.outcomes || {})
    .map(([routeId, outcome]) => ({
      routeId,
      routeLabel: outcome.routeLabel || routeId,
      status: outcome.status || '',
      endedBy: outcome.endedBy || '',
      count: Number(outcome.count) || 0,
      avgWait: Number.isFinite(outcome.avgWait) ? outcome.avgWait : null,
      avgSojourn: Number.isFinite(outcome.avgSojourn) ? outcome.avgSojourn : null,
    }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count || a.routeLabel.localeCompare(b.routeLabel));
}

// Returns the display name of the non-resource (customer/train/patient) entity type.
function getEntityName(model) {
  const et = (model.entityTypes || []).find(e => e.role === 'customer');
  return et?.name || 'Entity';
}

// Detects whether arrivals are plan-based (timetable) or stochastic (distribution).
function detectArrivalMode(model, summary) {
  if (summary.avgPlanDeviation != null) return 'plan';
  const hasTimetable = (model.bEvents || []).some(ev =>
    (ev.schedules || []).some(s =>
      s.rows?.length > 0 ||
      s.times?.length > 0 ||
      s.distParams?.rows?.length > 0 ||
      s.distParams?.times?.length > 0 ||
      s.scheduleRef ||
      s.dist === 'Schedule'
    )
  );
  return hasTimetable ? 'plan' : 'stochastic';
}

// Extracts distribution label from the first B-event schedule that names one.
function getArrivalDistInfo(model) {
  for (const ev of (model.bEvents || [])) {
    for (const s of (ev.schedules || [])) {
      if (s.dist) {
        const params = s.distParams || {};
        const parts = Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ');
        return parts ? `${s.dist} (${parts})` : s.dist;
      }
    }
  }
  return null;
}

// Aggregates mean service time per queue from entitySummary stages.
function computePerQueueServiceTimes(results) {
  const entitySummary = results.entitySummary || [];
  const byQueue = {};
  entitySummary.forEach(entity => {
    if (entity.status !== 'done') return;
    (entity.stages || []).forEach(stage => {
      const q = stage.queueName;
      if (!q) return;
      if (!byQueue[q]) byQueue[q] = [];
      if (Number.isFinite(stage.stageService) && stage.stageService >= 0) {
        byQueue[q].push(stage.stageService);
      }
    });
  });
  const out = {};
  Object.keys(byQueue).forEach(q => {
    const vals = byQueue[q];
    if (!vals.length) return;
    out[q] = { n: vals.length, mean: vals.reduce((a, b) => a + b, 0) / vals.length };
  });
  return out;
}

// Splits a label into word-wrapped lines for SVG text.
function wrapSvgLabel(text, maxLen = 20) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  words.forEach(w => {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length <= maxLen) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = w.length > maxLen ? w.substring(0, maxLen - 1) + '…' : w;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// Histogram of entity arrival times from entitySummary — used for plan-based models.
function buildArrivalPatternChart(results, experimentConfig, unit, width = 560) {
  const entities = results.entitySummary || [];
  const warmup = Number(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0);
  const arrivals = entities
    .filter(e => e.role === 'customer' && Number.isFinite(e.arrivalTime) && e.arrivalTime >= warmup)
    .map(e => e.arrivalTime);
  if (arrivals.length < 2) return '';

  const minT = Math.min(...arrivals);
  const maxT = Math.max(...arrivals);
  const range = maxT - minT;
  if (range <= 0) return '';

  const numBuckets = Math.min(30, Math.max(8, Math.ceil(arrivals.length / 8)));
  const bucketSize = range / numBuckets;
  const counts = new Array(numBuckets).fill(0);
  arrivals.forEach(t => {
    const bucket = Math.min(numBuckets - 1, Math.floor((t - minT) / bucketSize));
    counts[bucket]++;
  });

  const m = { top: 32, right: 16, bottom: 48, left: 44 };
  const height = 180;
  const cW = width - m.left - m.right;
  const cH = height - m.top - m.bottom;
  const maxCount = Math.max(1, ...counts);
  const barW = cW / numBuckets;

  let bars = '', xLabels = '', yAxis = '';
  counts.forEach((count, i) => {
    const bh = (count / maxCount) * cH;
    const bx = (m.left + i * barW).toFixed(1);
    const by = (m.top + cH - bh).toFixed(1);
    if (bh > 0) bars += `<rect x="${bx}" y="${by}" width="${Math.max(1, barW - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="#2563eb" opacity="0.7" rx="1"/>`;
  });

  const labelStep = Math.ceil(numBuckets / 6);
  for (let i = 0; i <= numBuckets; i += labelStep) {
    const t = (minT + i * bucketSize).toFixed(0);
    const x = (m.left + i * barW).toFixed(1);
    xLabels += `<text x="${x}" y="${(m.top + cH + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="sans-serif">${t}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const v = Math.round(maxCount * i / 4);
    const ty = (m.top + cH - (v / maxCount) * cH).toFixed(1);
    yAxis += `<line x1="${m.left - 4}" y1="${ty}" x2="${(m.left + cW).toFixed(1)}" y2="${ty}" stroke="${i === 0 ? '#9ca3af' : '#e5e7eb'}" stroke-width="1"/>`;
    yAxis += `<text x="${(m.left - 6).toFixed(1)}" y="${(Number(ty) + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#9ca3af" font-family="sans-serif">${v}</text>`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">Arrival Pattern (arrivals per ${esc(unit)} period)</text>
    ${yAxis}
    <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + cH}" stroke="#9ca3af" stroke-width="1.5"/>
    ${bars}${xLabels}
    <text x="${m.left + cW / 2}" y="${(m.top + cH + 36).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="sans-serif">${esc(unit)}</text>
  </svg>`;
}

// Line chart of system load (entities waiting) over simulation time from timeSeries.
function buildTimeSeriesChart(timeSeries, unit, width = 560) {
  if (!Array.isArray(timeSeries) || timeSeries.length < 2) return '';

  const points = timeSeries.map(pt => {
    const queueWaiting = Object.values(pt.byQueue || {}).reduce((s, q) => s + (q.waiting || 0), 0);
    const typeWaiting  = Object.values(pt.byType  || {}).reduce((s, t) => s + (t.waiting || 0), 0);
    return { t: pt.t, v: queueWaiting || typeWaiting };
  }).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
  if (points.length < 2) return '';

  const minT   = points[0].t;
  const maxT   = points[points.length - 1].t;
  const maxV   = Math.max(1, ...points.map(p => p.v));
  const tRange = maxT - minT || 1;
  const m = { top: 32, right: 16, bottom: 48, left: 44 };
  const height = 180;
  const cW = width - m.left - m.right;
  const cH = height - m.top - m.bottom;

  const toX = t => m.left + ((t - minT) / tRange) * cW;
  const toY = v => m.top + cH - (v / maxV) * cH;

  const pathPts = points.map(p => `${toX(p.t).toFixed(1)},${toY(p.v).toFixed(1)}`).join(' ');
  // Filled area under the line
  const areaStart = `${toX(points[0].t).toFixed(1)},${(m.top + cH).toFixed(1)}`;
  const areaEnd   = `${toX(points[points.length - 1].t).toFixed(1)},${(m.top + cH).toFixed(1)}`;
  const areaPath  = `${areaStart} ${pathPts} ${areaEnd}`;

  let xLabels = '', yAxis = '';
  for (let i = 0; i <= 6; i++) {
    const t = minT + (i / 6) * tRange;
    const x = toX(t).toFixed(1);
    xLabels += `<text x="${x}" y="${(m.top + cH + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="sans-serif">${t.toFixed(0)}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const v  = Math.round(maxV * i / 4);
    const ty = toY(v).toFixed(1);
    yAxis += `<line x1="${m.left - 4}" y1="${ty}" x2="${(m.left + cW).toFixed(1)}" y2="${ty}" stroke="${i === 0 ? '#9ca3af' : '#e5e7eb'}" stroke-width="1"/>`;
    yAxis += `<text x="${(m.left - 6).toFixed(1)}" y="${(Number(ty) + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#9ca3af" font-family="sans-serif">${v}</text>`;
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">System Load Over Time (entities waiting)</text>
    ${yAxis}
    <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + cH}" stroke="#9ca3af" stroke-width="1.5"/>
    <polygon points="${areaPath}" fill="#2563eb" opacity="0.12"/>
    <polyline points="${pathPts}" fill="none" stroke="#2563eb" stroke-width="1.8" stroke-linejoin="round"/>
    ${xLabels}
    <text x="${m.left + cW / 2}" y="${(m.top + cH + 36).toFixed(1)}" text-anchor="middle" font-size="9" fill="#6b7280" font-family="sans-serif">${esc(unit)}</text>
  </svg>`;
}

// ── SVG Charts ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

// Shorten a queue name for use as a chart axis label.
// Strips common suffixes that add length without adding meaning at chart scale.
function shortChartLabel(name) {
  return String(name || '')
    .replace(/\s+Approach\s+Queue$/i, '')
    .replace(/\s+Queue$/i, '')
    .replace(/\s+Approach$/i, '')
    .trim()
    .substring(0, 26)
    .trim();
}

function groupedBarChart({ groups, series, title, width = 580, height = 280 }) {
  if (!groups.length || !series.length) return '';
  const m = { top: 32, right: 16, bottom: 110, left: 52 };
  const cW = width - m.left - m.right;
  const cH = height - m.top - m.bottom;
  const maxVal = Math.max(1, ...groups.flatMap(g => g.values.map(v => (Number.isFinite(v) ? v : 0))));
  const scale = cH / maxVal;
  const groupW = cW / Math.max(groups.length, 1);
  const barW = Math.max(4, Math.min(28, (groupW * 0.85) / series.length - 3));

  let bars = '', xlabels = '', yAxis = '', legend = '';

  groups.forEach((g, gi) => {
    const gx = m.left + gi * groupW + (groupW - series.length * (barW + 3)) / 2;
    series.forEach((s, si) => {
      const val = g.values[si];
      if (!Number.isFinite(val)) return;
      const bh = Math.max(0, val * scale);
      const bx = (gx + si * (barW + 3)).toFixed(1);
      const by = (m.top + cH - bh).toFixed(1);
      bars += `<rect x="${bx}" y="${by}" width="${barW}" height="${bh.toFixed(1)}" fill="${CHART_COLORS[si % CHART_COLORS.length]}" rx="2" opacity="0.88"/>`;
      if (bh > 14) bars += `<text x="${(Number(bx) + barW / 2).toFixed(1)}" y="${(Number(by) - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#374151" font-family="sans-serif">${val.toFixed(1)}</text>`;
    });
    // Rotated x-axis label — use shortened name so long queue names remain legible
    const lx = (m.left + gi * groupW + groupW / 2).toFixed(1);
    const ly = (m.top + cH + 10).toFixed(1);
    xlabels += `<text x="${lx}" y="${ly}" text-anchor="end" font-size="10" fill="#6b7280" font-family="sans-serif" transform="rotate(-40,${lx},${ly})">${esc(shortChartLabel(g.label))}</text>`;
  });

  for (let i = 0; i <= 5; i++) {
    const v = maxVal * i / 5;
    const ty = (m.top + cH - v * scale).toFixed(1);
    yAxis += `<line x1="${m.left - 4}" y1="${ty}" x2="${(m.left + cW).toFixed(1)}" y2="${ty}" stroke="${i === 0 ? '#9ca3af' : '#e5e7eb'}" stroke-width="1"/>`;
    yAxis += `<text x="${(m.left - 7).toFixed(1)}" y="${(Number(ty) + 4).toFixed(1)}" text-anchor="end" font-size="9" fill="#9ca3af" font-family="sans-serif">${v.toFixed(1)}</text>`;
  }

  series.forEach((s, si) => {
    const lx = m.left + si * 90;
    const ly = height - 14;
    legend += `<rect x="${lx}" y="${ly - 9}" width="10" height="10" fill="${CHART_COLORS[si % CHART_COLORS.length]}" rx="2" opacity="0.88"/>`;
    legend += `<text x="${lx + 14}" y="${ly}" font-size="10" fill="#6b7280" font-family="sans-serif">${esc(s.label)}</text>`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">${esc(title)}</text>
    ${yAxis}
    <line x1="${m.left}" y1="${m.top}" x2="${m.left}" y2="${m.top + cH}" stroke="#9ca3af" stroke-width="1.5"/>
    ${bars}${xlabels}${legend}
  </svg>`;
}

function horizBarChart({ items, title, width = 520 }) {
  if (!items.length) return '';
  const m = { top: 32, right: 64, bottom: 16, left: 140 };
  const cW = width - m.left - m.right;

  // Pre-compute wrapped labels and per-row heights
  const rowData = items.map(item => {
    const lines = wrapSvgLabel(item.label, 20);
    return { ...item, lines, rH: Math.max(32, lines.length * 15 + 12) };
  });
  const totalItemH = rowData.reduce((s, r) => s + r.rH, 0);
  const height = m.top + m.bottom + totalItemH;

  let bars = '';
  let yOff = m.top;
  rowData.forEach(item => {
    const pct = Math.min(1, Math.max(0, Number(item.value) || 0));
    const color = pct >= 0.9 ? '#dc2626' : pct >= 0.75 ? '#d97706' : '#16a34a';
    const barMidY = yOff + item.rH / 2;
    bars += `<rect x="${m.left}" y="${(barMidY - 10).toFixed(1)}" width="${cW}" height="20" fill="#f3f4f6" rx="3"/>`;
    if (pct > 0.002) bars += `<rect x="${m.left}" y="${(barMidY - 10).toFixed(1)}" width="${(pct * cW).toFixed(1)}" height="20" fill="${color}" rx="3" opacity="0.85"/>`;
    // Multi-line label
    const lineH = 15;
    const totalTxtH = item.lines.length * lineH;
    const startY = barMidY - totalTxtH / 2 + lineH - 3;
    item.lines.forEach((ln, li) => {
      bars += `<text x="${m.left - 6}" y="${(startY + li * lineH).toFixed(1)}" text-anchor="end" font-size="11" fill="#374151" font-family="sans-serif">${esc(ln)}</text>`;
    });
    bars += `<text x="${m.left + cW + 8}" y="${(barMidY + 4).toFixed(1)}" font-size="11" font-weight="600" fill="${color}" font-family="sans-serif">${Math.round(pct * 100)}%</text>`;
    yOff += item.rH;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">${esc(title)}</text>
    ${bars}
  </svg>`;
}

function journeyBreakdownChart({ avgWait, avgSvc, unit = 'minutes', stages = null, width = 480 }) {
  const m = { top: 32, right: 80, bottom: 16, left: 140 };
  const rowH = 30;
  const cW = width - m.left - m.right;

  // Per-stage breakdown when multiple stages are provided
  if (stages && stages.length > 1) {
    const total = Math.max(1, ...stages.map(s => (Number(s.wait) || 0) + (Number(s.svc) || 0)));
    const height = m.top + m.bottom + stages.length * rowH * 2;
    let bars = '';
    stages.forEach((s, i) => {
      const waitVal = Number.isFinite(s.wait) ? Math.max(0, s.wait) : 0;
      const svcVal  = Number.isFinite(s.svc)  ? Math.max(0, s.svc)  : 0;
      const rows = [
        { label: `${s.label} — wait`,    val: waitVal, color: '#2563eb' },
        { label: `${s.label} — service`, val: svcVal,  color: '#16a34a' },
      ];
      rows.forEach((r, ri) => {
        const y = m.top + (i * 2 + ri) * rowH;
        bars += `<rect x="${m.left}" y="${y + 3}" width="${cW}" height="20" fill="#f3f4f6" rx="3"/>`;
        if (r.val > 0) bars += `<rect x="${m.left}" y="${y + 3}" width="${((r.val / total) * cW).toFixed(1)}" height="20" fill="${r.color}" rx="3" opacity="0.85"/>`;
        const lbl = r.label.length > 24 ? r.label.slice(0, 23) + '…' : r.label;
        bars += `<text x="${m.left - 6}" y="${y + 17}" text-anchor="end" font-size="10" fill="#374151" font-family="sans-serif">${esc(lbl)}</text>`;
        bars += `<text x="${m.left + cW + 8}" y="${y + 17}" font-size="11" font-weight="600" fill="${r.color}" font-family="sans-serif">${r.val.toFixed(1)}</text>`;
      });
    });
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">Journey Time Breakdown by Stage (${esc(unit)})</text>
      ${bars}
    </svg>`;
  }

  // Single overall breakdown
  const wait = Number.isFinite(Number(avgWait)) ? Math.max(0, Number(avgWait)) : 0;
  const svc  = Number.isFinite(Number(avgSvc))  ? Math.max(0, Number(avgSvc))  : 0;
  if (wait + svc === 0) return '';
  const height = m.top + m.bottom + 2 * rowH;
  const max = Math.max(wait, svc, 1);
  const rows = [
    { label: `Avg wait (${unit})`,    val: wait, color: '#2563eb', note: 'includes reneged & in-progress' },
    { label: `Avg service (${unit})`, val: svc,  color: '#16a34a', note: 'served entities only' },
  ];
  let bars = '';
  rows.forEach((r, i) => {
    const y = m.top + i * rowH;
    bars += `<rect x="${m.left}" y="${y + 3}" width="${cW}" height="20" fill="#f3f4f6" rx="3"/>`;
    if (r.val > 0) bars += `<rect x="${m.left}" y="${y + 3}" width="${((r.val / max) * cW).toFixed(1)}" height="20" fill="${r.color}" rx="3" opacity="0.85"/>`;
    bars += `<text x="${m.left - 6}" y="${y + 17}" text-anchor="end" font-size="11" fill="#374151" font-family="sans-serif">${esc(r.label)}</text>`;
    bars += `<text x="${m.left + cW + 8}" y="${y + 17}" font-size="11" font-weight="600" fill="${r.color}" font-family="sans-serif">${r.val.toFixed(1)}</text>`;
    if (r.note) bars += `<text x="${m.left + cW + 76}" y="${y + 17}" font-size="9" fill="#9ca3af" font-family="sans-serif">${r.note}</text>`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">Wait &amp; Service Time Metrics</text>
    ${bars}
  </svg>`;
}

// ── CSS ────────────────────────────────────────────────────────────────────────

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;font-size:13px;color:#1f2937;background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .report{max-width:880px;margin:0 auto;padding:32px 24px;background:#fff}
  .cover{background:#1e3a5f;color:#fff;padding:40px 48px;border-radius:8px;margin-bottom:32px}
  .cover h1{font-size:22px;font-weight:700;margin-bottom:14px;line-height:1.35}
  .cover .meta{font-size:12px;opacity:0.75;line-height:2.2}
  .cover .badge{display:inline-block;background:rgba(255,255,255,0.15);border-radius:4px;padding:2px 10px;font-size:11px;margin-top:10px}
  section{margin-bottom:32px}
  h2{font-size:15px;font-weight:700;color:#1e3a5f;border-bottom:2px solid #0e7490;padding-bottom:6px;margin-bottom:16px}
  h3{font-size:12px;font-weight:600;color:#374151;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.04em}
  .desc{background:#f8fafc;border-left:4px solid #0e7490;padding:12px 16px;font-style:italic;color:#374151;border-radius:0 6px 6px 0;margin-bottom:20px;line-height:1.6}
  .kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:20px}
  .kpi{background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;padding:12px 16px}
  .kpi .lbl{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px}
  .kpi .val{font-size:20px;font-weight:700;color:#1e3a5f}
  .goal-status{font-size:12px;margin:0 0 16px;padding:8px 12px;background:#f8fafc;border-radius:4px;border:1px solid #e2e8f0}
  .method-item{font-size:12px;color:#374151;margin-bottom:10px;line-height:1.6}
  .method-item strong{color:#1e3a5f}
  table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}
  thead th{background:#f1f5f9;color:#374151;font-weight:600;text-align:left;padding:8px 12px;border-bottom:2px solid #e2e8f0}
  tbody td{padding:7px 12px;border-bottom:1px solid #f1f5f9}
  tbody tr:last-child td{border-bottom:none}
  .rec{border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;margin-bottom:12px}
  .rec-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .rec-num{background:#1e3a5f;color:#fff;border-radius:50%;width:20px;height:20px;font-size:11px;font-weight:700;text-align:center;line-height:20px;flex-shrink:0}
  .rec-hl{font-weight:600;color:#111827;font-size:13px}
  .rec-conf{display:inline-block;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:4px;font-size:10px;padding:1px 6px}
  .rec-body{font-size:12px;color:#4b5563;line-height:1.6}
  .rec-body div{margin-top:4px}
  .chart-wrap{margin:16px 0;overflow-x:auto}
  .chart-wrap svg{max-width:100%}
  .model-img{text-align:center;margin:0 0 24px}
  .model-img img{max-width:100%;border:1px solid #e2e8f0;border-radius:6px}
  .model-img-cap{font-size:11px;color:#94a3b8;margin-top:6px}
  .note{font-size:11px;color:#6b7280;font-style:italic;margin:4px 0 12px}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
  @media print{
    body{background:#fff}
    .report{max-width:none;padding:0}
    .cover{border-radius:0;page-break-after:always}
    section{page-break-inside:avoid}
    h2{page-break-before:auto}
    .rec{page-break-inside:avoid}
    table{page-break-inside:auto}
    thead{display:table-header-group}
  }
`;

// ── HTML section builders ──────────────────────────────────────────────────────

function htmlTable(headers, rows) {
  if (!rows.length) return '<p class="note">No data available.</p>';
  const head = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map(c => `<td>${esc(String(c ?? '—'))}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function mdTable(headers, rows) {
  if (!rows.length) return '_No data available._\n';
  const head = `| ${headers.join(' | ')} |`;
  const sep  = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.map(c => String(c ?? '—').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}\n`;
}

function buildCover(model, runMeta, experimentConfig) {
  let periodLine = '';
  if (model.epoch) {
    const unit  = model.timeUnit || 'minutes';
    const start = formatWallTime(simToWall(0, model.epoch, unit));
    const end   = formatWallTime(simToWall(experimentConfig?.maxSimTime ?? 0, model.epoch, unit));
    if (start && end) periodLine = `<div><strong>Period:</strong> ${esc(start)} → ${esc(end)}</div>`;
  }
  return `
  <div class="cover">
    <h1>${esc(model.name || 'Simulation')} — Analysis Report</h1>
    <div class="meta">
      <div><strong>Run:</strong> ${esc(runMeta.runLabel || runMeta.runId || 'Unknown')}</div>
      <div><strong>Date:</strong> ${esc(formatDate(runMeta.runTimestamp))}</div>
      ${periodLine}
      <div><strong>Engine:</strong> simmodlr v${esc(runMeta.engineVersion || '1.0')}</div>
    </div>
    <span class="badge">CONFIDENTIAL</span>
  </div>`;
}

function buildModelImage(modelImageDataUrl) {
  if (!modelImageDataUrl) return '';
  return `
  <section>
    <h2>Model Diagram</h2>
    <div class="model-img">
      <img src="${modelImageDataUrl}" alt="Model diagram"/>
      <div class="model-img-cap">Visual Designer snapshot captured at report time</div>
    </div>
  </section>`;
}

function buildExecutiveSummary(model, results, recommendations, aggStats = {}, modelDescription = '') {
  const summary = getSummary(results);
  const unit = model.timeUnit || 'minutes';
  const entityName = getEntityName(model);

  const kpis = [
    { lbl: `${entityName}s served`,        val: formatInt(resolveValue('served',      summary, aggStats)) },
    { lbl: 'Reneged / abandoned',           val: formatInt(resolveValue('reneged',     summary, aggStats)) },
    { lbl: `Avg wait time (${unit})`,       val: formatN(resolveValue('avgWait',      summary, aggStats)) },
    { lbl: `Avg service time (${unit})`,    val: formatN(resolveValue('avgSvc',       summary, aggStats)) },
    { lbl: `Avg total time (${unit})`,      val: formatN(resolveValue('avgSojourn',   summary, aggStats)) },
    { lbl: `Avg time in system (${unit})`,  val: formatN(resolveValue('avgTimeInSystem', summary, aggStats)) },
    { lbl: 'Service completion rate',       val: formatPct(resolveValue('servedRatio', summary, aggStats)) },
  ].filter(k => k.val !== null);

  const kpiHtml = kpis.length ? `<div class="kpi-grid">${
    kpis.map(k => `<div class="kpi"><div class="lbl">${esc(k.lbl)}</div><div class="val">${esc(k.val)}</div></div>`).join('')
  }</div>` : '';

  // Goal status summary
  const goalGaps = buildGoalGaps(model, aggStats, { ...summary, waitDist: results?.waitDist, runtimeMetrics: results?.runtimeMetrics });
  let goalStatusHtml = '';
  if (Array.isArray(goalGaps) && goalGaps.length) {
    const met   = goalGaps.filter(g => g.met).length;
    const total = goalGaps.length;
    const icon  = met === total ? '✅' : met === 0 ? '❌' : '⚠️';
    goalStatusHtml = `<p class="goal-status"><strong>Goal status:</strong> ${icon} ${met} of ${total} performance target${total !== 1 ? 's' : ''} met</p>`;
  }

  const top = Array.isArray(recommendations) && recommendations.length
    ? (recommendations.find(r => r.priority === 1) || recommendations[0]) : null;

  const recHtml = top?.headline ? `
    <h3>Primary recommendation</h3>
    <div class="rec">
      <div class="rec-head"><span class="rec-num">1</span><span class="rec-hl">${esc(top.headline)}</span></div>
      ${top.finding ? `<div class="rec-body">${esc(top.finding)}</div>` : ''}
    </div>` : '';

  const descHtml = modelDescription ? `<div class="desc">${esc(modelDescription)}</div>` : '';

  return `
  <section>
    <h2>Executive Summary</h2>
    ${descHtml}
    ${kpiHtml}
    ${goalStatusHtml}
    ${recHtml}
  </section>`;
}

function buildMethodology(model, results, experimentConfig, aggStats = {}, type = 'technical') {
  const summary      = getSummary(results);
  const unit         = model.timeUnit || 'minutes';
  const entityName   = getEntityName(model);
  const arrivalMode  = detectArrivalMode(model, summary);
  const warmup       = Number(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0);
  const replications = Number(experimentConfig.replications ?? 1);
  const multiRep     = Object.values(aggStats).some(s => s?.n >= 2);
  const queueNames   = Object.keys(results.waitDist || {});
  const resourceTypes = Object.keys(summary.perResource || {});

  const parts = [];
  const MAX_LISTED = 3;

  // Scope sentence — list names only when count is small, summarise otherwise
  const qPart = queueNames.length
    ? queueNames.length <= MAX_LISTED
      ? `${queueNames.length} stage${queueNames.length !== 1 ? 's' : ''} (${queueNames.map(q => `<em>${esc(q)}</em>`).join(', ')})`
      : `${queueNames.length}-stage process`
    : null;
  const rPart = resourceTypes.length
    ? resourceTypes.length <= MAX_LISTED
      ? `${resourceTypes.length} resource type${resourceTypes.length !== 1 ? 's' : ''} (${resourceTypes.map(r => `<em>${esc(r)}</em>`).join(', ')})`
      : `${resourceTypes.length} resource types`
    : null;
  const scopeBody = [qPart, rPart].filter(Boolean).join(' served by ');
  if (scopeBody) {
    parts.push(`<p class="method-item">This analysis examines the flow of <strong>${esc(entityName)}s</strong> through ${scopeBody}.</p>`);
  }

  // Arrival pattern
  if (arrivalMode === 'plan') {
    parts.push(`<p class="method-item"><strong>Arrival pattern:</strong> ${esc(entityName)}s arrive according to a pre-planned timetable. Results reflect how the system performs against that specific schedule.</p>`);
    const arrivalChart = buildArrivalPatternChart(results, experimentConfig, unit);
    if (arrivalChart) parts.push(`<div class="chart-wrap">${arrivalChart}</div>`);
  } else {
    const distInfo = getArrivalDistInfo(model);
    const distText = distInfo
      ? ` drawn from a <strong>${esc(distInfo)}</strong> distribution`
      : ' modelled stochastically';
    parts.push(`<p class="method-item"><strong>Arrival pattern:</strong> ${esc(entityName)} inter-arrival times are${distText}. Each run uses a different random seed to generate a unique sequence of arrivals.</p>`);
  }

  // Warm-up
  if (warmup > 0) {
    parts.push(`<p class="method-item"><strong>Warm-up period:</strong> The first ${warmup} ${esc(unit)} of each run are excluded from statistics to remove start-up transient effects.</p>`);
  }

  // Replications
  if (multiRep && replications >= 2) {
    parts.push(`<p class="method-item"><strong>Replications:</strong> The model was run ${replications} times with different random seeds. Headline figures are averages across all replications${type === 'technical' ? '; 95% confidence intervals are shown in the results' : ''}.</p>`);
  }

  if (!parts.length) return '';

  return `
  <section>
    <h2>Scope &amp; Methodology</h2>
    ${parts.join('\n    ')}
  </section>`;
}

function buildExperimentConfig(experimentConfig, runMeta) {
  const rows = [
    ['Run label',      runMeta.runLabel || '—'],
    ['Run ID',         runMeta.runId   || '—'],
    ['Run date',       formatDate(runMeta.runTimestamp)],
    ['Random seed',    String(runMeta.seed ?? '—')],
    ['PRN algorithm',  runMeta.prnAlgorithm || 'mulberry32'],
    ['Engine version', runMeta.engineVersion || '1.0'],
    ['Warm-up period', String(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0)],
    ['Run duration',   String(experimentConfig.maxSimTime ?? experimentConfig.runDuration ?? '—')],
    ['Replications',   String(experimentConfig.replications ?? 1)],
    ['Termination',    experimentConfig.terminationMode || 'time'],
  ];
  return `
  <section>
    <h2>Experiment Configuration</h2>
    ${htmlTable(['Parameter', 'Value'], rows)}
  </section>`;
}

function buildResults(model, results, aggStats = {}, type = 'technical') {
  const isTechnical = type === 'technical';
  const summary      = getSummary(results);
  const waitDist     = results.waitDist || {};
  const ciStats      = results.aggregateStats || {};
  const unit         = model.timeUnit || 'minutes';
  const entityName   = getEntityName(model);
  const queueNames   = Object.keys(waitDist);
  const perResource  = summary.perResource || {};
  const resourceTypes = Object.keys(perResource);
  const outcomes = outcomeRows(summary);

  // Intro paragraph describing what is covered
  let introHtml = '';
  {
    const qPart = queueNames.length ? `${queueNames.length} queue${queueNames.length !== 1 ? 's' : ''}` : '';
    const rPart = resourceTypes.length ? `${resourceTypes.length} resource type${resourceTypes.length !== 1 ? 's' : ''}` : '';
    const coverageDesc = [qPart, rPart].filter(Boolean).join(' and ');
    const goalGapsPeek = buildGoalGaps(model, results.aggregateStats || {}, { ...summary, waitDist, runtimeMetrics: results?.runtimeMetrics });
    const goalNote = Array.isArray(goalGapsPeek) && goalGapsPeek.length
      ? ` Performance against ${goalGapsPeek.length} defined goal${goalGapsPeek.length !== 1 ? 's' : ''} is assessed below.`
      : '';
    if (coverageDesc) {
      introHtml = `<p class="note">The following results cover ${coverageDesc}. All values are post-warmup unless noted.${goalNote}</p>`;
    }
  }

  // Summary stats
  const metricRows = [
    [`${entityName}s completed service`,                              formatInt(resolveValue('served',      summary, aggStats))],
    [`${entityName}s reneged (abandoned)`,                           formatInt(resolveValue('reneged',     summary, aggStats))],
    [`Average waiting time (${unit})`,                               formatN(resolveValue('avgWait',      summary, aggStats))],
    [`Average service time (${unit})`,                               formatN(resolveValue('avgSvc',       summary, aggStats))],
    [`Average total time in system (${unit})`,                            formatN(resolveValue('avgSojourn',   summary, aggStats))],
    [`Average time in system incl. in-progress (${unit})`,            formatN(resolveValue('avgTimeInSystem', summary, aggStats))],
    [`Service completion rate`,                                      formatPct(resolveValue('servedRatio', summary, aggStats))],
    [`Total cost`,                                                   formatCurrency(resolveValue('totalCost',     summary, aggStats))],
    [`Cost per ${entityName.toLowerCase()} served`,                  formatCurrency(resolveValue('costPerServed', summary, aggStats))],
  ].filter(r => r[1] !== null);

  // Per-stage service times (computed from entitySummary when available)
  const perQueueSvc   = computePerQueueServiceTimes(results);
  const hasMultiStage = queueNames.length > 1;

  // Journey breakdown chart — per-stage when possible, overall otherwise
  let journeyChart = '';
  if (hasMultiStage && queueNames.some(q => perQueueSvc[q])) {
    const stageData = queueNames
      .map(q => ({ label: q, wait: waitDist[q]?.mean ?? 0, svc: perQueueSvc[q]?.mean ?? 0 }))
      .filter(s => s.wait > 0 || s.svc > 0);
    if (stageData.length) journeyChart = journeyBreakdownChart({ stages: stageData, unit });
  }
  if (!journeyChart) {
    journeyChart = journeyBreakdownChart({
      avgWait: resolveValue('avgWait', summary, aggStats),
      avgSvc:  resolveValue('avgSvc',  summary, aggStats),
      unit,
    });
  }

  // Queue wait-time table (average wait only)
  let waitChartHtml = '', waitTableHtml = '';
  if (queueNames.length) {
    const groups = queueNames.map(q => ({
      label:  q,
      values: [Number(waitDist[q]?.mean)].map(v => Number.isFinite(v) ? v : NaN),
    })).filter(g => g.values.some(v => Number.isFinite(v)));

    if (groups.length) {
      waitChartHtml = `<div class="chart-wrap">${groupedBarChart({
        groups,
        series: [{ label: 'Mean wait' }],
        title:  `Average Queue Wait Time (${unit})`,
      })}</div>`;
    }

    const showSvcCol = hasMultiStage && Object.keys(perQueueSvc).length > 0;
    const tableHeaders = showSvcCol
      ? ['Queue', 'Mean wait', 'Mean service']
      : ['Queue', 'Mean wait'];
    const tableRows = queueNames.map(q => {
      const w = waitDist[q] || {};
      const row = [q, fin(w.mean, 1) ?? '—'];
      if (showSvcCol) row.push(fin(perQueueSvc[q]?.mean, 1) ?? '—');
      return row;
    });
    waitTableHtml = htmlTable(tableHeaders, tableRows);
  }

  // Resource utilisation chart + table
  let utilChartHtml = '', utilTableHtml = '';
  if (resourceTypes.length) {
    utilChartHtml = `<div class="chart-wrap">${horizBarChart({
      items: resourceTypes.map(t => ({ label: t, value: perResource[t].utilisation ?? 0 })),
      title: 'Resource Utilisation',
    })}</div>`;
    const utilRows = resourceTypes.map(t => {
      const r = perResource[t];
      const pct = Number.isFinite(r.utilisation) ? `${Math.round(r.utilisation * 100)}%` : '—';
      const et = (model.entityTypes || []).find(e => e.name === t);
      const countCell = et?.shiftSchedule?.length
        ? `shift (${et.shiftSchedule.length} period${et.shiftSchedule.length !== 1 ? 's' : ''})`
        : String(r.total ?? '—');
      return [t, countCell, pct];
    });
    utilTableHtml = `<p class="note">Percentage of time each resource was busy (averaged across the run, excluding warm-up). Green &lt;75%, amber 75–90%, red &gt;90%.</p>
    ${htmlTable(['Resource type', 'Capacity', 'Utilisation'], utilRows)}`;
  }

  const outcomeHasTimings = outcomes.some(r => r.avgWait != null || r.avgSojourn != null);
  const outcomesHtml = outcomes.length
    ? `<h3>Journey outcomes</h3>
    <p class="note">How each entity concluded its journey through the model.</p>
    ${htmlTable(
      outcomeHasTimings
        ? ['Outcome', 'Avg wait', 'Avg time in system']
        : ['Outcome'],
      outcomes.map(row => outcomeHasTimings
        ? [row.routeLabel, row.avgWait != null ? formatN(row.avgWait) : '—', row.avgSojourn != null ? formatN(row.avgSojourn) : '—']
        : [row.routeLabel]
      )
    )}`
    : '';

  // Time-series load chart (shown when timeSeries data was collected)
  let timeSeriesHtml = '';
  {
    const tsChart = buildTimeSeriesChart(results.timeSeries, unit);
    if (tsChart) {
      timeSeriesHtml = `<h3>System load over time</h3>
      <p class="note">Entities waiting in the system at each point in time. Peaks indicate periods of high demand or congestion.</p>
      <div class="chart-wrap">${tsChart}</div>`;
    }
  }

  // Goal assessment
  const goalGaps = buildGoalGaps(model, results.aggregateStats || {}, { ...summary, waitDist, runtimeMetrics: results?.runtimeMetrics });
  let goalHtml = '';
  if (Array.isArray(goalGaps) && goalGaps.length) {
    const goalRows = goalGaps.map(g => [
      g.label || g.metric,
      `${g.operator} ${g.target}`,
      g.current != null ? (fin(g.current) ?? '—') : '—',
      g.met ? '✅ MET' : '❌ MISSED',
      g.gap    != null ? (fin(g.gap) ?? '—')     : '—',
    ]);
    goalHtml = `<h3>Performance Goal Assessment</h3>${htmlTable(['Goal', 'Target', 'Current', 'Status', 'Gap'], goalRows)}`;
  }

  // Confidence intervals — full table for technical report; summary sentence for management
  const ciKeys = Object.keys(ciStats).filter(k => ciStats[k]?.n >= 2);
  let ciHtml = '';
  if (ciKeys.length) {
    if (isTechnical) {
      const ciRows = ciKeys.map(k => {
        const s = ciStats[k];
        return [k, fin(s.mean, 1) ?? '—', fin(s.lower, 1) ?? '—', fin(s.upper, 1) ?? '—', String(s.n || '—')];
      });
      ciHtml = `<h3>Replication Confidence Intervals (95%)</h3>${htmlTable(['Metric', 'Mean', 'CI Lower', 'CI Upper', 'N'], ciRows)}`;
    } else {
      // Management report: derive a simple confidence level from CI half-widths
      const avgWaitStat = ciStats['summary.avgWait'];
      let confLevel = 'medium';
      if (avgWaitStat && Number.isFinite(avgWaitStat.mean) && avgWaitStat.mean > 0) {
        const halfWidth = ((avgWaitStat.upper ?? avgWaitStat.mean) - (avgWaitStat.lower ?? avgWaitStat.mean)) / 2;
        const relWidth  = halfWidth / avgWaitStat.mean;
        confLevel = relWidth < 0.10 ? 'high' : relWidth < 0.25 ? 'medium' : 'low';
      }
      const confLabel = { high: 'High — results are stable across replications and can be relied upon for decision-making.', medium: 'Medium — results show some variation across replications; treat headline figures as indicative.', low: 'Low — results vary significantly across replications; more runs or a longer warm-up period is recommended before drawing conclusions.' }[confLevel];
      ciHtml = `<h3>Result Confidence</h3><p class="note"><strong>${confLevel.charAt(0).toUpperCase() + confLevel.slice(1)} confidence.</strong> ${confLabel}</p>`;
    }
  }

  // Plan vs Actual
  let planVsActualHtml = '';
  if (summary.avgPlanDeviation != null) {
    const sign = summary.avgPlanDeviation >= 0 ? '+' : '';
    const direction = summary.avgPlanDeviation > 0 ? 'late' : summary.avgPlanDeviation < 0 ? 'early' : 'on time';
    planVsActualHtml = `<h3>Plan vs Actual</h3>
    <p class="note">This model was run against a pre-loaded planned schedule. The values below compare planned arrival times (from the schedule feed or CSV) to actual simulation times.</p>
    ${htmlTable(['Metric', 'Value'], [
      [`Average plan deviation (${unit})`, `${sign}${fin(summary.avgPlanDeviation, 1)}`],
      [`Direction`, direction],
    ])}`;
  }

  return `
  <section>
    <h2>Simulation Results</h2>
    ${introHtml}
    ${metricRows.length ? `<h3>Summary statistics</h3>${htmlTable(['Metric', 'Value'], metricRows)}` : ''}
    ${journeyChart ? `<div class="chart-wrap">${journeyChart}</div>` : ''}
    ${waitChartHtml || waitTableHtml ? `<h3>Queue wait-time distributions</h3>${waitChartHtml}${waitTableHtml}` : ''}
    ${outcomesHtml}
    ${utilChartHtml || utilTableHtml ? `<h3>Resource utilisation</h3>${utilChartHtml}${utilTableHtml}` : ''}
    ${timeSeriesHtml}
    ${planVsActualHtml}
    ${goalHtml}
    ${ciHtml}
  </section>`;
}

function buildSeniorMgmtAnalysis(narrativeText) {
  if (!narrativeText) return '';
  return `
  <section>
    <h2>Analysis</h2>
    <div class="desc">${esc(narrativeText)}</div>
  </section>`;
}

function buildRecommendations(recommendations) {
  if (!Array.isArray(recommendations) || !recommendations.length) {
    return `<section><h2>Recommendations</h2><p class="note">No recommendations could be generated for this run.</p></section>`;
  }
  const items = recommendations.map((rec, idx) => {
    const num  = rec.priority || idx + 1;
    const conf = rec.confidence ? `<span class="rec-conf">${esc(rec.confidence)}</span>` : '';
    let body = '';
    if (rec.finding)        body += `<div><strong>Finding:</strong> ${esc(rec.finding)}</div>`;
    if (rec.action)         body += `<div><strong>Action:</strong> ${esc(rec.action)}</div>`;
    if (rec.expectedImpact) body += `<div><strong>Expected impact:</strong> ${esc(rec.expectedImpact)}</div>`;
    return `<div class="rec">
      <div class="rec-head"><span class="rec-num">${num}</span><span class="rec-hl">${esc(rec.headline || `Recommendation ${num}`)}</span>${conf}</div>
      ${body ? `<div class="rec-body">${body}</div>` : ''}
    </div>`;
  }).join('');
  return `<section><h2>Recommendations</h2>${items}</section>`;
}

function buildRunProvenance(runMeta) {
  return `
  <section>
    <h2>Run Provenance</h2>
    ${htmlTable(['Field', 'Value'], [
      ['Run ID',         runMeta.runId || '—'],
      ['Run label',      runMeta.runLabel || '—'],
      ['Run date',       formatDate(runMeta.runTimestamp)],
      ['Engine version', `v${esc(runMeta.engineVersion || '1.0')}`],
      ['PRNG algorithm', runMeta.prnAlgorithm || 'mulberry32'],
      ['Base seed',      String(runMeta.seed ?? '—')],
    ])}
    <p class="note">This report was generated from a run record stored in simmodlr. The model definition, experiment configuration, and results are preserved in the run record and can be reproduced exactly using the Reproduce Run function.</p>
  </section>`;
}

function buildAppendix(model) {
  const entityTypes = model.entityTypes || [];
  const queues      = model.queues || [];
  const bEvents     = model.bEvents || [];
  const cEvents     = model.cEvents || [];
  const stateVars   = (model.stateVariables || []).filter(v => v.name);
  let html = '<section><h2>Appendix — Model Specification</h2>';

  if (entityTypes.length) {
    html += `<h3>Entity types</h3>${htmlTable(['Name', 'Role', 'Count'],
      entityTypes.map(e => [e.name || '—', e.role || '—', e.role === 'server' ? String(e.count ?? '—') : '—']))}`;
  }
  if (queues.length) {
    html += `<h3>Queues</h3>${htmlTable(['Name', 'Discipline', 'Capacity', 'Entity type'],
      queues.map(q => [q.name || '—', q.discipline || 'FIFO', q.capacity != null ? String(q.capacity) : '∞', q.customerType || '—']))}`;
  }
  if (bEvents.length) {
    html += `<h3>B-Events (Bound events)</h3>${htmlTable(['Name', 'Fires at', 'Effect'],
      bEvents.map(ev => [ev.name || ev.id || '—', String(ev.scheduledTime ?? '—'),
        (Array.isArray(ev.effect) ? ev.effect.join('; ') : String(ev.effect || '—')).substring(0, 100)]))}`;
  }
  if (cEvents.length) {
    html += `<h3>C-Events (Conditional events)</h3>${htmlTable(['Name', 'Priority', 'Effect'],
      cEvents.map(ev => [ev.name || ev.id || '—', String(ev.priority ?? 1),
        (Array.isArray(ev.effect) ? ev.effect.join('; ') : String(ev.effect || '—')).substring(0, 100)]))}`;
  }
  if (stateVars.length) {
    html += `<h3>State variables</h3>${htmlTable(['Name', 'Initial value'],
      stateVars.map(v => [v.name, String(v.initialValue ?? '0')]))}`;
  }
  return html + '</section>';
}

// ── HTML report builder ────────────────────────────────────────────────────────

function buildHtmlReport({ model, results, experimentConfig, runMeta, aggregateStats, type, narrativeText, modelDescription, recommendations, modelImageDataUrl }) {
  const isTechnical = type === 'technical';
  const title = esc(`${model.name || 'Simulation'} — ${isTechnical ? 'Technical' : 'Management'} Report`);

  const body = [
    buildCover(model, runMeta, experimentConfig),
    buildExecutiveSummary(model, results, recommendations, aggregateStats, modelDescription),
    buildModelImage(modelImageDataUrl),
    buildMethodology(model, results, experimentConfig, aggregateStats, type),
    buildResults(model, results, aggregateStats, type),
    narrativeText ? buildSeniorMgmtAnalysis(narrativeText) : '',
    buildRecommendations(recommendations),
    isTechnical ? buildExperimentConfig(experimentConfig, runMeta) : '',
    isTechnical ? buildRunProvenance(runMeta) : '',
    isTechnical ? buildAppendix(model) : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<div class="report">
  ${body}
  <div class="footer">Generated by simmodlr · ${esc(formatDate(new Date().toISOString()))}</div>
</div>
</body>
</html>`;
}

// ── Markdown report builder ────────────────────────────────────────────────────

function buildMarkdownReport({ model, results, experimentConfig, runMeta, aggregateStats, type, narrativeText, modelDescription, recommendations }) {
  const isTechnical  = type === 'technical';
  const summary      = getSummary(results);
  const unit         = model.timeUnit || 'minutes';
  const entityName   = getEntityName(model);
  const multiRep     = Object.values(aggregateStats).some(s => s?.n >= 2);
  const arrivalMode  = detectArrivalMode(model, summary);
  const warmup       = Number(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0);

  const lines = [];

  // Cover
  lines.push(`# ${model.name || 'Simulation'} — ${isTechnical ? 'Technical' : 'Management'} Report`);
  lines.push('');
  lines.push(`**Run:** ${runMeta.runLabel || runMeta.runId || '—'}  `);
  lines.push(`**Date:** ${formatDate(runMeta.runTimestamp)}  `);
  if (multiRep) lines.push(`**Replications:** ${experimentConfig.replications ?? '—'} (values shown are averages across replications)  `);
  lines.push('');
  if (modelDescription) {
    lines.push(`> ${modelDescription}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  // Scope & Methodology
  const queueNames   = Object.keys(results.waitDist || {});
  const resourceTypes = Object.keys(summary.perResource || {});
  lines.push('## Scope & Methodology');
  lines.push('');
  const MD_MAX_LISTED = 3;
  if (queueNames.length || resourceTypes.length) {
    const qPart = queueNames.length
      ? queueNames.length <= MD_MAX_LISTED
        ? `${queueNames.length} queue${queueNames.length !== 1 ? 's' : ''} (${queueNames.join(', ')})`
        : `${queueNames.length}-stage process`
      : '';
    const rPart = resourceTypes.length
      ? resourceTypes.length <= MD_MAX_LISTED
        ? `${resourceTypes.length} resource type${resourceTypes.length !== 1 ? 's' : ''} (${resourceTypes.join(', ')})`
        : `${resourceTypes.length} resource types`
      : '';
    lines.push(`**Scope:** This analysis covers ${[qPart, rPart].filter(Boolean).join(' served by ')}.`);
  }
  if (arrivalMode === 'plan') {
    lines.push(`**Arrival pattern:** ${entityName}s arrive according to a pre-planned timetable.`);
    // Arrival counts summary by period
    const entities = results.entitySummary || [];
    const mdWarmup = Number(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0);
    const arrivalTimes = entities
      .filter(e => e.role === 'customer' && Number.isFinite(e.arrivalTime) && e.arrivalTime >= mdWarmup)
      .map(e => e.arrivalTime);
    if (arrivalTimes.length >= 4) {
      const minT = Math.min(...arrivalTimes);
      const maxT = Math.max(...arrivalTimes);
      const range = maxT - minT;
      const numPeriods = Math.min(8, Math.max(4, Math.ceil(arrivalTimes.length / 10)));
      const bucketSize = range / numPeriods;
      const counts = new Array(numPeriods).fill(0);
      arrivalTimes.forEach(t => {
        const b = Math.min(numPeriods - 1, Math.floor((t - minT) / bucketSize));
        counts[b]++;
      });
      const peakBucket = counts.indexOf(Math.max(...counts));
      const peakStart  = (minT + peakBucket * bucketSize).toFixed(0);
      const peakEnd    = (minT + (peakBucket + 1) * bucketSize).toFixed(0);
      lines.push(`**Arrival peak:** Busiest period is ${peakStart}–${peakEnd} ${unit} (${Math.max(...counts)} arrivals). Total scheduled arrivals: ${arrivalTimes.length}.`);
    }
  } else {
    const distInfo = getArrivalDistInfo(model);
    lines.push(`**Arrival pattern:** ${entityName} inter-arrival times are modelled stochastically${distInfo ? ` (${distInfo})` : ''}.`);
  }
  if (warmup > 0) lines.push(`**Warm-up:** First ${warmup} ${unit} excluded from statistics to remove start-up effects.`);
  if (multiRep && Number(experimentConfig.replications ?? 1) >= 2) {
    lines.push(`**Replications:** ${experimentConfig.replications} runs averaged${isTechnical ? '; 95% confidence intervals shown in results' : ''}.`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // Key results
  lines.push('## Key Results');
  lines.push('');
  const kpiRows = [
    ['Avg wait time',                             `${formatN(resolveValue('avgWait',    summary, aggregateStats)) ?? '—'} ${unit}`],
    ['Avg service time',                           `${formatN(resolveValue('avgSvc',     summary, aggregateStats)) ?? '—'} ${unit}`],
    ['Avg total time in system',                   `${formatN(resolveValue('avgSojourn', summary, aggregateStats)) ?? '—'} ${unit}`],
    ['Avg time in system (incl. in-progress)',     `${formatN(resolveValue('avgTimeInSystem', summary, aggregateStats)) ?? '—'} ${unit}`],
    ['Service completion rate',                    formatPct(resolveValue('servedRatio', summary, aggregateStats)) ?? '—'],
    [`${entityName}s served${multiRep ? ' (avg per run)' : ''}`,  `${formatInt(resolveValue('served',  summary, aggregateStats)) ?? '—'}`],
    [`${entityName}s reneged${multiRep ? ' (avg per run)' : ''}`, `${formatInt(resolveValue('reneged', summary, aggregateStats)) ?? '—'}`],
  ].filter(r => r[1] && !r[1].startsWith('—'));
  const costVal = resolveValue('totalCost', summary, aggregateStats);
  if (costVal != null && Number.isFinite(Number(costVal))) {
    kpiRows.push([`Total cost${multiRep ? ' (avg per run)' : ''}`, formatCurrency(costVal) ?? '—']);
  }
  // Inline goal status
  const goalGapsForMd = buildGoalGaps(model, results.aggregateStats || {}, { ...summary, waitDist: results.waitDist, runtimeMetrics: results?.runtimeMetrics });
  if (Array.isArray(goalGapsForMd) && goalGapsForMd.length) {
    const met   = goalGapsForMd.filter(g => g.met).length;
    const total = goalGapsForMd.length;
    kpiRows.push(['Goal status', `${met === total ? '✅' : met === 0 ? '❌' : '⚠️'} ${met}/${total} targets met`]);
  }
  lines.push(mdTable(['Metric', 'Value'], kpiRows));
  lines.push('');

  const outcomesForMd = outcomeRows(summary);
  if (outcomesForMd.length) {
    lines.push('### Journey Outcomes');
    lines.push('');
    const mdOutcomeHasTimings = outcomesForMd.some(r => r.avgWait != null || r.avgSojourn != null);
    lines.push(mdTable(
      mdOutcomeHasTimings
        ? ['Outcome', 'Avg wait', 'Avg time in system']
        : ['Outcome'],
      outcomesForMd.map(row => mdOutcomeHasTimings
        ? [row.routeLabel, row.avgWait != null ? formatN(row.avgWait) : '—', row.avgSojourn != null ? formatN(row.avgSojourn) : '—']
        : [row.routeLabel]
      )
    ));
    lines.push('');
  }

  // Queue average wait times
  const waitDist = results.waitDist || {};
  const waitQueueNames = Object.keys(waitDist);
  if (waitQueueNames.length) {
    lines.push('### Queue Wait Times');
    lines.push('');
    const perQueueSvc   = computePerQueueServiceTimes(results);
    const hasMultiStage = waitQueueNames.length > 1 && Object.keys(perQueueSvc).length > 0;
    const qHeaders = hasMultiStage
      ? [`Queue`, `Mean wait (${unit})`, `Mean service (${unit})`]
      : [`Queue`, `Mean wait (${unit})`];
    const qRows = waitQueueNames.map(q => {
      const w = waitDist[q] || {};
      const row = [q, formatN(w.mean) ?? '—'];
      if (hasMultiStage) row.push(formatN(perQueueSvc[q]?.mean) ?? '—');
      return row;
    });
    lines.push(mdTable(qHeaders, qRows));
    lines.push('');
  }

  // Resource utilisation
  if (resourceTypes.length) {
    lines.push('### Resource Utilisation');
    lines.push('');
    const utilRows = resourceTypes.map(t => {
      const r = summary.perResource[t];
      const pct = Number.isFinite(r.utilisation) ? `${Math.round(r.utilisation * 100)}%` : '—';
      const et = (model.entityTypes || []).find(e => e.name === t);
      const countCell = et?.shiftSchedule?.length
        ? `shift (${et.shiftSchedule.length} period${et.shiftSchedule.length !== 1 ? 's' : ''})`
        : String(r.total ?? '—');
      return [t, countCell, pct];
    });
    lines.push(mdTable(['Resource', 'Capacity', '% Busy'], utilRows));
    lines.push('');
  }

  // Goal assessment table
  if (Array.isArray(goalGapsForMd) && goalGapsForMd.length) {
    lines.push('### Performance Goals');
    lines.push('');
    const goalRows = goalGapsForMd.map(g => [
      g.label || g.metric,
      `${g.operator} ${g.target}`,
      g.current != null ? (formatN(g.current) ?? '—') : '—',
      g.met ? '✅ MET' : '❌ MISSED',
    ]);
    lines.push(mdTable(['Goal', 'Target', 'Current', 'Status'], goalRows));
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Analysis
  if (narrativeText) {
    lines.push('## Analysis');
    lines.push('');
    lines.push(narrativeText);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  // Recommendations
  lines.push('## Recommended Actions');
  lines.push('');
  if (!recommendations.length) {
    lines.push('_No recommendations could be generated for this run._');
  } else {
    recommendations.forEach((rec, idx) => {
      const num = rec.priority || idx + 1;
      lines.push(`### ${num}. ${rec.headline || `Recommendation ${num}`}`);
      if (rec.finding)        lines.push(`**Finding:** ${rec.finding}`);
      if (rec.action)         lines.push(`**Action:** ${rec.action}`);
      if (rec.expectedImpact) lines.push(`**Expected impact:** ${rec.expectedImpact}`);
      if (rec.confidence)     lines.push(`**Confidence:** ${rec.confidence}`);
      lines.push('');
    });
  }

  if (isTechnical) {
    lines.push('---');
    lines.push('');

    // CI Analysis
    const aggStats = results.aggregateStats || {};
    const ciKeys = Object.keys(aggStats).filter(k => aggStats[k]?.n >= 2);
    if (ciKeys.length) {
      lines.push('## Statistical Confidence Analysis');
      lines.push('');
      lines.push(`_Based on ${ciKeys[0] ? aggStats[ciKeys[0]].n : '?'} replications. All intervals are 95% confidence intervals._`);
      lines.push('');
      const ciRows = ciKeys.map(k => {
        const s = aggStats[k];
        return [k, formatN(s.mean) ?? '—', formatN(s.lower) ?? '—', formatN(s.upper) ?? '—', String(s.n || '—')];
      });
      lines.push(mdTable(['Metric', 'Mean', '95% CI Lower', '95% CI Upper', 'Replications'], ciRows));
      lines.push('');
    }

    // Model specification
    lines.push('## Model Specification');
    lines.push('');
    const entityTypes = model.entityTypes || [];
    const queues      = model.queues || [];
    const stateVars   = (model.stateVariables || []).filter(v => v.name);
    if (entityTypes.length) {
      lines.push('### Entity Types');
      lines.push('');
      lines.push(mdTable(['Name', 'Role', 'Count'],
        entityTypes.map(e => [e.name || '—', e.role || '—', e.role === 'server' ? String(e.count ?? '—') : '—'])));
      lines.push('');
    }
    if (queues.length) {
      lines.push('### Queues');
      lines.push('');
      lines.push(mdTable(['Name', 'Discipline', 'Capacity'],
        queues.map(q => [q.name || '—', q.discipline || 'FIFO', q.capacity != null ? String(q.capacity) : '∞'])));
      lines.push('');
    }
    if (stateVars.length) {
      lines.push('### State Variables');
      lines.push('');
      lines.push(mdTable(['Name', 'Initial Value'],
        stateVars.map(v => [v.name, String(v.initialValue ?? '0')])));
      lines.push('');
    }

    // Experiment config
    lines.push('## Experiment Configuration');
    lines.push('');
    lines.push(mdTable(['Parameter', 'Value'], [
      ['Run label',      runMeta.runLabel || '—'],
      ['Warm-up period', String(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0)],
      ['Run duration',   String(experimentConfig.maxSimTime ?? experimentConfig.runDuration ?? '—')],
      ['Replications',   String(experimentConfig.replications ?? 1)],
      ['Termination',    experimentConfig.terminationMode || 'time'],
      ['Random seed',    String(runMeta.seed ?? '—')],
      ['PRN algorithm',  runMeta.prnAlgorithm || 'mulberry32'],
      ['Engine version', runMeta.engineVersion || '1.0'],
    ]));
    lines.push('');

    // Provenance
    lines.push('## Run Provenance');
    lines.push('');
    lines.push(mdTable(['Field', 'Value'], [
      ['Run ID',         runMeta.runId || '—'],
      ['Run date',       formatDate(runMeta.runTimestamp)],
      ['Engine version', `v${runMeta.engineVersion || '1.0'}`],
      ['PRNG algorithm', runMeta.prnAlgorithm || 'mulberry32'],
      ['Base seed',      String(runMeta.seed ?? '—')],
    ]));
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Generated by simmodlr · ${formatDate(new Date().toISOString())}_`);

  return lines.join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateReport(model = {}, results = {}, experimentConfig = {}, runMeta = {}, options = {}) {
  // Back-compat: old callers passed modelImageDataUrl as 5th arg (string or null)
  const isLegacyImageArg = typeof options === 'string' || options === null;
  const modelImageDataUrl = isLegacyImageArg ? options : (options?.modelImageDataUrl ?? null);
  const opts = (!isLegacyImageArg && options && typeof options === 'object') ? options : {};
  const {
    type = 'technical',     // 'seniorMgmt' | 'technical'
    format = 'html',        // 'html' | 'markdown'
    aggregateStats = {},
  } = opts;

  const narrativeText = runMeta.narrativeText || '';

  // Generate recommendations (not stored at run-time)
  const recsRaw = await callLLMOnce(buildReportRecommendationsPrompt(model, results)).catch(() => '[]');
  const recommendations = parseReportRecommendations(recsRaw);

  // Build a plain-English description for the report.
  // Prefer the stored LLM-generated narrative (already plain English).
  // If absent, call the LLM — do NOT use model.description directly: it is a
  // technical spec written for modellers, not suitable for a management report.
  let finalDescription = runMeta.modelDescriptionText || '';
  if (!finalDescription) {
    finalDescription = await callLLMOnce(buildModelDescriptionPrompt(model, results)).catch(() => '');
  }

  const ctx = { model, results, experimentConfig, runMeta, aggregateStats, type, narrativeText, modelDescription: finalDescription, recommendations, modelImageDataUrl };

  return format === 'markdown'
    ? buildMarkdownReport(ctx)
    : buildHtmlReport(ctx);
}

function fmtDist(dist, params = {}) {
  if (!dist) return null;
  const p = params || {};
  const d = String(dist).toLowerCase();
  if (d === 'exponential' || d === 'exp') {
    const mean = p.mean ?? (p.rate != null ? (1 / p.rate) : null);
    return mean != null ? `Exponential, mean ${mean}` : 'Exponential';
  }
  if (d === 'uniform') {
    if (p.min != null && p.max != null) return `Uniform ${p.min}–${p.max}`;
    return 'Uniform';
  }
  if (d === 'normal' || d === 'gaussian') {
    if (p.mean != null && p.std != null) return `Normal, mean ${p.mean} SD ${p.std}`;
    return 'Normal';
  }
  if (d === 'triangular' || d === 'triangle') {
    if (p.min != null && p.mode != null && p.max != null) return `Triangular (${p.min}, ${p.mode}, ${p.max})`;
    return 'Triangular';
  }
  if (d === 'lognormal' || d === 'log-normal') {
    if (p.mean != null && p.std != null) return `Log-normal, mean ${p.mean} SD ${p.std}`;
    return 'Log-normal';
  }
  if (d === 'fixed' || d === 'constant' || d === 'deterministic') {
    return p.value != null ? `Fixed ${p.value}` : 'Fixed';
  }
  if (d === 'erlang') {
    return p.k != null && p.mean != null ? `Erlang-${p.k}, mean ${p.mean}` : 'Erlang';
  }
  if (d === 'piecewise') {
    const periods = Array.isArray(p.periods) ? p.periods : [];
    if (!periods.length) return 'Time-varying';
    const descs = periods.map(period => {
      const t = period.startTime ?? period.time ?? 0;
      const pd = period.dist || period.distribution?.dist;
      const pp = period.distParams || period.params || period.distribution?.distParams || {};
      return `t=${t}: ${pd ? fmtDist(pd, pp) : 'Fixed'}`;
    });
    return `Time-varying (${periods.length} period${periods.length !== 1 ? 's' : ''}): ${descs.join('; ')}`;
  }
  if (d === 'schedule' || d === 'plan') {
    const rows = p.rows || p.periods || [];
    return rows.length ? `Scheduled (${rows.length} period${rows.length !== 1 ? 's' : ''})` : 'Scheduled';
  }
  if (d === 'empirical') {
    const vals = Array.isArray(p.values) ? p.values : [];
    return vals.length ? `Empirical (${vals.length} values)` : 'Empirical';
  }
  if (d === 'serverattr' || d === 'server-attr' || d === 'server_attr') return p.attr ? `Server attr: ${p.attr}` : 'Server attribute';
  if (d === 'entityattr' || d === 'entity-attr' || d === 'entity_attr') return p.attr ? `Entity attr: ${p.attr}` : 'Entity attribute';
  return dist;
}

function fmtSchedule(sched = []) {
  const entry = (sched || []).find(s => s.dist);
  if (!entry) return null;
  const unit = entry.unit || '';
  const desc = fmtDist(entry.dist, entry.distParams);
  return desc ? (unit ? `${desc} ${unit}` : desc) : null;
}

function printSection(title, rows) {
  if (!rows.length) return '';
  return `<section>
  <h2>${esc(title)}</h2>
  <table>
    <thead><tr>${rows[0].map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c ?? '—'}</td>`).join('')}</tr>`).join('\n      ')}
    </tbody>
  </table>
</section>`;
}

export function buildModelDefinitionHtml(model = {}) {
  const name = esc(model.name || 'Untitled model');
  const desc = esc(model.description || '');
  const timeUnit = esc(model.timeUnit || 'mins');
  const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const entityTypes = model.entityTypes || [];
  const customers = entityTypes.filter(e => e.role !== 'server');
  const servers = entityTypes.filter(e => e.role === 'server');
  const queues = model.queues || [];
  const bEvents = model.bEvents || [];
  const cEvents = model.cEvents || [];
  const goals = model.goals || [];
  const stateVars = model.stateVariables || [];

  // ── Overview key-value pairs ─────────────────────────────────────────────
  const overviewPairs = [
    ['Time unit', esc(model.timeUnit || 'mins')],
    model.runPeriod != null ? ['Run period', `${esc(String(model.runPeriod))} ${timeUnit}`] : null,
    model.warmUp != null ? ['Warm-up', `${esc(String(model.warmUp))} ${timeUnit}`] : null,
    model.replications != null ? ['Replications', esc(String(model.replications))] : null,
    model.epoch ? ['Calendar start', esc(String(model.epoch))] : null,
  ].filter(Boolean);

  const overviewHtml = overviewPairs.length ? `<section>
  <h2>Overview</h2>
  <table>
    <tbody>
      ${overviewPairs.map(([k, v]) => `<tr><th style="width:180px">${k}</th><td>${v}</td></tr>`).join('\n      ')}
    </tbody>
  </table>
</section>` : '';

  // ── State variables ────────────────────────────────────────────────────────
  const stateVarRows = stateVars.length ? [
    ['Name', 'Initial value', 'Description'],
    ...stateVars.map(sv => [esc(sv.name), esc(String(sv.initialValue ?? '')), esc(sv.description || '')])
  ] : [];

  // ── Entity types ───────────────────────────────────────────────────────────
  const customerRows = customers.length ? [
    ['Name', 'Description'],
    ...customers.map(e => [esc(e.name), esc(e.description || '')])
  ] : [];

  const serverRows = servers.length ? [
    ['Name', 'Capacity', 'Shift pattern', 'Description'],
    ...servers.map(e => {
      const shifts = e.shiftSchedule || [];
      const capacityStr = shifts.length ? '' : esc(String(e.count ?? 1));
      const shiftStr = shifts.length > 0
        ? shifts.map(s => `${s.capacity} from t=${s.time}`).join('; ')
        : 'Fixed';
      return [esc(e.name), capacityStr, esc(shiftStr), esc(e.description || '')];
    })
  ] : [];

  // ── Queues ─────────────────────────────────────────────────────────────────
  const queueRows = queues.length ? [
    ['Name', 'Discipline', 'Capacity', 'Description'],
    ...queues.map(q => [
      esc(q.name),
      esc(q.discipline || 'FIFO'),
      q.capacity != null ? esc(String(q.capacity)) : 'Unlimited',
      esc(q.description || ''),
    ])
  ] : [];

  // ── B Events ───────────────────────────────────────────────────────────────
  function bEventType(effect) {
    const e = Array.isArray(effect) ? effect.join(' ') : String(effect || '');
    if (/ARRIVE\s*\(/i.test(e)) return 'Arrival';
    if (/COMPLETE\s*\(/i.test(e)) return 'Completion';
    if (/RENEGE\s*\(/i.test(e)) return 'Renege';
    if (/BATCH\s*\(/i.test(e)) return 'Batch';
    return 'Event';
  }
  function fmtEffect(effect) {
    if (Array.isArray(effect)) return effect.map(e => esc(String(e))).join(' → ');
    return esc(String(effect || ''));
  }

  const bEventRows = bEvents.length ? [
    ['Name', 'Type', 'Timing', 'Effect'],
    ...bEvents.map(ev => {
      const sched = fmtSchedule(ev.schedules);
      return [esc(ev.name), bEventType(ev.effect), sched ? `${sched} ${timeUnit}` : '—', fmtEffect(ev.effect)];
    })
  ] : [];

  // ── Condition formatting (handles string or structured object) ────────────
  function formatConditionClause(c) {
    if (!c || typeof c !== 'object') return '';
    const variable = (c.variable || c.left || c.token || '').replace(/^entity\./i, '');
    const op = c.operator || c.op || '';
    const value = c.value !== undefined ? c.value : c.right;
    if (variable && op && value !== undefined) return `${variable} ${op} ${value}`;
    if (variable && value !== undefined) return `${variable} = ${value}`;
    return '';
  }
  function formatCondition(condition) {
    if (!condition) return '—';
    if (typeof condition === 'string') return esc(condition.trim()) || '—';
    if (typeof condition !== 'object') return '—';
    if ((condition.operator === 'AND' || condition.operator === 'OR') && Array.isArray(condition.clauses)) {
      const parts = condition.clauses.map(cl => formatConditionClause(cl)).filter(Boolean);
      return parts.length ? esc(parts.join(` ${condition.operator} `)) : '—';
    }
    return esc(formatConditionClause(condition)) || '—';
  }

  // ── C Events ───────────────────────────────────────────────────────────────
  const cEventRows = cEvents.length ? [
    ['Name', 'Server', 'Service time', 'Schedules', 'Condition', 'Priority'],
    ...cEvents.map(ev => {
      const sched = fmtSchedule(ev.cSchedules);
      const scheduledEvents = (ev.cSchedules || [])
        .map(cs => {
          const bev = bEvents.find(b => b.id === cs.eventId);
          if (!bev) return null;
          const timing = fmtSchedule([cs]);
          return timing ? `${esc(bev.name)} (${timing} ${timeUnit})` : esc(bev.name);
        })
        .filter(Boolean)
        .join(', ');
      return [
        esc(ev.name),
        esc(ev.serverType || ev.resourceType || '—'),
        sched ? `${sched} ${timeUnit}` : '—',
        scheduledEvents || '—',
        formatCondition(ev.condition),
        esc(String(ev.priority ?? 1)),
      ];
    })
  ] : [];

  // ── Goals ──────────────────────────────────────────────────────────────────
  const goalRows = goals.length ? [
    ['Goal', 'Target'],
    ...goals.map(g => [esc(g.label || g.metric || ''), esc(g.target != null ? `${g.operator || '≤'} ${g.target}` : '')])
  ] : [];

  const sections = [
    overviewHtml,
    customers.length ? printSection('Customer types', customerRows) : '',
    servers.length ? printSection('Server types (resources)', serverRows) : '',
    stateVars.length ? printSection('State variables', stateVarRows) : '',
    queues.length ? printSection('Queues', queueRows) : '',
    bEvents.length ? printSection('B Events (Arrivals & routing)', bEventRows) : '',
    cEvents.length ? printSection('C Events (Activities)', cEventRows) : '',
    goals.length ? printSection('Performance goals', goalRows) : '',
  ].filter(Boolean).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${name} — Model Definition</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 32px 40px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
  .subtitle { color: #555; font-size: 12px; margin-bottom: 6px; }
  .description { color: #333; font-size: 13px; margin-bottom: 24px; line-height: 1.6; }
  h2 { font-size: 14px; font-weight: 700; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1.5px solid #ddd; color: #111; }
  section { margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; font-weight: 600; background: #f5f5f5; padding: 6px 10px; border: 1px solid #ddd; }
  td { padding: 5px 10px; border: 1px solid #ddd; vertical-align: top; line-height: 1.5; word-break: break-word; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #eee; padding-top: 10px; }
  @media print {
    body { padding: 0; }
    @page { margin: 1.5cm 1.8cm; }
    h2 { break-before: avoid; }
    section { break-inside: avoid; }
    table { break-inside: auto; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>${name}</h1>
  <div class="subtitle">Model definition · Printed ${esc(printDate)}</div>
  ${desc ? `<div class="description">${desc}</div>` : ''}
  ${sections}
  <div class="footer">Generated by simmodlr</div>
</body>
</html>`;
}

export { sanitizeFilename, formatDate };
