const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, Header, Footer, ExternalHyperlink
} = require('docx');
const fs = require('fs');
const path = require('path');

// ── Shared helpers ──────────────────────────────────────────────────────────

const CONTENT_WIDTH = 9026; // A4 with 1-inch margins (11906 - 2880)

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, font: 'Arial', size: 28, bold: true, color: '1F4E79' })]
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, font: 'Arial', size: 24, bold: true, color: '2E75B6' })]
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 100 },
    children: [new TextRun({ text, font: 'Arial', size: 22, ...opts })]
  });
}

function bodyRuns(runs) {
  return new Paragraph({
    spacing: { before: 80, after: 100 },
    children: runs.map(r =>
      typeof r === 'string'
        ? new TextRun({ text: r, font: 'Arial', size: 22 })
        : new TextRun({ font: 'Arial', size: 22, ...r })
    )
  });
}

function bullet(runs, level = 0) {
  const indent = level === 0
    ? { left: 720, hanging: 360 }
    : { left: 1080, hanging: 360 };
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { before: 60, after: 60 },
    indent,
    children: (typeof runs === 'string'
      ? [new TextRun({ text: runs, font: 'Arial', size: 22 })]
      : runs.map(r =>
          typeof r === 'string'
            ? new TextRun({ text: r, font: 'Arial', size: 22 })
            : new TextRun({ font: 'Arial', size: 22, ...r })
        )
    )
  });
}

function spacer() {
  return new Paragraph({ spacing: { before: 0, after: 80 }, children: [] });
}

function rule() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 1 } },
    children: []
  });
}

function simpleTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      new TableCell({
        borders,
        width: { size: colWidths[i], type: WidthType.DXA },
        shading: { fill: '2E75B6', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: h, font: 'Arial', size: 20, bold: true, color: 'FFFFFF' })]
        })]
      })
    )
  });
  const dataRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          borders,
          width: { size: colWidths[ci], type: WidthType.DXA },
          shading: { fill: ri % 2 === 0 ? 'F5F9FF' : 'FFFFFF', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: (Array.isArray(cell)
            ? cell
            : [new Paragraph({ children: [new TextRun({ text: cell, font: 'Arial', size: 20 })] })]
          )
        })
      )
    })
  );
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows]
  });
}

function numbering() {
  return {
    config: [
      {
        reference: 'bullets',
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: '◦',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
          }
        ]
      },
      {
        reference: 'steps',
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          }
        ]
      }
    ]
  };
}

function footer() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'simmodlr  |  Page ', font: 'Arial', size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '888888' })
        ]
      })
    ]
  });
}

function pageProps() {
  return {
    page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
    }
  };
}

// ── DOCUMENT 1: Quick Start Guide ───────────────────────────────────────────

