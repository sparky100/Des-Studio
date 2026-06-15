import { useState } from "react";
import { Btn, CommitInput, SH, InfoBox, Empty } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const PRESET_COLORS = [
  "#4A90D9", "#27AE60", "#E74C3C", "#9B59B6",
  "#F39C12", "#1ABC9C", "#E67E22", "#3498DB",
];

function ColorSwatch({ color, selected, onClick }) {
  const { C } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      title={color}
      style={{
        width: 20, height: 20, borderRadius: "50%",
        background: color, border: `2px solid ${selected ? C.text : "transparent"}`,
        cursor: "pointer", flexShrink: 0, padding: 0,
        boxShadow: selected ? `0 0 0 1px ${C.bg}` : "none",
      }}
    />
  );
}

function MemberRow({ label, id, inSection, onToggleMember }) {
  const { C, FONT } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
      <input
        type="checkbox"
        id={`member-${id}`}
        checked={inSection}
        onChange={() => onToggleMember(id)}
        style={{ cursor: "pointer", flexShrink: 0 }}
      />
      <label htmlFor={`member-${id}`} style={{ flex: 1, fontSize: 11, color: C.text, fontFamily: FONT, cursor: "pointer" }}>
        {label}
      </label>
    </div>
  );
}

const SectionEditor = ({ sections = [], queues = [], entityTypes = [], bEvents = [], cEvents = [], onChange }) => {
  const { C, FONT } = useTheme();
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = (id) => setExpandedIds(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const add = () => {
    const id = "sec_" + Date.now();
    const usedColors = sections.map(s => s.color);
    const color = PRESET_COLORS.find(c => !usedColors.includes(c)) || PRESET_COLORS[sections.length % PRESET_COLORS.length];
    onChange([...sections, { id, name: "", color, memberIds: [] }]);
    setExpandedIds(prev => new Set([...prev, id]));
  };

  const upd = (i, patch) => {
    const n = [...sections]; n[i] = { ...n[i], ...patch }; onChange(n);
  };

  const rem = (i) => onChange(sections.filter((_, idx) => idx !== i));

  const toggleMember = (i, elemId) => {
    const s = sections[i];
    const inSection = s.memberIds.includes(elemId);
    const memberIds = inSection ? s.memberIds.filter(x => x !== elemId) : [...s.memberIds, elemId];
    upd(i, { memberIds });
  };

  const allElements = [
    ...queues.map(q => ({ id: q.id, label: q.name || q.id, kind: "queue" })),
    ...entityTypes.map(e => ({ id: e.id, label: e.name || e.id, kind: "entity" })),
    ...bEvents.map(e => ({ id: e.id, label: e.name || e.id, kind: "b-event" })),
    ...cEvents.map(e => ({ id: e.id, label: e.name || e.id, kind: "c-event" })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, fontFamily: SANS }}>Sections</div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, marginTop: 2 }}>
            {sections.length === 0 ? "No sections yet" : `${sections.length} section${sections.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        <Btn variant="primary" onClick={add}>+ Add Section</Btn>
      </div>
      <InfoBox color={C.accent}>
        Group related queues, events, and entity types into named sections. Sections appear as coloured swimlanes in the visual
        designer and as filter tabs in each editor.
      </InfoBox>
      {sections.length === 0 && (
        <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "40px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 32, lineHeight: 1 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: SANS }}>No sections yet</div>
          <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS, lineHeight: 1.6, maxWidth: 380 }}>
            Group queues, events, and entity types into named sections — they appear as swimlanes in the canvas and filter tabs in each editor.
          </div>
          <Btn variant="primary" onClick={add}>Add first section</Btn>
        </div>
      )}
      {sections.map((s, i) => {
        const isExpanded = expandedIds.has(s.id);
        const memberCount = s.memberIds.length;
        return (
          <div key={s.id} style={{
            background: C.bg, border: `1px solid ${s.color}44`,
            borderLeft: `3px solid ${s.color}`, borderRadius: 6, padding: 12,
            display: "flex", flexDirection: "column", gap: isExpanded ? 10 : 0,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => toggleExpand(s.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 3px", color: isExpanded ? s.color : C.muted, fontFamily: FONT, fontSize: 11, lineHeight: 1, flexShrink: 0 }}
              >{isExpanded ? "▾" : "▸"}</button>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <CommitInput
                value={s.name || ""}
                onCommit={v => { if (v !== (s.name || "")) upd(i, { name: v }); }}
                placeholder="Section name"
                style={{ flex: 1, minWidth: 120, background: "transparent", border: `1px solid ${s.color}55`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 12, padding: "5px 8px", outline: "none" }}
              />
              {!isExpanded && (
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, background: `${C.border}30`, borderRadius: 3, padding: "2px 6px" }}>
                  {memberCount} member{memberCount !== 1 ? "s" : ""}
                </span>
              )}
              <Btn small variant="danger" ariaLabel={`Remove section ${s.name || i + 1}`} onClick={() => rem(i)}>✕</Btn>
            </div>

            {isExpanded && <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>COLOUR</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PRESET_COLORS.map(c => (
                    <ColorSwatch key={c} color={c} selected={s.color === c} onClick={() => upd(i, { color: c })} />
                  ))}
                  <input
                    type="color"
                    value={s.color || "#4A90D9"}
                    onChange={e => upd(i, { color: e.target.value })}
                    title="Custom colour"
                    style={{ width: 20, height: 20, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: "none" }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, letterSpacing: 1.2, fontWeight: 700 }}>
                  MEMBERS — {memberCount} assigned
                </span>
                {allElements.length === 0 && (
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>No queues or entity types defined yet.</div>
                )}
                {["queue", "entity", "b-event", "c-event"].map(kind => {
                  const group = allElements.filter(e => e.kind === kind);
                  if (!group.length) return null;
                  const kindLabel = { queue: "Queues", entity: "Entity Types", "b-event": "B-Events", "c-event": "C-Events" }[kind];
                  return (
                    <div key={kind} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT, fontWeight: 700, letterSpacing: 1, marginBottom: 3 }}>
                        {kindLabel.toUpperCase()}
                      </div>
                      {group.map(elem => (
                        <MemberRow
                          key={elem.id}
                          id={elem.id}
                          label={elem.label}
                          inSection={s.memberIds.includes(elem.id)}
                          onToggleMember={(id) => toggleMember(i, id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </>}
          </div>
        );
      })}
    </div>
  );
};

export { SectionEditor };
