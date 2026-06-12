// ParamBrowserPanel — tree-structured parameter picker for experiment overrides
// Styled to match the B/C event editor visual language.

import { useState } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { Btn, SectionPanel } from "../shared/components.jsx";
import { alpha, SPACE, RADIUS, TYPO } from "../shared/tokens.js";

function ParamRow({ p, color, added, onSelect }) {
  const { C, FONT } = useTheme();
  const [hovered, setHovered] = useState(false);

  return (
    <button
      disabled={added}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !added && onSelect(p.path)}
      title={p.description}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: SPACE.sm, width: "100%", textAlign: "left",
        background: added ? "transparent" : hovered ? alpha(color, 0.08) : C.bg,
        border: `1px solid ${hovered && !added ? color : C.border}`,
        borderRadius: RADIUS.sm,
        padding: "5px 10px",
        cursor: added ? "default" : "pointer",
        opacity: added ? 0.4 : 1,
        fontFamily: FONT,
        transition: "border-color 0.1s, background 0.1s",
        outline: "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: added ? C.muted : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.label}
        </span>
        {p.subLabel && (
          <span style={{ fontSize: 10, color: C.muted }}>{p.subLabel}</span>
        )}
      </div>
      <span style={{
        fontSize: 10, color: C.muted, background: C.surface,
        borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {p.currentValue === Infinity ? "∞" : p.currentValue}
      </span>
    </button>
  );
}

/**
 * @param {Object} props
 * @param {Array}  props.params        — from enumerateSweepableParams(model)
 * @param {Set}    props.alreadyAdded  — paths already in overrides (greyed out)
 * @param {function(path: string)} props.onSelect — called when user picks a param
 * @param {function} props.onClose     — called when user dismisses the browser
 */
export function ParamBrowserPanel({ params, alreadyAdded = new Set(), onSelect, onClose }) {
  const { C, FONT } = useTheme();

  const servers   = params.filter(p => p.type === "entityTypeCount" || p.type === "shiftCapacity");
  const queues    = params.filter(p => p.type === "queueCapacity");
  const bEvents   = params.filter(p => p.type === "bEventDistParam" || p.type === "bEventPiecewisePeriodParam");
  const cEvents   = params.filter(p => p.type === "cEventDistParam" || p.type === "cEventPiecewisePeriodParam");
  const stateVars = params.filter(p => p.type === "stateVarInit");

  const noParams = params.length === 0;

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.md, padding: SPACE.md,
      display: "flex", flexDirection: "column", gap: SPACE.sm,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...TYPO.label, color: C.muted, fontFamily: FONT }}>Select parameter</span>
        <Btn small variant="ghost" onClick={onClose} ariaLabel="Close parameter browser">✕</Btn>
      </div>

      {noParams && (
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>No parameters available for this model.</span>
      )}

      {servers.length > 0 && (
        <SectionPanel label="Servers & Capacity" color={C.server} status={String(servers.length)} defaultOpen={true}>
          {servers.map(p => (
            <ParamRow key={p.path} p={p} color={C.server} added={alreadyAdded.has(p.path)} onSelect={onSelect} />
          ))}
        </SectionPanel>
      )}

      {queues.length > 0 && (
        <SectionPanel label="Queue Capacity" color={C.green} status={String(queues.length)} defaultOpen={servers.length === 0}>
          {queues.map(p => (
            <ParamRow key={p.path} p={p} color={C.green} added={alreadyAdded.has(p.path)} onSelect={onSelect} />
          ))}
        </SectionPanel>
      )}

      {bEvents.length > 0 && (
        <SectionPanel label="Arrival & Event Distributions" color={C.bEvent} status={String(bEvents.length)} defaultOpen={servers.length === 0 && queues.length === 0}>
          {bEvents.map(p => (
            <ParamRow key={p.path} p={p} color={C.bEvent} added={alreadyAdded.has(p.path)} onSelect={onSelect} />
          ))}
        </SectionPanel>
      )}

      {cEvents.length > 0 && (
        <SectionPanel label="Service Distributions" color={C.cEvent} status={String(cEvents.length)}>
          {cEvents.map(p => (
            <ParamRow key={p.path} p={p} color={C.cEvent} added={alreadyAdded.has(p.path)} onSelect={onSelect} />
          ))}
        </SectionPanel>
      )}

      {stateVars.length > 0 && (
        <SectionPanel label="State Variables" color={C.muted} status={String(stateVars.length)}>
          {stateVars.map(p => (
            <ParamRow key={p.path} p={p} color={C.muted} added={alreadyAdded.has(p.path)} onSelect={onSelect} />
          ))}
        </SectionPanel>
      )}
    </div>
  );
}
