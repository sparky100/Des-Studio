// ui/visual-designer/NodeEvidenceSection.jsx — the "Evidence" block in the Draw
// inspector. It shows how much of the selected node's element (and its
// parameters) is backed, and which records back it. Editing happens in the
// Evidence tab under Design.

import { useMemo } from "react";
import {
  backingStatus, buildBackableUnits, backingTargetLabel, recordDisplayName,
} from "../../engine/backing-links.js";
import { useTheme } from "../shared/ThemeContext.jsx";

const STATUS_LABEL = { evidenced: "Evidenced", assumed: "Assumption only", unbacked: "Unbacked" };

/**
 * The backing target a Draw node stands for, or null when it has none.
 * @param {Record<string, any>} model
 * @param {{ refId?: string }} node
 */
export function backingTargetForNode(model, node) {
  const refId = node?.refId?.startsWith("route-exit:") ? node.refId.slice("route-exit:".length) : node?.refId;
  if (!refId) return null;
  const hit = (list, targetType) => (list || []).some(item => String(item.id) === String(refId)) ? { targetType, targetId: String(refId) } : null;
  return hit(model.bEvents, "b_event")
    || hit(model.cEvents, "c_event")
    || hit(model.queues, "queue")
    || hit(model.containerTypes, "container_type")
    || null;
}

/**
 * @param {{ model: Record<string, any>, node: { refId?: string } }} props
 */
export function NodeEvidenceSection({ model, node }) {
  const { C, FONT } = useTheme();
  const target = useMemo(() => backingTargetForNode(model, node), [model, node]);
  if (!target) return null;

  const opts = { schedules: model.schedules || [] };
  const units = buildBackableUnits(model, opts);
  const links = model.backingLinks || [];
  const elementUnit = units.find(u => u.kind === "element" && u.targetType === target.targetType && String(u.targetId) === target.targetId);
  const params = units.filter(u => u.kind === "parameter" && u.targetType === target.targetType && String(u.targetId) === target.targetId);
  const backedParams = params.filter(p => backingStatus(links, p.targetType, p.targetId, p.targetPath) !== "unbacked").length;

  const attached = links.filter(l => l.targetType === target.targetType && String(l.targetId) === target.targetId);
  const recordFor = l => {
    const list = l.recordType === "evidence" ? model.evidence : model.assumptions;
    return (list || []).find(r => String(r.id) === String(l.recordId));
  };
  const names = [...new Set(attached.map(recordFor).filter(Boolean).map(recordDisplayName))];
  const status = elementUnit ? backingStatus(links, target.targetType, target.targetId) : "unbacked";

  const sectionLabel = {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: C.muted,
    textTransform: "uppercase", fontFamily: FONT,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
      <div style={sectionLabel}>Evidence</div>
      <div style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
        {STATUS_LABEL[status]} · {backingTargetLabel(target.targetType)}
        {params.length > 0 && ` · ${backedParams} of ${params.length} parameter${params.length === 1 ? "" : "s"} backed`}
      </div>
      {names.length > 0 ? (
        <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, lineHeight: 1.5 }}>
          {names.join(", ")}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>
          Nothing backs this yet. Attach evidence or an assumption in the Evidence tab under Design.
        </div>
      )}
    </div>
  );
}
