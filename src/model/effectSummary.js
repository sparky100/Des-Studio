// model/effectSummary.js — plain-language summary of what a B-Event's
// effect macros do, for display next to a C-Event's scheduled follow-on
// event. Never hides anything: macros it doesn't have a phrase for are
// listed verbatim as a fallback.

import { macroCalls } from "./macroParser.js";

function formatRouting(bEvent) {
  if (Array.isArray(bEvent.probabilisticRouting) && bEvent.probabilisticRouting.length) {
    return bEvent.probabilisticRouting
      .map(r => `${Math.round((r.probability ?? 0) * 100)}% → ${r.queueName || r.target || "?"}`)
      .join(", ");
  }
  if (Array.isArray(bEvent.routing) && bEvent.routing.length) {
    return bEvent.routing.map(r => r.queueName || r.target || r).filter(Boolean).join(", ");
  }
  if (bEvent.defaultQueueName) return bEvent.defaultQueueName;
  return null;
}

export function summarizeBEventEffect(bEvent) {
  if (!bEvent) return null;
  const calls = macroCalls(bEvent.effect);
  if (!calls.length) return "No effect configured";

  const release = calls.find(c => c.macro === "RELEASE");
  const completes = calls.some(c => c.macro === "COMPLETE");
  const reneges = calls.some(c => c.macro === "RENEGE");
  const others = calls.filter(c => !["RELEASE", "COMPLETE", "RENEGE"].includes(c.macro));

  const parts = [];
  if (release) {
    const resource = release.args[1] || release.args[0] || "resource";
    const routing = formatRouting(bEvent);
    parts.push(routing ? `Releases ${resource} · routes ${routing}` : `Releases ${resource}`);
  }
  if (completes) parts.push("Entity exits simulation");
  if (reneges) parts.push("Entity reneges");
  if (others.length) {
    const fallback = others.map(c => `${c.macro}(${c.args.join(", ")})`).join(", ");
    parts.push(parts.length ? `Also: ${fallback}` : fallback);
  }

  return parts.length ? parts.join(" · ") : "No effect configured";
}