function buildQuickStart() {
  const children = [

    // Title
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'Getting Started with simmodlr', font: 'Arial', size: 40, bold: true, color: '1F4E79' })]
    }),
    bodyRuns([
      'simmodlr is a browser-based discrete-event simulation tool. You describe entities (customers, jobs, patients), the queues they wait in, and the events that move them through your system ',
      { text: 'no code required', bold: true },
      '.'
    ]),
    rule(),

    // Core Concepts
    heading1('Core Concepts in 60 Seconds'),
    simpleTable(
      ['Term', 'What it means'],
      [
        ['Entity', 'The “things” moving through your system — a customer, a job, a patient. Each belongs to an entity class you define, with whatever attributes you need (priority, type, size).'],
        ['Queue', 'Where entities wait. Disciplines include first-in/first-out, last-in, priority, shortest job first, earliest due date, or any attribute you choose.'],
        ['B-Event', 'A scheduled, time-triggered event. Arrivals and completions are B-Events.'],
        ['C-Event', 'A conditional event that fires whenever its condition becomes true — typically “a server is idle AND the queue is non-empty.”'],
        ['Resource', 'A server or piece of equipment that entities seize during processing.'],
      ],
      [2400, 6626]
    ),
    spacer(),
    rule(),

    // Four Ways
    heading1('Four Ways to Build a Model'),
    body('People work differently. simmodlr supports four authoring approaches, all producing the same model format so you can mix and match:'),
    spacer(),
    bodyRuns([{ text: '1.  Forms & Tabs', bold: true }, ' — Step-by-step structured entry. Define entity types, queues, events, and distributions through dedicated editors. Good for precise control and iterative refinement.']),
    spacer(),
    bodyRuns([{ text: '2.  Visual Designer', bold: true }, ' — Drag-and-drop canvas. Draw your process as a flow diagram; nodes and connections translate directly into the simulation model. Good for communicating structure to stakeholders.']),
    spacer(),
    bodyRuns([{ text: '3.  AI Model Builder', bold: true }, ' — Describe the system in plain language inside simmodlr; the built-in AI generates a first model for you to review, adjust, and run. Good for rapid prototyping from a problem description.']),
    spacer(),
    bodyRuns([{ text: '4.  External LLM Import', bold: true }, ' — simmodlr publishes its full model schema. You can paste that schema into any external AI (ChatGPT, Claude, Gemini, or similar), ask it to build a model, and import the resulting JSON directly. This is particularly powerful when you already have detailed domain knowledge in a document you can share with the AI alongside the schema.']),
    rule(),

    // Step 1
    heading1('Step 1 — Build Your Model'),
    body('Regardless of whether you use the Visual Designer, type a description for the AI to interpret, paste the schema into an external LLM, or fill in the forms directly — this is what you are defining:'),
    spacer(),
    bodyRuns([{ text: 'Entities', bold: true }, ' — the things that move through your system. Give each class a name (Customer, Job, Patient) and the attributes it carries: priority (number), type (string with allowed values), urgent (boolean). Attributes can be mutable (changed during processing) or fixed at arrival.']),
    spacer(),
    bodyRuns([{ text: 'Queues', bold: true }, ' — where entities wait. Choose a discipline: FIFO, LIFO, priority-based, shortest job first, earliest due date, or any attribute you define. Optionally set a capacity limit, overflow destination, or balking probability.']),
    spacer(),
    bodyRuns([{ text: 'Activities', bold: true }, ' — where processing happens. Each activity has a resource (a server or machine with a defined capacity), a service time distribution, and the condition that must hold before service can start — built without writing code using the Predicate Builder.']),
    spacer(),
    bodyRuns([{ text: 'Sources and Sinks', bold: true }, ' — where entities enter and leave. A Source has an arrival distribution (or a Schedule); a Sink records throughput and time-in-system.']),
    spacer(),
    bodyRuns([{ text: 'Routing', bold: true }, ' — how entities move between stages. Fixed next-step, conditional (first-match predicate), or probabilistic (weighted split).']),
    spacer(),
    body('The Visual Designer shows all of this as a flow diagram as you build. Forms & Tabs give you fine-grained control over each element. AI modes generate the structure for you to review. The underlying model is the same either way.'),
    rule(),

    // Step 2
    heading1('Step 2 — Run'),
    body('Click Run to execute a single replication. Watch entities move through the system on the Execute canvas, inspect the step log, and check entity state mid-run.'),
    body('Use a single run to verify the model behaves as expected before investing time in a full experiment.'),
    rule(),

    // Step 3
    heading1('Step 3 — Experiment'),
    body('Once the model is validated, move to an Experiment (or Study). Experiments let you test what happens when you vary a parameter — server capacity, inter-arrival rate, batch size — across a defined range. simmodlr runs multiple replications for each parameter value, averages the results with confidence intervals, and surfaces where differences are statistically significant.'),
    body('This is where simulation earns its value: not one answer, but a map of how the system responds to change.'),
    rule(),

    // Step 4
    heading1('Step 4 — Read Results and Use the Model Assistant'),
    body('Key outputs per resource and queue:'),
    bullet('Utilisation — average fraction of time in use'),
    bullet('Mean queue length and mean wait time'),
    bullet('Throughput — entities served per time unit'),
    bullet('Renege / abandonment count — entities that left before being served'),
    spacer(),
    bodyRuns([
      'The ',
      { text: 'Model Assistant', bold: true },
      ' lets you ask plain-language questions about your results: “Which queue is the main bottleneck?”, “What happens to utilisation if I add a second server?” Answers are grounded in the actual run data.'
    ]),
    body('Use the Report button to generate a formatted summary (Senior Management or Technical depth, HTML or Markdown).'),
    body('For deeper analysis, use Export to LLM to bundle the model and results into a single document you can paste into any external AI tool.'),
  ];

  return new Document({
    numbering: numbering(),
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } }
    },
    sections: [{
      properties: pageProps(),
      footers: { default: footer() },
      children
    }]
  });
}

// ── DOCUMENT 2: Capabilities Overview ───────────────────────────────────────

