// ParamBrowserPanel — tree-structured parameter picker for experiment overrides and sweep studies
// Styled to match the B/C event editor visual language.

import { useState } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { Btn, SectionPanel } from "../shared/components.jsx";
import { alpha, SPACE, RADIUS, TYPO } from "../shared/tokens.js";

export function paramColor(type, C) {
  if (type === "entityTypeCount" || type === "shiftCapacity") return C.server;
  if (type === "queueCapacity") return C.green;
  if (type === "bEventDistParam" || type === "bEventPiecewisePeriodParam") return C.bEvent;
  if (type === "cEventDistParam" || type === "cEventPiecewisePeriodParam") return C.cEvent;
  return C.muted;
}

function ParamRow({ p, color, added, selected, onSelect }) {
  const { C, FONT } = useTheme();
  const [hovered, setHovered] = useState(false);

  const isActive = selected || (hovered && !added);

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
        background: added ? "transparent" : isActive ? alpha(color, 0.1) : C.bg,
        border: `1px solid ${isActive ? color : C.border}`,
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
        <span style={{ fontSize: 11, color: added ? C.muted : selected ? color : C.text, fontWeight: selected ? 700 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {selected && "✓ "}{p.label}
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
 * @param {Object}   props
 * @param {Array}    props.params        — from enumerateSweepableParams(model)
 * @param {Set}      [props.alreadyAdded]  — paths already in overrides (greyed out); for multi-select mode
 * @param {string}   [props.selectedPath]  — currently selected path; for single-select mode
 * @param {boolean}  [props.singleSelect]  — if true, closes after selecting (for sweep parameter pickers)
 * @param {function(path: string)} props.onSelect
 * @param {function} props.onClose
 */
export function ParamBrowserPanel({ params, alreadyAdded = new Set(), selectedPath = null, singleSelect = false, onSelect, onClose }) {
  const { C, FONT } = useTheme();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? params.filter(p =>
        p.label.toLowerCase().includes(q) ||
        (p.subLabel && p.subLabel.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      )
    : null; // null = show sections

  function handleSelect(path) {
    onSelect(path);
    if (singleSelect) onClose();
  }

  const servers   = params.filter(p => p.type === "entityTypeCount" || p.type === "shiftCapacity");
  const cEvents   = params.filter(p => p.type === "cEventDistParam" || p.type === "cEventPiecewisePeriodParam");
  const bEvents   = params.filter(p => p.type === "bEventDistParam" || p.type === "bEventPiecewisePeriodParam");
  const stateVars = params.filter(p => p.type === "stateVarInit");
  const queues    = params.filter(p => p.type === "queueCapacity");

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.md, padding: SPACE.md,
      display: "flex", flexDirection: "column", gap: SPACE.sm,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ ...TYPO.label, color: C.muted, fontFamily: FONT }}>{singleSelect ? "Choose parameter" : "Select parameter"}</span>
        <Btn small variant="ghost" onClick={onClose} ariaLabel="Close parameter browser">✕</Btn>
      </div>

      {/* Search input */}
      {params.length > 0 && (
        <input
          autoFocus
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter parameters…"
          style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: RADIUS.sm,
            color: C.text, fontFamily: FONT, fontSize: 11,
            padding: "5px 8px", outline: "none", width: "100%",
          }}
        />
      )}

      {params.length === 0 && (
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>No parameters available for this model.</span>
      )}

      {/* Filtered flat list */}
      {filtered !== null && (
        filtered.length === 0
          ? <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>No parameters match "{query}".</span>
          : filtered.map(p => (
              <ParamRow
                key={p.path} p={p} color={paramColor(p.type, C)}
                added={alreadyAdded.has(p.path)}
                selected={p.path === selectedPath}
                onSelect={handleSelect}
              />
            ))
      )}

      {/* Grouped sections (shown when search is empty) */}
      {filtered === null && (
        <>
          {servers.length > 0 && (
            <SectionPanel label="Servers & Capacity" color={C.server} status={String(servers.length)} defaultOpen={true}>
              {servers.map(p => (
                <ParamRow key={p.path} p={p} color={C.server} added={alreadyAdded.has(p.path)} selected={p.path === selectedPath} onSelect={handleSelect} />
              ))}
            </SectionPanel>
          )}
          {cEvents.length > 0 && (
            <SectionPanel label="Service Distributions" color={C.cEvent} status={String(cEvents.length)}>
              {cEvents.map(p => (
                <ParamRow key={p.path} p={p} color={C.cEvent} added={alreadyAdded.has(p.path)} selected={p.path === selectedPath} onSelect={handleSelect} />
              ))}
            </SectionPanel>
          )}
          {bEvents.length > 0 && (
            <SectionPanel label="Arrival Distributions" color={C.bEvent} status={String(bEvents.length)} defaultOpen={servers.length === 0 && cEvents.length === 0}>
              {bEvents.map(p => (
                <ParamRow key={p.path} p={p} color={C.bEvent} added={alreadyAdded.has(p.path)} selected={p.path === selectedPath} onSelect={handleSelect} />
              ))}
            </SectionPanel>
          )}
          {stateVars.length > 0 && (
            <SectionPanel label="State Variables" color={C.muted} status={String(stateVars.length)}>
              {stateVars.map(p => (
                <ParamRow key={p.path} p={p} color={C.muted} added={alreadyAdded.has(p.path)} selected={p.path === selectedPath} onSelect={handleSelect} />
              ))}
            </SectionPanel>
          )}
          {queues.length > 0 && (
            <SectionPanel label="Queue Capacity" color={C.green} status={String(queues.length)}>
              {queues.map(p => (
                <ParamRow key={p.path} p={p} color={C.green} added={alreadyAdded.has(p.path)} selected={p.path === selectedPath} onSelect={handleSelect} />
              ))}
            </SectionPanel>
          )}
        </>
      )}
    </div>
  );
}
