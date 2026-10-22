# Flow for AI assistants (local MCP server)

Connects an AI assistant on your computer to Flow. The assistant can then:

- **read Flow's model format**: the same reference as the prompt pack, a section at a time;
- **check** a model with Flow's own validator, and fix what it reports;
- **run** a model with Flow's own simulation engine, over several replications, with 95% confidence intervals and warnings about bottlenecks, overload and noisy results;
- **try a range of values** for one parameter ("how many nurses do I need?");
- **trace** one run to find out why a model misbehaves (rules that never fire, entities stuck);
- **edit** a saved model a few values at a time;
- **save** the model as a file;
- **open** it in Flow in your browser, as a new model or as an update to the model it was exported from.

Everything runs on your computer. Models are plain JSON files in one folder, `Documents/Flow models` by default. Your models are never sent anywhere, and the assistant doesn't need your Flow sign-in: when it opens a model in Flow, the model travels in the link's `#` part, which your browser keeps to itself, and you save it there yourself.

**Updates:** each time it starts, the server fetches a small version file from Flow's website. If a newer version is out, your assistant tells you, and you update by downloading it again from **Connect AI app**. Nothing about you or your models is sent. To turn this off: in Claude Desktop, untick **Check for updates** in the extension's settings; elsewhere, add `--no-update-check` to the server's arguments (or set `FLOW_MCP_UPDATE_CHECK=off`).

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
5. saves it, telling you the file name;
6. if you ask, opens it in Flow (`flow_open_in_app`): your browser shows a preview and you choose **Save to my models**.

You can also import the file yourself: **+ New Model → Import a file**.

### Changing a model you already have in Flow

1. In Flow, export the model (**Access** tab → **Export Model**) into the models folder. The file remembers which model it came from.
2. Ask the assistant to work on it. It edits the file with `flow_edit_model`.
3. Ask it to open the result in Flow. The preview offers **Update "your model"**: Flow saves the current model as a version first (so you can go back in **Version history**), then replaces it. You can still choose **Save as a new model**. Only the model's owner or an editor gets the update option.

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
| `flow_save_model` | Saves a Flow export file; refuses a model with errors unless asked; never overwrites unless asked (an overwrite keeps the file's link to the Flow model it was exported from) |
| `flow_open_in_app` | Opens a model file in Flow in the browser through a compressed `#import` link (written to a local page, so there's no length limit from the command line). A file exported from Flow opens as an update to that model; `asNew` adds a new model instead |

## For maintainers

The server reuses Flow's own code from `../src`: the engine, the validator, the KPI extraction and the confidence intervals. `build.mjs` bundles it, with the schema reference (`../docs/model-schema-for-llm.md`) inlined, into one file that needs nothing installed.

```sh
cd mcp
npm install
npm test        # builds dist/flow-mcp.mjs, then runs the end-to-end tests over MCP stdio
npm run pack    # also builds dist/flow.mcpb, then publishes both, with flow-mcp-version.json, to ../public/downloads/
```

The tool logic (`src/tools.js`, `src/schema.js`, `src/update-check.js`) is also covered by `tests/mcp/` in the main test suite.

**Opening in Flow:** `flow_open_in_app` builds `https://des.simmodlr.app/#import?z=<deflate-raw, base64url>&target=<model id>` with the app's own `src/utils/importLink.js` (override the address with `FLOW_APP_URL`), writes a page that redirects to it in the temp folder and opens that page. `FLOW_MCP_NO_BROWSER=1` writes the page without opening it. `target` comes from `sourceModelId`, which Flow's export writes and `flow_edit_model` / `flow_save_model` (overwrite) keep. The app's import preview (`src/ui/ImportPreview.jsx`) offers the update only when that model is in the user's library and they can edit it.

**How users get it:** Flow serves the files from `/downloads/`, which the **Connect AI app** dialog in the Model Library links to (`src/ui/AiAppConnectModal.jsx`). Nobody needs GitHub.

**Keeping them current:** nothing to do by hand. The app's `npm run build` runs `build:mcp` first (the root `prebuild` script), which installs this package and runs `npm run pack`, so every deploy serves a bundle built from the same commit as the app. The files in `public/downloads/` are build output and are git-ignored. For `npm run dev`, run `npm run build:mcp` once if you want the download links to work locally. The **Flow MCP server** CI workflow (`.github/workflows/mcp-bundle.yml`) runs the end-to-end tests and packs the extension whenever anything the bundle contains changes; the main CI's build job builds it too.

**Versions:** `package.json` is the only place the version is set. The build passes it to the server and to the extension's manifest, and stamps the build with the git commit (`0.3.0`, build `8b81d3c`): the server reports both, the Connect AI app dialog shows them, and saved files record them in `appVersion`. To release a new version, bump `version` in `package.json` and deploy.

**Update check:** `flow-mcp-version.json` (`{ version, build, published }`), published next to the downloads, is what installed servers check at startup (`src/update-check.js`, default `https://des.simmodlr.app/downloads/flow-mcp-version.json`; override with `FLOW_MCP_UPDATE_URL`). A newer version adds a note to the next tool result, once per session. The check gives up after 3 seconds and ignores any failure. Users only hear about versions you deploy, so bump the version when a release changes what the tools do.
