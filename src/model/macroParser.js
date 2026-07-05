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

export function macroCalls(effect) {
  const text = effectText(effect);
  return [...text.matchAll(/\b([A-Z_]+)\s*\(([^)]*)\)/gi)].map(match => ({
    macro: match[1].trim().toUpperCase(),
    args: match[2].split(",").map(arg => arg.trim()).filter(Boolean),
  }));
}

// Extracts the target queue name from a bare `RELEASE(Server, Queue)` /
// `RELEASE_COSEIZED([Type1, Type2, ...], Queue)` effect — the "implicit" single
// destination a completion B-event routes to before it gains a routing/
// probabilisticRouting array. RELEASE_COSEIZED's bracketed type list contains
// commas, so a naive split breaks it apart — handled here the same way
// visual-designer/graph.js's edge derivation already does. Returns null when no
// RELEASE-style call with a queue argument is present (e.g. DELAY completions,
// or effects that already route via `routing`/`probabilisticRouting`).
export function extractReleaseTarget(effect) {
  const effects = Array.isArray(effect) ? effect : [effect];
  for (const eff of effects) {
    const text = typeof eff === "string" ? eff : effectText(eff);
    const coseized = text.match(/RELEASE_COSEIZED\s*\(\s*\[[^\]]+\]\s*,\s*([^,)]+)\)/i);
    if (coseized) return coseized[1].trim();
    const release = text.match(/RELEASE\s*\(\s*[^,)]+\s*,\s*([^,)]+)\)/i);
    if (release) return release[1].trim();
  }
  return null;
}

// Strips the trailing queue argument out of a `RELEASE(...)`/`RELEASE_COSEIZED(...)`
// effect once its destination is superseded by a routing/probabilisticRouting array —
// mirrors BEventEditor's `setRoutingMode` cleanup exactly so both editors produce the
// same stripped effect string instead of drifting apart.
export function stripReleaseTarget(effect) {
  const stripOne = (eff) => (typeof eff === "string"
    ? eff
        .replace(/^(RELEASE\s*\([^,)]+),\s*[^)]+\)/i, "$1)")
        .replace(/^(RELEASE_COSEIZED\(\s*\[[^\]]+\]\s*),\s*[^)]+\)/i, "$1)")
    : eff);
  return Array.isArray(effect) ? effect.map(stripOne) : stripOne(effect);
}
