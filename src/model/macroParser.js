// model/macroParser.js — shared parsing helpers for B-Event/C-Event `effect` macro calls.
// Extracted from visual-designer/graph.js so other features (e.g. the
// plain-language completion summary) can reuse the same parsing logic.

export function clean(value = "") {
  return String(value || "").trim();
}

export function effectText(effect) {
  if (Array.isArray(effect)) return effect.map(effectText).filter(Boolean).join(";");
  if (effect && typeof effect === "object") {
    if (typeof effect.effect === "string") return effect.effect;
    const macro = clean(effect.macro || effect.type || effect.name).toUpperCase();
    if (!macro) return "";
    const args = Array.isArray(effect.args)
      ? effect.args
      : [
          effect.entityType || effect.customerType || effect.queue || effect.resourceType || effect.serverType,
          effect.serverType || effect.resourceType,
        ].filter(Boolean);
    return `${macro}(${args.join(", ")})`;
  }
  return clean(effect);
}

// Splits an argument list at top-level commas only — commas inside a
// RELEASE_COSEIZED-style bracketed list ("[Nurse, Doctor]") stay together.
function splitTopLevelArgs(raw) {
  const args = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "[") { depth++; current += ch; }
    else if (ch === "]") { depth = Math.max(0, depth - 1); current += ch; }
    else if (ch === "," && depth === 0) { args.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args.filter(Boolean);
}

// Tokenises every macro call in an effect string with its exact source span,
// bracket-aware, so callers can rewrite one call in place without touching
// its siblings.
function tokenizeCalls(text) {
  const calls = [];
  const opener = /\b([A-Z_]+)\s*\(/gi;
  let match;
  while ((match = opener.exec(text))) {
    const argsStart = match.index + match[0].length;
    let depth = 0;
    let i = argsStart;
    for (; i < text.length; i++) {
      const ch = text[i];
      if (ch === "[") depth++;
      else if (ch === "]") depth = Math.max(0, depth - 1);
      else if (ch === ")" && depth === 0) break;
    }
    if (i >= text.length) break; // unbalanced call — stop rather than guess
    calls.push({
      macro: match[1].trim().toUpperCase(),
      args: splitTopLevelArgs(text.slice(argsStart, i)),
      start: match.index,
      end: i + 1,
      raw: text.slice(match.index, i + 1),
    });
    opener.lastIndex = i + 1;
  }
  return calls;
}

export function macroCalls(effect) {
  return tokenizeCalls(effectText(effect)).map(({ macro, args }) => ({ macro, args }));
}

// Replaces the first call of `macroName` in an effect, leaving every sibling
// macro untouched and preserving the effect's array-vs-string shape (Forms
// editors store arrays; canvas-written effects are strings — both are live).
// `rewriteFn({macro, args, raw})` returns the replacement call text.
// Returns { effect, replaced }.
export function replaceMacroCall(effect, macroName, rewriteFn) {
  const target = clean(macroName).toUpperCase();
  const replaceInText = (text) => {
    for (const call of tokenizeCalls(text)) {
      if (call.macro === target) {
        return { text: text.slice(0, call.start) + rewriteFn(call) + text.slice(call.end), replaced: true };
      }
    }
    return { text, replaced: false };
  };
  if (Array.isArray(effect)) {
    let replaced = false;
    const next = effect.map(entry => {
      if (replaced || typeof entry !== "string") return entry;
      const result = replaceInText(entry);
      replaced = result.replaced;
      return result.text;
    });
    return { effect: next, replaced };
  }
  const result = replaceInText(typeof effect === "string" ? effect : effectText(effect));
  return { effect: result.text, replaced: result.replaced };
}

// Extracts the target queue name from a bare `RELEASE(Server, Queue)` /
// `RELEASE_COSEIZED([Type1, Type2, ...], Queue)` effect — the "implicit" single
// destination a completion B-event routes to before it gains a routing/
// probabilisticRouting array. Returns null when no RELEASE-style call with a
// queue argument is present (e.g. DELAY completions, or effects that already
// route via `routing`/`probabilisticRouting`).
export function extractReleaseTarget(effect) {
  const effects = Array.isArray(effect) ? effect : [effect];
  for (const eff of effects) {
    const text = typeof eff === "string" ? eff : effectText(eff);
    for (const call of tokenizeCalls(text)) {
      if ((call.macro === "RELEASE" || call.macro === "RELEASE_COSEIZED") && call.args.length >= 2) {
        return call.args[1];
      }
    }
  }
  return null;
}

// Strips the trailing queue argument out of a `RELEASE(...)`/`RELEASE_COSEIZED(...)`
// effect once its destination is superseded by a routing/probabilisticRouting array —
// mirrors BEventEditor's `setRoutingMode` cleanup exactly so both editors produce the
// same stripped effect string instead of drifting apart. Works on the call wherever
// it sits in the effect, not just when it's the first macro.
export function stripReleaseTarget(effect) {
  const stripOne = (eff) => {
    if (typeof eff !== "string") return eff;
    let out = eff;
    for (const macro of ["RELEASE_COSEIZED", "RELEASE"]) {
      const result = replaceMacroCall(out, macro, call =>
        call.args.length >= 2 ? `${macro}(${call.args[0]})` : call.raw
      );
      if (result.replaced) { out = result.effect; break; }
    }
    return out;
  };
  return Array.isArray(effect) ? effect.map(stripOne) : stripOne(effect);
}

// The inverse of stripReleaseTarget: sets (or replaces) the queue argument on
// the effect's RELEASE/RELEASE_COSEIZED call, preserving siblings and shape.
// No-ops when the effect has no RELEASE-style call or no queue name is given.
export function withReleaseTarget(effect, queueName) {
  const target = clean(queueName);
  if (!target) return effect;
  for (const macro of ["RELEASE_COSEIZED", "RELEASE"]) {
    const result = replaceMacroCall(effect, macro, call =>
      call.args.length >= 1 ? `${macro}(${call.args[0]}, ${target})` : call.raw
    );
    if (result.replaced) return result.effect;
  }
  return effect;
}

// Classifies a C-Event effect for the Visual Designer: the canvas can safely
// rewrite a plain single-server ASSIGN or a DELAY, and must hand anything else
// (COSEIZE, skill/container-gated ASSIGN, BATCH, MATCH, multi-macro effects…)
// to the C-Events editor. Single source of truth — the canvas ops and the node
// inspector previously used divergent regexes for this.
export function classifyActivityEffect(effect) {
  const calls = macroCalls(effect);
  if (calls.length === 0) return { kind: "empty", call: null };
  if (calls.length === 1) {
    const call = calls[0];
    if (call.macro === "ASSIGN" && call.args.length === 2) return { kind: "assign", call };
    if (call.macro === "DELAY" && call.args.length >= 1 && call.args.length <= 2) return { kind: "delay", call };
  }
  return { kind: "advanced", call: calls[0] };
}
