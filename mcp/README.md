# Flow for AI assistants (local MCP server)

Connects an AI assistant on your computer to Flow. The assistant can then:

- **read Flow's model format**: the same reference as the prompt pack, a section at a time;
- **check** a model with Flow's own validator, and fix what it reports;
- **run** a model with Flow's own simulation engine, over several replications, with 95% confidence intervals and warnings about bottlenecks, overload and noisy results;
- **try a range of values** for one parameter ("how many nurses do I need?");
- **trace** one run to find out why a model misbehaves (rules that never fire, entities stuck);
- **edit** a saved model a few values at a time;
- **save** the model as a file you open in Flow with **+ New Model → Import a file**.

Everything runs on your computer. Models are plain JSON files in one folder, `Documents/Flow models` by default. Nothing is sent to Flow's servers, and you don't need to sign in.

It works with desktop AI apps that support MCP: Claude Desktop, Claude Code, Cursor, VS Code and others. It doesn't work in the claude.ai website or phone apps.

## Install

### Claude Desktop (one click)

1. In Flow's Model Library, click **Connect AI app** and download **`flow.mcpb`**.
2. Double-click it, or drag it onto Claude Desktop, and choose **Install**.
3. Optionally pick a different models folder in the extension's settings.

### Any other MCP app (Claude Code, Cursor, VS Code, …)

You need [Node.js](https://nodejs.org) 20 or later.

1. In Flow's Model Library, click **Connect AI app** and download **`flow-mcp.mjs`**. Keep it somewhere permanent.
2. Add it to your app's MCP settings. For example, in Claude Desktop's `claude_desktop_config.json`, or Cursor's `mcp.json`:

   ```json
   {
     "mcpServers": {
       "flow": {
         "command": "node",
         "args": ["/path/to/flow-mcp.mjs", "--folder", "/path/to/Flow models"]
       }
     }
   }
   ```

   For Claude Code:

   ```sh
   claude mcp add flow -- node /path/to/flow-mcp.mjs --folder "/path/to/Flow models"
   ```

3. Restart the app. "flow" appears in its list of tools.

`--folder` is optional; without it, models go to `Documents/Flow models`.

## Use

Just ask. For example:

> Build me a Flow model of a GP surgery: patients arrive about every 4 minutes, a nurse triages them, then one of 3 GPs sees them for about 10 minutes. I want to know waiting times.

The assistant then:
1. reads the format;
2. drafts the model;
3. validates it and fixes the errors;
4. runs it and checks the results make sense;
5. saves it, telling you the file name.

In Flow, choose **+ New Model → Import a file** and pick that file.

To improve an existing model, export it from Flow into the models folder and ask, for example: "Open *Bike shop.json*. Why is the repair queue so long, and what would fix it?" The assistant can see when the queue builds (`flow_run_over_time`), trace a run to see what happened (`flow_trace_run`), try a range of staffing levels (`flow_sweep_parameter`), check whether a fix really helps (`flow_compare_models`) and make the change in the file (`flow_edit_model`).

If your app shows MCP prompts, there is also a **build_model** prompt that asks for a description of the system.

### Tools

| Tool | What it does |
|---|---|
| `flow_get_schema` | The model format: generation protocol, common mistakes, section list; any section on request |
| `flow_list_models` | Model files in the folder |
| `flow_read_model` | A model file's JSON |
| `flow_validate_model` | Flow's validator: errors (block running) and warnings, with rule codes |
| `flow_run_model` | Several replications (default 10, max 50) with 95% CIs; queues, utilisation, how entities finished, the model's goals (met in how many replications), things to check |
| `flow_compare_models` | Two versions with the same random numbers (default 20 paired replications); each difference with a paired 95% CI, split into real differences and ones that could be chance |
| `flow_run_over_time` | Waiting per queue, % busy per resource, work in progress and container levels, period by period (default 8 periods, averaged over 5 replications) |
| `flow_sweep_parameter` | One parameter (server count, a capacity, a distribution parameter, a starting value…) at up to 12 values, each on the same random numbers (default 5 replications per value): completions, waits, time in system, % busy and goals met per value. Without `parameter`, lists what can be varied |
| `flow_trace_run` | One run: how often each rule and event fired and which never did, who was still in the system at the end and where, one entity's path, and the event log (window with `from`/`until`, filter with `entity`) |
| `flow_edit_model` | Changes to a saved file by path, e.g. `entityTypes/Nurse/count` = 3 (set, remove, append); shows errors added or fixed, refuses to save errors unless asked, keeps the canvas layout |
| `flow_save_model` | Saves a Flow export file; refuses a model with errors unless asked; never overwrites unless asked |

## For maintainers

The server reuses Flow's own code from `../src`: the engine, the validator, the KPI extraction and the confidence intervals. `build.mjs` bundles it, with the schema reference (`../docs/model-schema-for-llm.md`) inlined, into one file that needs nothing installed.

```sh
cd mcp
npm install
npm test        # builds dist/flow-mcp.mjs, then runs the end-to-end tests over MCP stdio
npm run pack    # also builds dist/flow.mcpb, then publishes both to ../public/downloads/
npm run check   # fails if public/downloads/ doesn't match a fresh build
```

The tool logic (`src/tools.js`, `src/schema.js`) is also covered by `tests/mcp/` in the main test suite.

**How users get it:** Flow serves both files from `public/downloads/`, which the **Connect AI app** dialog in the Model Library links to (`src/ui/AiAppConnectModal.jsx`). Nobody needs GitHub. `npm run pack` writes them there; commit them along with your change.

**Keeping them current:** the bundle contains copies of the engine and the schema reference. So after changing either, run `npm run pack` and commit `public/downloads/`. The **Flow MCP downloads** CI workflow (`.github/workflows/mcp-bundle.yml`) runs `npm run check` and the end-to-end tests on any change to the bundled sources, and fails if the published files are stale.

**New version:** bump `version` in both `package.json` and `bundle/manifest.json` (`pack` refuses a mismatch), then `npm run pack`.
