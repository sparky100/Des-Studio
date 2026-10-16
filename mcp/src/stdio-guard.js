// Imported first by server.js: stdout is the MCP channel, so anything else
// written there (a stray console.log in an imported module) would corrupt
// it. Route console output to stderr before anything else loads.
for (const k of ['log', 'info', 'debug']) console[k] = (...a) => console.error(...a);
