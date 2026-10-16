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
import { VERSION, MAX_REPLICATIONS, DEFAULT_REPLICATIONS, ToolError, listModels, readModel, validate, run, save } from './tools.js';

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
3. flow_run_model (10+ replications). Read the results and "Things to check" critically: does the behaviour match what the person described? Fix structure or numbers that don't.
4. flow_save_model with a clear name. Tell the person the file name and that they open it in Flow with + New Model → Import a file.
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
  description: `Run a model with Flow's simulation engine for several replications and report the results with 95% confidence intervals: completions, waits, time in system, per-queue waits, resource utilisation, plus warnings about bottlenecks, overload, noisy results and engine limits. Uses the model's own experiment settings unless overridden. Up to ${MAX_REPLICATIONS} replications.`,
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
