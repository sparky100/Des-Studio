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

    let lineBuf = "";
    pyodide.setStdout({
      batched(text) {
        lineBuf += text;
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop();
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "rep" || msg.type === "summary") {
              self.postMessage(msg);
            }
          } catch {
            // non-JSON lines ignored in json mode
          }
        }
      },
    });

    pyodide.setStderr({ batched(text) { console.warn("[SimPy]", text); } });

    // Switch script to json output mode
    const jsonScript = data.script.replace('RUN_MODE       = "text"', 'RUN_MODE       = "json"');
    await pyodide.runPythonAsync(jsonScript);
    self.postMessage({ type: "done" });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
});
