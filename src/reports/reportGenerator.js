// reports/reportGenerator.js — Word document generator for DES Studio simulation reports

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  Header,
  Footer,
  PageNumberElement,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  PageBreak,
  convertInchesToTwip,
} from 'docx';

import { callLLMOnce } from '../llm/apiClient.js';
import {
  buildModelDescriptionPrompt,
  buildReportRecommendationsPrompt,
  parseReportRecommendations,
  buildGoalGaps,
} from '../llm/prompts.js';
import { getModelImageDataUrl } from '../ui/visual-designer/graph.js';

// ── Style constants ───────────────────────────────────────────────────────────
const FONT = 'Arial';
const COLOR_H = '1A2E4A';
const COLOR_BODY = '222222';
const COLOR_TABLE_HEADER = 'D0DCF0';
const SIZE_H1 = 56; // half-points: 28pt
const SIZE_H2 = 44; // half-points: 22pt
const SIZE_BODY = 22; // half-points: 11pt
const MARGIN = convertInchesToTwip(1); // 1440 twip

// ── Helpers ───────────────────────────────────────────────────────────────────

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({
        text: String(text || ''),
        font: FONT,
        size: SIZE_H1,
        bold: true,
        color: COLOR_H,
      }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text: String(text || ''),
        font: FONT,
        size: SIZE_H2,
        bold: true,
        color: COLOR_H,
      }),
    ],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [
      new TextRun({
        text: String(text || ''),
        font: FONT,
        size: SIZE_BODY,
        color: COLOR_BODY,
        bold: opts.bold || false,
        italics: opts.italic || false,
      }),
    ],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function headerCell(text) {
  return new TableCell({
    shading: { fill: COLOR_TABLE_HEADER, type: ShadingType.CLEAR },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text || ''),
            font: FONT,
            size: SIZE_BODY,
            bold: true,
            color: COLOR_H,
          }),
        ],
      }),
    ],
  });
}

function dataCell(text) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: String(text ?? '—'),
            font: FONT,
            size: SIZE_BODY,
            color: COLOR_BODY,
          }),
        ],
      }),
    ],
  });
}

function kvTable(rows) {
  if (!rows || rows.length === 0) {
    return body('(No data available)', { italic: true });
  }
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(({ key, value }) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: COLOR_TABLE_HEADER, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: String(key || ''),
                    font: FONT,
                    size: SIZE_BODY,
                    bold: true,
                    color: COLOR_H,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: String(value ?? '—'),
                    font: FONT,
                    size: SIZE_BODY,
                    color: COLOR_BODY,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    ),
  });
}

function formatDate(iso) {
  try {
    const d = new Date(iso || Date.now());
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return String(iso || '');
  }
}

