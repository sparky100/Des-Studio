// src/engine/simpy-runner-worker.js
// Module Web Worker — runs SimPy scripts via Pyodide WebAssembly

let pyodide = null;
let bootResolve, bootReject;
const bootDone = new Promise((res, rej) => { bootResolve = res; bootReject = rej; });

async function boot() {
  const { loadPyodide } = await import(
    /* @vite-ignore */
    "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs"
  );
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync("import micropip; await micropip.install('simpy')");
  bootResolve();
  self.postMessage({ type: "ready" });
}

boot().catch(err => {
  bootReject(err);
  self.postMessage({ type: "error", message: `Pyodide init failed: ${err.message}` });
});

self.addEventListener("message", async ({ data }) => {
  if (data.type !== "run") return;
  try {
    await bootDone;

    const jsonScript = data.script.replace('RUN_MODE       = "text"', 'RUN_MODE       = "json"');

    // Pass the script as a Python variable to avoid any quoting issues, then
    // run it via exec() with StringIO stdout capture. This is more reliable
    // than setStdout({ batched }) whose timing varies across Pyodide versions.
    pyodide.globals.set("_simpy_script", jsonScript);

    const output = await pyodide.runPythonAsync(`
import sys as _sys, io as _io
_prev = _sys.stdout
_buf  = _io.StringIO()
_sys.stdout = _buf
try:
    exec(compile(_simpy_script, "<simpy>", "exec"), {"__name__": "__main__"})
finally:
    _sys.stdout = _prev
_buf.getvalue()
`);

    // output is the full JSONL output — parse and forward each rep/summary line
    for (const raw of output.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "rep" || msg.type === "summary") {
          self.postMessage(msg);
        }
      } catch { /* non-JSON lines ignored */ }
    }
    self.postMessage({ type: "done" });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message ?? String(err) });
  }
});
