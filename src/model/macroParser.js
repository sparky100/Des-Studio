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
