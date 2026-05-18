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

// ── SVG Charts ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

function groupedBarChart({ groups, series, title, width = 580, height = 260 }) {
  if (!groups.length || !series.length) return '';
  const m = { top: 32, right: 16, bottom: 72, left: 52 };
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
    const lx = (m.left + gi * groupW + groupW / 2).toFixed(1);
    const lbl = g.label.length > 14 ? g.label.slice(0, 13) + '…' : g.label;
    xlabels += `<text x="${lx}" y="${(m.top + cH + 15).toFixed(1)}" text-anchor="middle" font-size="10" fill="#6b7280" font-family="sans-serif">${esc(lbl)}</text>`;
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

function horizBarChart({ items, title, width = 480 }) {
  if (!items.length) return '';
  const m = { top: 32, right: 64, bottom: 16, left: 110 };
  const rowH = 30;
  const height = m.top + m.bottom + items.length * rowH;
  const cW = width - m.left - m.right;
  let bars = '';

  items.forEach((item, i) => {
    const y = m.top + i * rowH;
    const pct = Math.min(1, Math.max(0, Number(item.value) || 0));
    const color = pct >= 0.9 ? '#dc2626' : pct >= 0.75 ? '#d97706' : '#16a34a';
    bars += `<rect x="${m.left}" y="${y + 3}" width="${cW}" height="20" fill="#f3f4f6" rx="3"/>`;
    if (pct > 0.002) bars += `<rect x="${m.left}" y="${y + 3}" width="${(pct * cW).toFixed(1)}" height="20" fill="${color}" rx="3" opacity="0.85"/>`;
    const lbl = item.label.length > 16 ? item.label.slice(0, 15) + '…' : item.label;
    bars += `<text x="${m.left - 6}" y="${y + 17}" text-anchor="end" font-size="11" fill="#374151" font-family="sans-serif">${esc(lbl)}</text>`;
    bars += `<text x="${m.left + cW + 8}" y="${y + 17}" font-size="11" font-weight="600" fill="${color}" font-family="sans-serif">${(pct * 100).toFixed(1)}%</text>`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">${esc(title)}</text>
    ${bars}
  </svg>`;
}

function journeyBreakdownChart({ avgWait, avgSvc, unit = 'minutes', width = 480 }) {
  const wait = Number.isFinite(Number(avgWait)) ? Math.max(0, Number(avgWait)) : 0;
  const svc  = Number.isFinite(Number(avgSvc))  ? Math.max(0, Number(avgSvc))  : 0;
  if (wait + svc === 0) return '';
  const m = { top: 32, right: 80, bottom: 16, left: 110 };
  const height = m.top + m.bottom + 2 * 30;
  const cW = width - m.left - m.right;
  const total = wait + svc;
  const rows = [
    { label: `Avg wait (${unit})`,    val: wait, color: '#2563eb' },
    { label: `Avg service (${unit})`, val: svc,  color: '#16a34a' },
  ];
  let bars = '';
  rows.forEach((r, i) => {
    const y = m.top + i * 30;
    bars += `<rect x="${m.left}" y="${y + 3}" width="${cW}" height="20" fill="#f3f4f6" rx="3"/>`;
    if (r.val > 0) bars += `<rect x="${m.left}" y="${y + 3}" width="${((r.val / total) * cW).toFixed(1)}" height="20" fill="${r.color}" rx="3" opacity="0.85"/>`;
    bars += `<text x="${m.left - 6}" y="${y + 17}" text-anchor="end" font-size="11" fill="#374151" font-family="sans-serif">${esc(r.label)}</text>`;
    bars += `<text x="${m.left + cW + 8}" y="${y + 17}" font-size="11" font-weight="600" fill="${r.color}" font-family="sans-serif">${r.val.toFixed(1)}</text>`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#111827" font-family="sans-serif">Journey Time Breakdown</text>
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
  }
`;

// ── HTML section builders ──────────────────────────────────────────────────────

function htmlTable(headers, rows) {
  if (!rows.length) return '<p class="note">No data available.</p>';
  const head = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map(c => `<td>${esc(String(c ?? '—'))}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
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
      <div><strong>Engine:</strong> DES Studio v${esc(runMeta.engineVersion || '1.0')}</div>
    </div>
    <span class="badge">Simulation Analysis</span>
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

function buildExecutiveSummary(model, results, recommendations) {
  const summary = getSummary(results);
  const unit = model.timeUnit || 'minutes';

  const kpis = [
    { lbl: 'Entities served',           val: fin(summary.served, 0) },
    { lbl: 'Reneged / abandoned',       val: fin(summary.reneged, 0) },
    { lbl: `Avg wait time (${unit})`,   val: fin(summary.avgWait, 1) },
    { lbl: `Avg service time (${unit})`,val: fin(summary.avgSvc, 1) },
    { lbl: `Avg total time (${unit})`,  val: fin(summary.avgSojourn, 1) },
    { lbl: "Avg WIP",                   val: fin(summary.avgWIP, 1) },
  ].filter(k => k.val !== null);

  const kpiHtml = kpis.length ? `<div class="kpi-grid">${
    kpis.map(k => `<div class="kpi"><div class="lbl">${esc(k.lbl)}</div><div class="val">${esc(k.val)}</div></div>`).join('')
  }</div>` : '';

  const top = Array.isArray(recommendations) && recommendations.length
    ? (recommendations.find(r => r.priority === 1) || recommendations[0]) : null;

  const recHtml = top?.headline ? `
    <h3>Primary recommendation</h3>
    <div class="rec">
      <div class="rec-head"><span class="rec-num">1</span><span class="rec-hl">${esc(top.headline)}</span></div>
      ${top.finding ? `<div class="rec-body">${esc(top.finding)}</div>` : ''}
    </div>` : '';

  return `
  <section>
    <h2>Executive Summary</h2>
    ${model.description ? `<div class="desc">${esc(model.description)}</div>` : ''}
    ${kpiHtml}
    ${recHtml}
  </section>`;
}

function buildModelDescription(descriptionText) {
  if (!descriptionText) return '';
  return `
  <section>
    <h2>Model Description</h2>
    <div class="desc">${esc(descriptionText)}</div>
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

function buildResults(model, results) {
  const summary  = getSummary(results);
  const waitDist = results.waitDist || {};
  const aggStats = results.aggregateStats || {};
  const unit     = model.timeUnit || 'minutes';

  // Summary stats — only post-warmup, time-averaged or per-entity values
  const metricRows = [
    [`Entities completed service`,                              fin(summary.served, 0)],
    [`Entities reneged (abandoned)`,                           fin(summary.reneged, 0)],
    [`Average waiting time (${unit})`,                         fin(summary.avgWait, 1)],
    [`Average service time (${unit})`,                         fin(summary.avgSvc, 1)],
    [`Average total time in system — wait + service (${unit})`,fin(summary.avgSojourn, 1)],
    [`Longest time in system (${unit})`,                       fin(summary.maxSojourn, 1)],
    [`Average number in system (WIP)`,                         fin(summary.avgWIP, 1)],
    [`Total cost`,                                             fin(summary.totalCost, 1)],
    [`Cost per entity served`,                                 fin(summary.costPerServed, 1)],
  ].filter(r => r[1] !== null);

  // Journey breakdown chart
  const journeyChart = journeyBreakdownChart({ avgWait: summary.avgWait, avgSvc: summary.avgSvc, unit });

  // Queue wait-time chart + table
  const queueNames = Object.keys(waitDist);
  let waitChartHtml = '', waitTableHtml = '';
  if (queueNames.length) {
    const metricKeys   = ['mean', 'p50', 'p90', 'p95'];
    const metricLabels = ['Mean', 'P50', 'P90', 'P95'];
    const groups = queueNames.map(q => ({
      label:  q,
      values: metricKeys.map(m => { const v = Number(waitDist[q]?.[m]); return Number.isFinite(v) ? v : NaN; }),
    })).filter(g => g.values.some(v => Number.isFinite(v)));

    if (groups.length) {
      waitChartHtml = `<div class="chart-wrap">${groupedBarChart({
        groups,
        series: metricLabels.map(l => ({ label: l })),
        title:  `Queue Wait-Time Distribution (${unit})`,
      })}</div>`;
    }

    const tableRows = queueNames.map(q => {
      const w = waitDist[q] || {};
      return [q, fin(w.n, 0), fin(w.mean, 1), fin(w.p50, 1), fin(w.p90, 1), fin(w.p95, 1), fin(w.p99, 1)].map(v => v ?? '—');
    });
    const percentileNote = `<p class="note">
      <strong>Reading the wait-time columns:</strong>
      <strong>Mean</strong> = average wait across all arrivals.
      <strong>P50</strong> (median) = half of people waited less than this, half waited more.
      <strong>P90</strong> = 9 out of 10 people waited less than this; only 1 in 10 waited longer.
      <strong>P95</strong> = 19 out of 20 people waited less than this.
      All values in ${unit}.
    </p>`;
    waitTableHtml = percentileNote + htmlTable([`Queue`, `Count`, `Mean wait`, `P50`, `P90`, `P95`, `P99`], tableRows);
  }

  // Resource utilisation chart + table (time-averaged, post-warmup)
  const perResource = summary.perResource || {};
  const resourceTypes = Object.keys(perResource);
  let utilChartHtml = '', utilTableHtml = '';
  if (resourceTypes.length) {
    utilChartHtml = `<div class="chart-wrap">${horizBarChart({
      items: resourceTypes.map(t => ({ label: t, value: perResource[t].utilisation ?? 0 })),
      title: 'Resource Utilisation',
    })}</div>`;
    const utilRows = resourceTypes.map(t => {
      const r = perResource[t];
      const pct = Number.isFinite(r.utilisation) ? `${Math.round(r.utilisation * 100)}%` : '—';
      return [t, String(r.total ?? '—'), pct];
    });
    utilTableHtml = `<p class="note">Percentage of time each resource was busy (averaged across the run, excluding warm-up). Green &lt;75%, amber 75–90%, red &gt;90%.</p>
    ${htmlTable(['Resource type', 'Count', 'Utilisation'], utilRows)}`;
  }

  // Goal assessment
  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});
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

  // Confidence intervals (multi-replication only)
  const ciKeys = Object.keys(aggStats).filter(k => aggStats[k]?.n >= 2);
  let ciHtml = '';
  if (ciKeys.length) {
    const ciRows = ciKeys.map(k => {
      const s = aggStats[k];
      return [k, fin(s.mean, 1) ?? '—', fin(s.lower, 1) ?? '—', fin(s.upper, 1) ?? '—', String(s.n || '—')];
    });
    ciHtml = `<h3>Replication Confidence Intervals (95%)</h3>${htmlTable(['Metric', 'Mean', 'CI Lower', 'CI Upper', 'N'], ciRows)}`;
  }

  return `
  <section>
    <h2>Simulation Results</h2>
    ${metricRows.length ? `<h3>Summary statistics</h3>${htmlTable(['Metric', 'Value'], metricRows)}` : ''}
    ${journeyChart ? `<div class="chart-wrap">${journeyChart}</div>` : ''}
    ${waitChartHtml || waitTableHtml ? `<h3>Queue wait-time distributions</h3>${waitChartHtml}${waitTableHtml}` : ''}
    ${utilChartHtml || utilTableHtml ? `<h3>Resource utilisation</h3>${utilChartHtml}${utilTableHtml}` : ''}
    ${goalHtml}
    ${ciHtml}
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
    if (rec.finding)       body += `<div><strong>Finding:</strong> ${esc(rec.finding)}</div>`;
    if (rec.action)        body += `<div><strong>Action:</strong> ${esc(rec.action)}</div>`;
    if (rec.expectedImpact) body += `<div><strong>Expected impact:</strong> ${esc(rec.expectedImpact)}</div>`;
    return `<div class="rec">
      <div class="rec-head"><span class="rec-num">${num}</span><span class="rec-hl">${esc(rec.headline || `Recommendation ${num}`)}</span>${conf}</div>
      ${body ? `<div class="rec-body">${body}</div>` : ''}
    </div>`;
  }).join('');
  return `<section><h2>Recommendations</h2>${items}</section>`;
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

// ── Main export ────────────────────────────────────────────────────────────────

export async function generateReport(model = {}, results = {}, experimentConfig = {}, runMeta = {}, modelImageDataUrl = null) {
  let modelDescription = model.description || '';
  let recommendations  = [];

  const [descResult, recsResult] = await Promise.allSettled([
    callLLMOnce(buildModelDescriptionPrompt(model)).catch(() => model.description || ''),
    callLLMOnce(buildReportRecommendationsPrompt(model, results)).catch(() => '[]'),
  ]);

  if (descResult.status === 'fulfilled') modelDescription = descResult.value || model.description || '';
  if (recsResult.status === 'fulfilled') recommendations  = parseReportRecommendations(recsResult.value);

  const title = esc(`${model.name || 'Simulation'} — Analysis Report`);

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
  ${buildCover(model, runMeta, experimentConfig)}
  ${buildModelImage(modelImageDataUrl)}
  ${buildExecutiveSummary(model, results, recommendations)}
  ${buildModelDescription(modelDescription)}
  ${buildResults(model, results)}
  ${buildRecommendations(recommendations)}
  ${buildAppendix(model)}
  <div class="footer">Generated by DES Studio · ${esc(formatDate(new Date().toISOString()))}</div>
</div>
</body>
</html>`;
}

export { sanitizeFilename, formatDate };