function sanitizeFilename(name) {
  return String(name || 'report').replace(/[/\\:*?"<>|]/g, '-');
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function finiteStr(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function getSummary(results = {}) {
  return results.summary || results.results?.summary || {};
}

// ── Section builders ──────────────────────────────────────────────────────────

function buildCoverSection(model, runMeta) {
  return [
    body(''),
    body(''),
    new Paragraph({
      spacing: { before: 480, after: 240 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${model.name || 'Simulation'} — Analysis Report`,
          font: FONT,
          size: 60,
          bold: true,
          color: COLOR_H,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [
        new TextRun({
          text: `Run: ${runMeta.runLabel || runMeta.runId || 'Unknown'}`,
          font: FONT,
          size: 28,
          color: '444444',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({
          text: formatDate(runMeta.runTimestamp),
          font: FONT,
          size: 24,
          color: '666666',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 60, after: 60 },
      children: [
        new TextRun({
          text: `Generated by DES Studio  ·  Engine v${runMeta.engineVersion || '1.0'}`,
          font: FONT,
          size: 20,
          color: '888888',
          italics: true,
        }),
      ],
    }),
    pageBreak(),
  ];
}

function buildExecutiveSummarySection(model, results, recommendations) {
  const summary = getSummary(results);
  const blocks = [
    h1('Executive Summary'),
    body(
      model.description
        ? model.description
        : `This report summarises the results of a discrete-event simulation of the ${model.name || 'system'}.`,
      { italic: true }
    ),
  ];

  // Top KPIs
  const kpiRows = [
    { key: 'Entities served', value: finiteStr(summary.served, 0) },
    { key: 'Average waiting time', value: finiteStr(summary.avgWait) },
    { key: 'Average service time', value: finiteStr(summary.avgSvc) },
    { key: 'Average sojourn time', value: finiteStr(summary.avgSojourn) },
    { key: 'Average WIP', value: finiteStr(summary.avgWIP) },
    { key: 'Reneged', value: finiteStr(summary.reneged, 0) },
  ].filter(r => r.value !== '—');

  if (kpiRows.length) {
    blocks.push(body(''));
    blocks.push(h2('Key Performance Indicators'));
    blocks.push(kvTable(kpiRows));
  }

  // Top recommendation (headline only)
  if (Array.isArray(recommendations) && recommendations.length > 0) {
    const top = recommendations.find(r => r.priority === 1) || recommendations[0];
    if (top?.headline) {
      blocks.push(body(''));
      blocks.push(h2('Primary Recommendation'));
      blocks.push(body(top.headline, { bold: true }));
      if (top.finding) blocks.push(body(top.finding));
    }
  }

  blocks.push(pageBreak());
  return blocks;
}

function buildModelDescriptionSection(descriptionText) {
  return [
    h1('Model Description'),
    body(descriptionText || 'No model description available.'),
    pageBreak(),
  ];
}

function buildExperimentConfigSection(model, experimentConfig, runMeta) {
  const blocks = [
    h1('Experiment Configuration'),
  ];

  const rows = [
    { key: 'Run ID', value: runMeta.runId || '—' },
    { key: 'Run label', value: runMeta.runLabel || '—' },
    { key: 'Run date', value: formatDate(runMeta.runTimestamp) },
    { key: 'Engine version', value: runMeta.engineVersion || '1.0' },
    { key: 'PRN algorithm', value: runMeta.prnAlgorithm || 'mulberry32' },
    { key: 'Random seed', value: String(runMeta.seed ?? '—') },
    { key: 'Warm-up period', value: String(experimentConfig.warmupPeriod ?? experimentConfig.warmup ?? 0) },
    { key: 'Run duration', value: String(experimentConfig.maxSimTime ?? experimentConfig.runDuration ?? '—') },
    { key: 'Replications', value: String(experimentConfig.replications ?? 1) },
    { key: 'Termination mode', value: experimentConfig.terminationMode || 'time' },
  ];

  blocks.push(kvTable(rows));
  blocks.push(pageBreak());
  return blocks;
}

function buildModelImageSection(imageDataUrl) {
  const blocks = [h1('Model Diagram')];

  if (imageDataUrl && imageDataUrl.startsWith('data:image/png;base64,')) {
    try {
      const base64 = imageDataUrl.replace('data:image/png;base64,', '');
      const buf = base64ToUint8Array(base64);
      const imgRun = new ImageRun({
        data: buf,
        transformation: { width: 580, height: 320 },
        type: 'png',
      });
      blocks.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [imgRun],
      }));
    } catch {
      blocks.push(body('[Model diagram could not be rendered.]', { italic: true }));
    }
  } else {
    blocks.push(body('[Model diagram not available — open this report from the simulation UI to include the diagram.]', { italic: true }));
  }

  blocks.push(pageBreak());
  return blocks;
}

function buildResultsSection(model, results) {
  const summary = getSummary(results);
  const blocks = [h1('Simulation Results')];

  // Summary KPIs table
  blocks.push(h2('Summary Statistics'));
  const summaryRows = [
    { key: 'Total entities created', value: finiteStr(summary.total, 0) },
    { key: 'Entities served', value: finiteStr(summary.served, 0) },
    { key: 'Entities reneged', value: finiteStr(summary.reneged, 0) },
    { key: 'Average waiting time', value: finiteStr(summary.avgWait) },
    { key: 'Average service time', value: finiteStr(summary.avgSvc) },
    { key: 'Average sojourn time', value: finiteStr(summary.avgSojourn) },
    { key: 'Maximum sojourn time', value: finiteStr(summary.maxSojourn) },
    { key: 'Average WIP (Little\'s L)', value: finiteStr(summary.avgWIP) },
  ];
  if (summary.totalCost != null) summaryRows.push({ key: 'Total cost', value: finiteStr(summary.totalCost) });
  if (summary.costPerServed != null) summaryRows.push({ key: 'Cost per entity served', value: finiteStr(summary.costPerServed) });
  blocks.push(kvTable(summaryRows.filter(r => r.value !== '—')));

  // Per-queue wait distribution
  const waitDist = results.waitDist || {};
  const queueNames = Object.keys(waitDist);
  if (queueNames.length > 0) {
    blocks.push(body(''));
    blocks.push(h2('Queue Wait-Time Distribution'));
    const headerRow = new TableRow({
      children: [
        headerCell('Queue'),
        headerCell('N'),
        headerCell('Mean wait'),
        headerCell('P50'),
        headerCell('P90'),
        headerCell('P95'),
        headerCell('P99'),
      ],
    });
    const dataRows = queueNames.map(qName => {
      const w = waitDist[qName] || {};
      return new TableRow({
        children: [
          dataCell(qName),
          dataCell(finiteStr(w.n, 0)),
          dataCell(finiteStr(w.mean)),
          dataCell(finiteStr(w.p50)),
          dataCell(finiteStr(w.p90)),
          dataCell(finiteStr(w.p95)),
          dataCell(finiteStr(w.p99)),
        ],
      });
    });
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
  }

  // Resource utilisation
  const servers = (model.entityTypes || []).filter(e => e.role === 'server');
  if (servers.length > 0) {
    const resourceStats = summary.perResource || summary.resourceUtilisation || {};
    blocks.push(body(''));
    blocks.push(h2('Resource Utilisation'));
    const headerRow = new TableRow({
      children: [
        headerCell('Resource'),
        headerCell('Count'),
        headerCell('Utilisation'),
        headerCell('Busy'),
        headerCell('Idle'),
      ],
    });
    const dataRows = servers.map(server => {
      const pr = typeof resourceStats === 'object' ? resourceStats[server.name] : null;
      const util = pr?.utilisation ?? summary.utilisation;
      return new TableRow({
        children: [
          dataCell(server.name),
          dataCell(String(server.count ?? '—')),
          dataCell(Number.isFinite(Number(util)) ? `${(Number(util) * 100).toFixed(1)}%` : '—'),
          dataCell(finiteStr(pr?.busyCount, 0)),
          dataCell(finiteStr(pr?.idleCount, 0)),
        ],
      });
    });
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
  }

  // Goal gaps
  const goalGaps = buildGoalGaps(model, results.aggregateStats || {});
  if (Array.isArray(goalGaps) && goalGaps.length > 0) {
    blocks.push(body(''));
    blocks.push(h2('Performance Goal Assessment'));
    const headerRow = new TableRow({
      children: [
        headerCell('Goal'),
        headerCell('Target'),
        headerCell('Current'),
        headerCell('Status'),
        headerCell('Gap'),
      ],
    });
    const dataRows = goalGaps.map(gap =>
      new TableRow({
        children: [
          dataCell(gap.label || gap.metric),
          dataCell(`${gap.operator} ${gap.target}`),
          dataCell(gap.current != null ? finiteStr(gap.current) : '—'),
          dataCell(gap.met ? 'MET' : 'MISSED'),
          dataCell(gap.gap != null ? finiteStr(gap.gap) : '—'),
        ],
      })
    );
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
  }

  // Confidence intervals (if replications)
  const aggStats = results.aggregateStats || {};
  const ciKeys = Object.keys(aggStats).filter(k => aggStats[k] && aggStats[k].n >= 2);
  if (ciKeys.length > 0) {
    blocks.push(body(''));
    blocks.push(h2('Replication Confidence Intervals (95%)'));
    const headerRow = new TableRow({
      children: [
        headerCell('Metric'),
        headerCell('Mean'),
        headerCell('CI Lower'),
        headerCell('CI Upper'),
        headerCell('N'),
      ],
    });
    const dataRows = ciKeys.map(k => {
      const s = aggStats[k];
      return new TableRow({
        children: [
          dataCell(k),
          dataCell(finiteStr(s.mean)),
          dataCell(finiteStr(s.lower)),
          dataCell(finiteStr(s.upper)),
          dataCell(String(s.n || '—')),
        ],
      });
    });
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
  }

  blocks.push(pageBreak());
  return blocks;
}

function buildRecommendationsSection(recommendations) {
  const blocks = [h1('Recommendations')];

  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    blocks.push(body('No recommendations could be generated for this run.', { italic: true }));
    blocks.push(pageBreak());
    return blocks;
  }

  recommendations.forEach((rec, idx) => {
    const headline = rec.headline || `Recommendation ${idx + 1}`;
    const priority = rec.priority || idx + 1;
    const confidence = rec.confidence || 'MEDIUM';

    blocks.push(h2(`${priority}. ${headline}`));
    blocks.push(kvTable([
      { key: 'Confidence', value: confidence },
    ]));

    if (rec.finding) {
      blocks.push(body('Finding', { bold: true }));
      blocks.push(body(rec.finding));
    }
    if (rec.action) {
      blocks.push(body('Recommended Action', { bold: true }));
      blocks.push(body(rec.action));
    }
    if (rec.expectedImpact) {
      blocks.push(body('Expected Impact', { bold: true }));
      blocks.push(body(rec.expectedImpact));
    }
    blocks.push(body(''));
  });

  blocks.push(pageBreak());
  return blocks;
}

function buildAppendixSection(model, runMeta) {
  const blocks = [h1('Appendix — Model Specification')];

  // Entity types
  const entityTypes = model.entityTypes || [];
  if (entityTypes.length > 0) {
    blocks.push(h2('Entity Types'));
    const headerRow = new TableRow({
      children: [headerCell('Name'), headerCell('Role'), headerCell('Count')],
    });
    const dataRows = entityTypes.map(et =>
      new TableRow({
        children: [
          dataCell(et.name || '—'),
          dataCell(et.role || '—'),
          dataCell(et.role === 'server' ? String(et.count ?? '—') : '—'),
        ],
      })
    );
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
    blocks.push(body(''));
  }

  // Queues
  const queues = model.queues || [];
  if (queues.length > 0) {
    blocks.push(h2('Queues'));
    const headerRow = new TableRow({
      children: [headerCell('Name'), headerCell('Discipline'), headerCell('Capacity'), headerCell('Entity type')],
    });
    const dataRows = queues.map(q =>
      new TableRow({
        children: [
          dataCell(q.name || '—'),
          dataCell(q.discipline || 'FIFO'),
          dataCell(q.capacity != null ? String(q.capacity) : '∞'),
          dataCell(q.customerType || '—'),
        ],
      })
    );
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
    blocks.push(body(''));
  }

  // B-Events
  const bEvents = model.bEvents || [];
  if (bEvents.length > 0) {
    blocks.push(h2('Bound Events'));
    const headerRow = new TableRow({
      children: [headerCell('Name'), headerCell('Effect (summary)')],
    });
    const dataRows = bEvents.map(ev =>
      new TableRow({
        children: [
          dataCell(ev.name || ev.id || '—'),
          dataCell(
            Array.isArray(ev.effect)
              ? ev.effect.join('; ').substring(0, 120)
              : String(ev.effect || '—').substring(0, 120)
          ),
        ],
      })
    );
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
    blocks.push(body(''));
  }

  // C-Events
  const cEvents = model.cEvents || [];
  if (cEvents.length > 0) {
    blocks.push(h2('Conditional Events'));
    const headerRow = new TableRow({
      children: [headerCell('Name'), headerCell('Priority'), headerCell('Effect (summary)')],
    });
    const dataRows = cEvents.map(ev =>
      new TableRow({
        children: [
          dataCell(ev.name || ev.id || '—'),
          dataCell(String(ev.priority ?? 1)),
          dataCell(
            Array.isArray(ev.effect)
              ? ev.effect.join('; ').substring(0, 120)
              : String(ev.effect || '—').substring(0, 120)
          ),
        ],
      })
    );
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
    blocks.push(body(''));
  }

  // State variables
  const stateVars = (model.stateVariables || []).filter(v => v.name);
  if (stateVars.length > 0) {
    blocks.push(h2('State Variables'));
    const headerRow = new TableRow({
      children: [headerCell('Name'), headerCell('Initial value')],
    });
    const dataRows = stateVars.map(v =>
      new TableRow({
        children: [
          dataCell(v.name),
          dataCell(String(v.initialValue ?? '0')),
        ],
      })
    );
    blocks.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...dataRows],
    }));
  }

  return blocks;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateReport(model = {}, results = {}, experimentConfig = {}, runMeta = {}) {
  // Fetch LLM content in parallel — fallback gracefully on failure
  let modelDescriptionText = model.description || '';
  let recommendations = [];
  let imageDataUrl = null;

  const [descResult, recsResult, imgResult] = await Promise.allSettled([
    callLLMOnce(buildModelDescriptionPrompt(model)).catch(() => model.description || ''),
    callLLMOnce(buildReportRecommendationsPrompt(model, results)).catch(() => '[]'),
    getModelImageDataUrl().catch(() => null),
  ]);

  if (descResult.status === 'fulfilled') {
    modelDescriptionText = descResult.value || model.description || '';
  }
  if (recsResult.status === 'fulfilled') {
    recommendations = parseReportRecommendations(recsResult.value);
  }
  if (imgResult.status === 'fulfilled') {
    imageDataUrl = imgResult.value;
  }

  // Build all sections
  const children = [
    ...buildCoverSection(model, runMeta),
    ...buildExecutiveSummarySection(model, results, recommendations),
    ...buildModelDescriptionSection(modelDescriptionText),
    ...buildExperimentConfigSection(model, experimentConfig, runMeta),
    ...buildModelImageSection(imageDataUrl),
    ...buildResultsSection(model, results),
    ...buildRecommendationsSection(recommendations),
    ...buildAppendixSection(model, runMeta),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: MARGIN,
              right: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `${model.name || 'DES Studio'} — Simulation Report`,
                    font: FONT,
                    size: 16,
                    color: '888888',
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Page ',
                    font: FONT,
                    size: 16,
                    color: '888888',
                  }),
                  new PageNumberElement(),
                  new TextRun({
                    text: `  ·  Generated by DES Studio  ·  ${formatDate(runMeta.runTimestamp)}`,
                    font: FONT,
                    size: 16,
                    color: '888888',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export { sanitizeFilename, formatDate };
