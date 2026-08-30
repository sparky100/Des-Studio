// model/balkRenegeFormat.js — presence checks + short human-readable
// summaries for a Queue's ADR-017 balking/reneging config.
//
// QueueEditor.jsx computes an equivalent presence check inline for its own
// collapsed-row summary; this module exists so the Draw canvas badge
// (graph.js) and the Inspector's "edit in Define" pointer
// (VisualNodeInspector.jsx) share one source of truth instead of drifting
// from each other or from QueueEditor's own logic.

import { conditionLabel } from "./conditionFormat.js";
import { formatDistributionLabel } from "./distributionFormat.js";

export function hasBalking(queue = {}) {
  const hasProb = queue.balkProbability != null && queue.balkProbability !== "" && !Number.isNaN(Number(queue.balkProbability));
  return hasProb || !!queue.balkCondition;
}

export function describeBalking(queue = {}) {
  if (queue.balkCondition) return `Balks when ${conditionLabel(queue.balkCondition)}`;
  const hasProb = queue.balkProbability != null && queue.balkProbability !== "" && !Number.isNaN(Number(queue.balkProbability));
  return hasProb ? `${Math.round(queue.balkProbability * 100)}% of arrivals balk` : null;
}

export function hasReneging(queue = {}) {
  return !!queue.renegeDist;
}

export function describeReneging(queue = {}) {
  if (!queue.renegeDist) return null;
  return formatDistributionLabel([{ dist: queue.renegeDist, distParams: queue.renegeDistParams }]);
}