function buildCapabilities() {
  const children = [

    // Title
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: 'simmodlr — Capabilities Overview', font: 'Arial', size: 40, bold: true, color: '1F4E79' })]
    }),
    body('simmodlr is a professional discrete-event simulation (DES) platform for modellers who need rigorous results without writing code. It implements the Three-Phase Method (A/B/C), a well-established simulation paradigm used across manufacturing, healthcare, logistics, and service design.'),
    rule(),

    // Model Authoring
    heading1('Model Authoring — Four Ways to Work'),
    body('People work differently. simmodlr provides four authoring modes, all working from the same underlying model format:'),
    spacer(),
    simpleTable(
      ['Mode', 'Best for'],
      [
        ['Forms & Tabs', 'Precise, structured entry — entities, queues, events configured step by step'],
        [
          'Visual Designer',
          [new Paragraph({ children: [new TextRun({ text: 'Drag-and-drop canvas — see your process as a flow diagram while you build it. Includes a library of built-in ', font: 'Arial', size: 20 }), new TextRun({ text: 'patterns', font: 'Arial', size: 20, bold: true }), new TextRun({ text: ' (single-queue service, multi-stage pipeline, batching, reneging, priority queues, and more) that you can drop in as starting points and adapt.', font: 'Arial', size: 20 })]})]
        ],
        ['AI Model Builder', 'Describe the system in plain language; the built-in AI generates a first model to review and refine'],
        ['External LLM Import', 'Share simmodlr’s published schema with any external AI (ChatGPT, Claude, Gemini, etc.); import the resulting model JSON directly — especially powerful when you can provide the AI with your own domain documents alongside the schema'],
      ],
      [2800, 6226]
    ),
    spacer(),
    rule(),

    // Model Library
    heading1('Model Library, Templates & Versions'),
    body('All models are stored in the Model Library — a searchable collection of everything you have built. From the library you can open, duplicate, or delete any model, and re-run it at any time against its original configuration or a new experiment.'),
    body('Templates provide pre-built starting points for common problem types — a single-server queue, a multi-stage production line, an appointment system with reneging — so you are not starting from a blank canvas. Open a template, adapt the parameters to your situation, and run.'),
    body('Version management tracks changes to a model over time, letting you see how it has evolved and return to an earlier state if needed.'),
    rule(),

    // Entity System
    heading1('Entity System'),
    body('Entities carry typed attributes you define:'),
    bullet([{ text: 'number', bold: true }, ' — priority levels, counts, sizes (supports ==, !=, <, >, <=, >=)']),
    bullet([{ text: 'string', bold: true }, ' — categories with optional allowed-value dropdowns (supports ==, !=)']),
    bullet([{ text: 'boolean', bold: true }, ' — flags and switches']),
    spacer(),
    body('Attributes can be mutable (modified during processing) or immutable (set at arrival, never changed). Entities track their full journey — arrival time, wait at each stage, outcome — for downstream analysis.'),
    rule(),

    // Macros
    heading1('Process Logic — 19 Built-in Macros'),
    body('The engine vocabulary covers all standard DES patterns without free-text scripting:'),
    spacer(),
    simpleTable(
      ['Category', 'Macros'],
      [
        ['Core lifecycle', 'ARRIVE, SEIZE, COMPLETE, RELEASE, RENEGE'],
        ['Assembly & grouping', 'BATCH, UNBATCH, MATCH, SPLIT'],
        ['Multi-resource', 'COSEIZE'],
        ['Reliability', 'FAIL, REPAIR, PREEMPT'],
        ['State management', 'SET, SET_ATTR, ASSIGN, COST'],
        ['Inventory / tanks', 'FILL, DRAIN'],
        ['Queue management', 'RENEGE_OLDEST'],
      ],
      [3000, 6026]
    ),
    spacer(),
    rule(),

    // Queues & Routing
    heading1('Queues & Routing'),
    bodyRuns([{ text: 'Six queue disciplines:', bold: true }, ' FIFO, LIFO, PRIORITY (by numeric attribute), SPT (shortest processing time), EDD (earliest due date), PRIORITY(attrName) (any attribute you choose).']),
    bodyRuns([{ text: 'Three routing modes:', bold: true }, ' Fixed next queue, conditional routing (first-match predicate), probabilistic routing (weighted random split).']),
    bodyRuns([{ text: 'Queue controls:', bold: true }, ' Finite capacity with overflow destination, balking probability (entities that never join), patience-based reneging.']),
    rule(),

    // Distributions
    heading1('Probability Distributions'),
    body('Ten distribution types for arrivals, service times, and patience: Exponential, Uniform, Normal, Triangular, Fixed (deterministic), Erlang, Empirical (values imported from CSV), Piecewise time-varying (different distributions at different clock times), Schedule (planned arrival times with per-entity attribute overrides — see Schedules below), and Entity/Server attribute-driven (sampling from an entity or server’s own attribute value).'),
    body('All sampling uses a seeded PRNG — identical seeds produce identical results, enabling fully reproducible experiments.'),
    rule(),

    // Schedules
    heading1('Schedules'),
    body('Where a statistical distribution models a variable arrival pattern, a Schedule defines a planned set of arrivals at specific times — closer to how real timetables, appointment systems, or production plans work. A model can hold multiple named schedules (a normal day, a peak day, a stress test) and you select which one to use at run time, making it straightforward to test how the same system copes with different demand patterns without changing the model itself.'),
    rule(),

    // Resources
    heading1('Resources & Shift Scheduling'),
    body('Resources have configurable capacity. Capacity can follow a shift schedule — a time-varying plan that adds or removes server instances at specified clock times, making it straightforward to model day/night shifts or staffing changes.'),
    body('Servers can be configured with failure distributions (MTBF, MTTR) to simulate equipment breakdowns and repair cycles.'),
    rule(),

    // Run Experiment Study
    heading1('Run, Experiment, and Study'),
    bodyRuns([{ text: 'A Run', bold: true }, ' executes a single replication. Use it to validate that your model behaves correctly — watch entities on the live canvas, inspect the step log, check intermediate state. Results from every run are stored automatically and linked to the model, so you can compare earlier runs against new ones without re-running and re-configuring from scratch.']),
    spacer(),
    bodyRuns([{ text: 'An Experiment', bold: true }, ' runs multiple replications across one or more parameter values, pooling results with confidence intervals and testing whether observed differences are statistically significant. Vary server capacity, arrival rate, service time, or any other parameter across a range and see how the system responds.']),
    spacer(),
    bodyRuns([{ text: 'Studies', bold: true }, ' let you compose and compare multiple experiment configurations — building a structured body of evidence for a decision.']),
    rule(),

    // Statistical Output
    heading1('Statistical Output'),
    bullet('Per-queue: mean length, mean wait, max length, throughput, renege count, confidence intervals'),
    bullet('Per-resource: mean utilisation, busy count, failure statistics'),
    bullet('Per-entity-class: mean time-in-system, wait and service time histograms'),
    bullet('Experiment-level: one-way ANOVA to test whether scenario differences are statistically significant; Tukey HSD post-hoc comparisons to identify which specific pairs differ'),
    bullet('Cost tracking: cumulative model-wide cost and per-entity cost via the COST macro'),
    rule(),

    // Model Assistant
    heading1('Model Assistant & Reporting'),
    body('The Model Assistant answers plain-language questions about your model and results — “Where is the bottleneck?”, “What would happen with one more server?” — with answers grounded directly in the simulation output.'),
    body('Results can also be exported directly to an external LLM — the tool bundles the model structure and run output into a single document you can paste into ChatGPT, Claude, or any other AI for deeper or customised analysis beyond what the built-in Model Assistant provides.'),
    body('The Report generator produces four variants: Senior Management or Technical depth × HTML or Markdown format, covering KPIs, bottleneck identification, queue analysis, and scenario recommendations.'),
    rule(),

    // Real-Time
    heading1('Real-Time Data Integration'),
    body('Models can connect to live external data sources via the adapter layer. A REST adapter polls an endpoint on a configurable interval, updating arrival rates or service parameters dynamically during a run. Custom adapters can be registered without modifying the engine.'),
  ];

  return new Document({
    numbering: numbering(),
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } }
    },
    sections: [{
      properties: pageProps(),
      footers: { default: footer() },
      children
    }]
  });
}

// ── Write files ──────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, '..', 'docs');

Packer.toBuffer(buildQuickStart()).then(buf => {
  fs.writeFileSync(path.join(outDir, 'quick-start-guide.docx'), buf);
  console.log('Written: docs/quick-start-guide.docx');
});

Packer.toBuffer(buildCapabilities()).then(buf => {
  fs.writeFileSync(path.join(outDir, 'capabilities-overview.docx'), buf);
  console.log('Written: docs/capabilities-overview.docx');
});
