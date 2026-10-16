# Flow for AI assistants (local MCP server)

Connects an AI assistant on your computer to Flow. The assistant can then:

- **read Flow's model format**: the same reference as the prompt pack, a section at a time;
- **check** a model with Flow's own validator, and fix what it reports;
- **run** a model with Flow's own simulation engine, over several replications, with 95% confidence intervals and warnings about bottlenecks, overload and noisy results;
- **save** the model as a file you open in Flow with **+ New Model → Import a file**.

Everything runs on your computer. Models are plain JSON files in one folder, `Documents/Flow models` by default. Nothing is sent to Flow's servers, and you don't need to sign in.

It works with desktop AI apps that support MCP: Claude Desktop, Claude Code, Cursor, VS Code and others. It doesn't work in the claude.ai website or phone apps.

## Install

### Claude Desktop (one click)

1. Download **`flow.mcpb`** (from the Flow release page).
2. Double-click it, or drag it onto Claude Desktop, and choose **Install**.
3. Optionally pick a different models folder in the extension's settings.

### Any other MCP app (Claude Code, Cursor, VS Code, …)

You need [Node.js](https://nodejs.org) 20 or later.

1. Download **`flow-mcp.mjs`** (from the Flow release page) and keep it somewhere permanent.
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

To improve an existing model, export it from Flow into the models folder and ask, for example: "Open *Bike shop.json*. Why is the repair queue so long, and what would fix it?"

If your app shows MCP prompts, there is also a **build_model** prompt that asks for a description of the system.

### Tools

| Tool | What it does |
|---|---|
| `flow_get_schema` | The model format: generation protocol, common mistakes, section list; any section on request |
| `flow_list_models` | Model files in the folder |
| `flow_read_model` | A model file's JSON |
| `flow_validate_model` | Flow's validator: errors (block running) and warnings, with rule codes |
| `flow_run_model` | Several replications (default 10, max 50) with 95% CIs; queues, utilisation, things to check |
| `flow_save_model` | Saves a Flow export file; refuses a model with errors unless asked; never overwrites unless asked |

## For maintainers

The server reuses Flow's own code from `../src`: the engine, the validator, the KPI extraction and the confidence intervals. `build.mjs` bundles it, with the schema reference (`../docs/model-schema-for-llm.md`) inlined, into one file that needs nothing installed.

```sh
cd mcp
npm install
npm test        # builds dist/flow-mcp.mjs, then runs the end-to-end tests over MCP stdio
npm run pack    # also builds dist/flow.mcpb (Claude Desktop extension)
```

The tool logic (`src/tools.js`, `src/schema.js`) is also covered by `tests/mcp/` in the main test suite.

**Releasing:** bump `version` in both `package.json` and `bundle/manifest.json` (`pack` refuses a mismatch). Run `npm run pack`, then attach `dist/flow.mcpb` and `dist/flow-mcp.mjs` to a GitHub release.

Rebuild whenever the engine or the schema reference changes, since the bundle contains a copy of both.
