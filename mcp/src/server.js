// Flow MCP server — local (stdio). Lets an AI assistant on the user's own
// computer (Claude Desktop, Claude Code, Cursor, VS Code, …) read Flow's
// model format, validate and run models with Flow's real engine, and save
// them as files Flow imports. See ../README.md for setup.

import './stdio-guard.js';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadSchemaText, schemaExcerpt } from './schema.js';
import {
  VERSION, MAX_REPLICATIONS, DEFAULT_REPLICATIONS, DEFAULT_PERIODS, MAX_PERIODS, MAX_SWEEP_POINTS, MAX_SWEEP_RUNS, DEFAULT_SWEEP_REPLICATIONS,
  DEFAULT_TRACE_LINES, MAX_TRACE_LINES, MAX_EDIT_CHANGES,
  ToolError, listModels, readModel, validate, run, compare, runOverTime, sweep, traceRun, editModel, save,
} from './tools.js';

function modelsFolder(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--folder');
  // A desktop extension passes the folder setting as FLOW_MODELS_DIR; left
  // unset, it arrives as the literal "${user_config.…}" placeholder.
  const fromEnv = process.env.FLOW_MODELS_DIR;
  const env = fromEnv && !fromEnv.includes('${') ? fromEnv : null;
  const raw = (i >= 0 && argv[i + 1]) || env || path.join(os.homedir(), 'Documents', 'Flow models');
  return path.resolve(raw.replace(/^~(?=$|[\\/])/, os.homedir()));
}

const FOLDER = modelsFolder();

const WORKFLOW = `How to build a Flow model with these tools:
1. Read the format first: flow_get_schema() gives the generation protocol, the most common mistakes and the list of sections; fetch the sections you need (e.g. "1, 2, 3, 4, 5, 6").
2. Draft the model JSON, then flow_validate_model. Fix every error and re-validate until there are none.
3. flow_run_model (10+ replications). Read the results, goals and "Things to check" critically: does the behaviour match what the person described? Fix structure or numbers that don't. To see WHEN queues build or resources saturate, use flow_run_over_time. If something looks wrong (nothing completes, a queue never empties, a rule never fires), use flow_trace_run to see what actually happened in one run.
4. To judge a change (an extra server, a new rule), use flow_compare_models rather than two separate runs: it uses the same random numbers in both and says which differences are real and which could be chance. To find a good setting ("how many nurses?"), use flow_sweep_parameter over a range of values.
5. flow_save_model with a clear name. Tell the person the file name and that they open it in Flow with + New Model → Import a file. For later small changes to a saved model, use flow_edit_model instead of re-sending the whole model.
Quote results with their confidence intervals, and say which numbers you assumed.`;

const server = new McpServer(
  { name: 'flow', version: VERSION },
  { instructions: `Tools for Flow, a discrete-event simulation app. Models are JSON files in ${FOLDER}.\n\n${WORKFLOW}` },
);

const modelArg = z.any().optional().describe('The model: a Flow model JSON object (or a Flow export with model_json). Give this or `file`.');
const fileArg = z.string().optional().describe('A model file in the Flow models folder, e.g. "GP surgery.json". Give this or `model`.');

function text(t) { return { content: [{ type: 'text', text: t }] }; }

// Turns expected problems (bad JSON, missing file) into a readable tool
// error the assistant can act on, rather than a protocol error.
function handler(fn) {
  return async args => {
    try { return text(await fn(args || {})); }
    catch (e) {
      const msg = e instanceof ToolError ? e.message : `Unexpected error: ${e?.message || e}`;
      return { ...text(msg), isError: true };
    }
  };
}

server.registerTool('flow_get_schema', {
  title: 'Flow model format',
  description: 'The Flow model JSON format. With no section: the mandatory generation protocol, the most common mistakes and the list of sections. With `section`: those sections (number or title words, comma-separated, or "all").',
  inputSchema: { section: z.string().optional().describe('e.g. "5", "6.1", "Distributions", "2, 3, 5" or "all"') },
  annotations: { readOnlyHint: true },
}, handler(({ section }) => schemaExcerpt(loadSchemaText(), section)));

server.registerTool('flow_list_models', {
  title: 'List Flow models',
  description: `List the model files in the Flow models folder (${FOLDER}).`,
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, handler(() => listModels(FOLDER)));

server.registerTool('flow_read_model', {
  title: 'Read a Flow model',
  description: 'Read a model file from the Flow models folder (for example one exported from Flow) and return its JSON.',
  inputSchema: { file: z.string().describe('File name, e.g. "Bike shop.json"') },
  annotations: { readOnlyHint: true },
}, handler(({ file }) => readModel(FOLDER, file)));

server.registerTool('flow_validate_model', {
  title: 'Validate a Flow model',
  description: 'Check a model with Flow\'s own validator. Returns blocking errors (Flow won\'t run the model) and warnings, each with its rule code.',
  inputSchema: { model: modelArg, file: fileArg },
  annotations: { readOnlyHint: true },
}, handler(args => validate(args, FOLDER)));

server.registerTool('flow_run_model', {
  title: 'Run a Flow model',
  description: `Run a model with Flow's simulation engine for several replications and report the results with 95% confidence intervals: completions, waits, time in system, per-queue waits, resource utilisation, how entities finished (by route), the model's goals (met or missed, in how many replications), plus warnings about bottlenecks, overload, noisy results and engine limits. Uses the model's own experiment settings unless overridden. Up to ${MAX_REPLICATIONS} replications.`,
  inputSchema: {
    model: modelArg,
    file: fileArg,
    replications: z.number().int().min(1).max(MAX_REPLICATIONS).optional().describe(`Default ${DEFAULT_REPLICATIONS}`),
    maxSimTime: z.number().positive().optional().describe('Run length in the model\'s time unit (default: the model\'s own setting, else 500)'),
    warmupPeriod: z.number().min(0).optional().describe('Warm-up excluded from results (default: the model\'s own setting, else 0)'),
    seed: z.number().int().optional().describe('Base random seed; replication i uses seed + i'),
  },
  annotations: { readOnlyHint: true },
}, handler(args => run(args, FOLDER)));

const runSettingsArgs = {
  maxSimTime: z.number().positive().optional().describe('Run length in the model\'s time unit (default: the model\'s own setting, else 500)'),
  warmupPeriod: z.number().min(0).optional().describe('Warm-up excluded from results (default: the model\'s own setting, else 0)'),
  seed: z.number().int().optional().describe('Base random seed; replication i uses seed + i'),
};

server.registerTool('flow_compare_models', {
  title: 'Compare two versions of a Flow model',
  description: 'Run two versions (A = current, B = changed) with the same run settings and the same random numbers, and report, for each result, A vs B and the difference with a paired 95% confidence interval, split into real differences and ones that could be chance. Also shows each version\'s goals. Use this to judge whether a change actually helps.',
  inputSchema: {
    modelA: modelArg, fileA: fileArg, labelA: z.string().optional().describe('Short name for A, e.g. "1 nurse"'),
    modelB: modelArg, fileB: fileArg, labelB: z.string().optional().describe('Short name for B, e.g. "2 nurses"'),
    replications: z.number().int().min(2).max(MAX_REPLICATIONS).optional().describe('Paired replications (default 20)'),
    ...runSettingsArgs,
  },
  annotations: { readOnlyHint: true },
}, handler(args => compare(args, FOLDER)));

server.registerTool('flow_run_over_time', {
  title: 'Flow results over time',
  description: `Run a model and show how things change through the run: how many are waiting in each queue, how busy each resource is, work in progress and container levels, averaged over each of ${DEFAULT_PERIODS} equal periods (up to ${MAX_PERIODS}) and across replications. Use it to see when queues build up or resources saturate.`,
  inputSchema: {
    model: modelArg,
    file: fileArg,
    periods: z.number().int().min(2).max(MAX_PERIODS).optional().describe(`Number of equal periods (default ${DEFAULT_PERIODS})`),
    replications: z.number().int().min(1).max(MAX_REPLICATIONS).optional().describe('Default 5'),
    ...runSettingsArgs,
  },
  annotations: { readOnlyHint: true },
}, handler(args => runOverTime(args, FOLDER)));

server.registerTool('flow_sweep_parameter', {
  title: 'Try a range of values for one parameter',
  description: `Answer "how many X do I need?" or "what if service took longer?": run the model at each of several values of one parameter (server count, shift or queue capacity, a distribution parameter, a state variable's starting value…) and show a table of completions, waits, time in system, utilisation and goals met per value, with 95% intervals. Every value uses the same random numbers. Call it without \`parameter\` to list what can be varied. Up to ${MAX_SWEEP_POINTS} values and ${MAX_SWEEP_RUNS} runs in total.`,
  inputSchema: {
    model: modelArg,
    file: fileArg,
    parameter: z.string().optional().describe('The parameter, by its name in the list (e.g. "Number of Nurse"). Omit to get the list.'),
    values: z.array(z.number()).optional().describe('The values to try, e.g. [2, 3, 4, 5]. Or use from/to/step.'),
    from: z.number().optional(),
    to: z.number().optional(),
    step: z.number().positive().optional().describe('Default 1'),
    replications: z.number().int().min(1).max(MAX_REPLICATIONS).optional().describe(`Per value (default ${DEFAULT_SWEEP_REPLICATIONS})`),
    ...runSettingsArgs,
  },
  annotations: { readOnlyHint: true },
}, handler(args => sweep(args, FOLDER)));

server.registerTool('flow_trace_run', {
  title: 'Trace one run of a Flow model',
  description: 'Run the model once and show what actually happened: how often each rule (C-event) and event (B-event) fired and which never did, who was still in the system at the end and where, one entity\'s path through the model if asked, and the event log. Use it to find why a model misbehaves — entities stuck, a queue that never empties, a rule that never fires.',
  inputSchema: {
    model: modelArg,
    file: fileArg,
    from: z.number().min(0).optional().describe('Show the event log from this time (default 0)'),
    until: z.number().positive().optional().describe('Stop the run and the log at this time — needed for long runs'),
    entity: z.number().int().optional().describe('Only events involving this entity id (e.g. 119 for #119), plus its path'),
    limit: z.number().int().min(1).max(MAX_TRACE_LINES).optional().describe(`Event log lines (default ${DEFAULT_TRACE_LINES})`),
    seed: z.number().int().optional().describe('Random seed (default: the model\'s own)'),
    maxSimTime: runSettingsArgs.maxSimTime,
    warmupPeriod: runSettingsArgs.warmupPeriod,
  },
  annotations: { readOnlyHint: true },
}, handler(args => traceRun(args, FOLDER)));

server.registerTool('flow_edit_model', {
  title: 'Edit a saved Flow model',
  description: `Change parts of a model file in the Flow models folder without re-sending the whole model, then validate and save it in place (keeping its canvas layout). Each change has a \`path\` of names or positions separated by "/" — e.g. "entityTypes/Nurse/count", "bEvents/Patient Arrival/schedules/0/distParams/mean", "queues/Triage/capacity" — and op "set" (default), "remove" or "append" (to a list; or set ".../-"). List items can be named by id or name. Shows each change, and errors and warnings it added or fixed. Refuses to save a model with errors unless allowErrors is true. Up to ${MAX_EDIT_CHANGES} changes per call.`,
  inputSchema: {
    file: z.string().describe('The model file, e.g. "GP surgery.json"'),
    changes: z.array(z.object({
      path: z.string(),
      op: z.enum(['set', 'remove', 'append']).optional(),
      value: z.any().optional(),
    })).min(1).max(MAX_EDIT_CHANGES),
    dryRun: z.boolean().optional().describe('Show the result of the changes without saving'),
    allowErrors: z.boolean().optional(),
  },
  annotations: { destructiveHint: true, idempotentHint: false },
}, handler(args => editModel(args, FOLDER)));

server.registerTool('flow_save_model', {
  title: 'Save a Flow model',
  description: 'Save a model to the Flow models folder as a file Flow can import (+ New Model → Import a file). Validates first and refuses a model with errors unless allowErrors is true. Never overwrites an existing file unless overwrite is true: it adds " (2)", " (3)"… instead.',
  inputSchema: {
    name: z.string().describe('Model name, also used for the file name'),
    model: z.any().describe('The model JSON object'),
    description: z.string().optional(),
    overwrite: z.boolean().optional(),
    allowErrors: z.boolean().optional(),
  },
  annotations: { destructiveHint: false },
}, handler(args => save(args, FOLDER)));

server.registerPrompt('build_model', {
  title: 'Build a Flow model',
  description: 'Describe a system; the assistant builds, checks, runs and saves a Flow model for it.',
  argsSchema: { system: z.string().describe('The system to model, in plain words') },
}, ({ system }) => ({
  messages: [{
    role: 'user',
    content: { type: 'text', text: `Build a Flow discrete-event simulation model of this system:\n\n${system}\n\n${WORKFLOW}\nAsk me about anything essential you can't reasonably assume, and list the assumptions you made.` },
  }],
}));

await server.connect(new StdioServerTransport());
console.error(`Flow MCP ${VERSION} ready — models folder: ${FOLDER}`);
