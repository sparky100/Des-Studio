import { useState, useCallback, useRef, useMemo } from "react";
import { useTheme } from "../shared/ThemeContext.jsx";
import { Btn, InfoBox } from "../shared/components.jsx";
import { parseHHMM, periodLabel as patternPeriodLabel } from "../../engine/schedule-pattern.js";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const CELL_H = 22;
const CELL_W = 44;

function hoursToPeriods(selectedHours, capacity) {
  // selectedHours: Map<dayOfWeek, Set<hour>>
  // Convert to periods by grouping consecutive hours per day
  const periods = [];
  for (const [dayStr, hours] of selectedHours) {
    const dayOfWeek = Number(dayStr);
    const sorted = [...hours].sort((a, b) => a - b);
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      const h = sorted[i];
      if (i < sorted.length && h === prev + 1) {
        prev = h;
      } else {
        periods.push({
          dayOfWeek,
          start: `${String(start).padStart(2, "0")}:00`,
          end: `${String(prev + 1).padStart(2, "0")}:00`,
          capacity,
        });
        if (i < sorted.length) { start = h; prev = h; }
      }
    }
  }
  return periods;
}

function buildGridLookup(periods) {
  // Returns Map<dayOfWeek, Map<hour, capacity>>
  const grid = new Map();
  for (const p of periods || []) {
    if (!grid.has(p.dayOfWeek)) grid.set(p.dayOfWeek, new Map());
    const startH = parseInt(p.start, 10);
    const endH = parseInt(p.end, 10);
    for (let h = startH; h < endH; h++) {
      grid.get(p.dayOfWeek).set(h, p.capacity);
    }
  }
  return grid;
}

const WeeklyPatternEditor = ({ pattern, onChange, epoch, disabled }) => {
  const { C, FONT } = useTheme();
  const [defaultCap, setDefaultCap] = useState(pattern?.defaultCapacity ?? 0);

  const periods = pattern?.periods || [];
  const exceptions = pattern?.exceptions || [];

  // Selection state
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState(() => new Map()); // Map<dayOfWeek, Set<hour>>
  const [capacityVal, setCapacityVal] = useState(3);
  const dragRef = useRef({ startDay: null, startHour: null });

  const grid = useMemo(() => buildGridLookup(periods), [periods]);

  const cellCap = useCallback((dayIdx, hour) => {
    return grid.get(dayIdx + 1)?.get(hour) ?? null;
  }, [grid]);

  const selHas = useCallback((dayIdx, hour) => {
    const s = selection.get(dayIdx + 1);
    return s?.has(hour) ?? false;
  }, [selection]);

  const onCellMouseDown = useCallback((dayIdx, hour) => {
    setSelecting(true);
    dragRef.current = { startDay: dayIdx, startHour: hour };
    const day = dayIdx + 1;
    setSelection(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(day) || []);
      if (set.has(hour)) set.delete(hour); else set.add(hour);
      if (set.size) next.set(day, set); else next.delete(day);
      return next;
    });
  }, []);

  const onCellMouseEnter = useCallback((dayIdx, hour) => {
    if (!selecting) return;
    const day = dayIdx + 1;
    setSelection(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(day) || []);
      set.add(hour);
      next.set(day, set);
      return next;
    });
  }, [selecting]);

  const onMouseUp = useCallback(() => {
    setSelecting(false);
  }, []);

  const applySelection = useCallback(() => {
    if (selection.size === 0) return;
    const newPeriods = hoursToPeriods(selection, capacityVal);
    // Merge with existing periods (remove duplicates for same hour ranges, then add new)
    const merged = mergePeriods([...periods, ...newPeriods]);
    onChange?.({ ...pattern, type: "weekly", defaultCapacity: defaultCap, periods: merged, exceptions });
    setSelection(new Map());
  }, [selection, capacityVal, periods, pattern, onChange, defaultCap, exceptions]);

  const clearSelection = useCallback(() => {
    setSelection(new Map());
  }, []);

  const clearAllPeriods = useCallback(() => {
    onChange?.({ ...pattern, type: "weekly", defaultCapacity: defaultCap, periods: [], exceptions });
  }, [pattern, onChange, defaultCap, exceptions]);

  const invertSelection = useCallback(() => {
    const next = new Map();
    for (let d = 0; d < 7; d++) {
      const day = d + 1;
      const hours = new Set();
      for (let h = 0; h < 24; h++) {
        if (!selHas(d, h)) hours.add(h);
      }
      if (hours.size) next.set(day, hours);
    }
    setSelection(next);
  }, [selHas]);

  const addException = useCallback(() => {
    const exc = { date: "", label: "", periods: [{ start: "09:00", end: "17:00", capacity: 0 }] };
    onChange?.({ ...pattern, type: "weekly", defaultCapacity: defaultCap, periods, exceptions: [...exceptions, exc] });
  }, [pattern, onChange, defaultCap, periods, exceptions]);

  const updException = useCallback((idx, patch) => {
    const next = exceptions.map((e, i) => i === idx ? { ...e, ...patch } : e);
    onChange?.({ ...pattern, type: "weekly", defaultCapacity: defaultCap, periods, exceptions: next });
  }, [exceptions, pattern, onChange, defaultCap, periods]);

  const remException = useCallback((idx) => {
    onChange?.({ ...pattern, type: "weekly", defaultCapacity: defaultCap, periods, exceptions: exceptions.filter((_, i) => i !== idx) });
  }, [exceptions, pattern, onChange, defaultCap, periods]);

  const selCount = [...selection.values()].reduce((sum, s) => sum + s.size, 0);

  const previewEvents = useMemo(() => {
    if (!pattern?.periods?.length || !epoch) return null;
    try {
      const { expandWeeklyPatternToEvents } = require("../../engine/schedule-pattern.js");
      const result = expandWeeklyPatternToEvents(pattern, epoch, 7 * 24 * 60, "minutes");
      return result;
    } catch { return null; }
  }, [pattern, epoch]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Default off-shift capacity:</span>
        <input type="number" min="0" step="1" value={defaultCap}
          onChange={e => { const v = parseInt(e.target.value, 10) || 0; setDefaultCap(v); onChange?.({ ...pattern, type: "weekly", defaultCapacity: v, periods, exceptions }); }}
          style={{ width: 60, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 11, padding: "3px 6px", outline: "none" }} />
      </div>
      <div style={{ overflowX: "auto" }} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
        <table style={{ borderCollapse: "collapse", fontFamily: FONT, fontSize: 10, userSelect: "none" }}>
          <thead>
            <tr>
              <th style={{ width: 28, padding: "2px 4px", color: C.muted, fontWeight: 400, textAlign: "right" }}></th>
              {DAYS.map((d, di) => (
                <th key={d} style={{ width: CELL_W, padding: "2px 0", color: C.text, fontWeight: 600, textAlign: "center", fontSize: 10 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOURS.map(hour => (
              <tr key={hour}>
                <td style={{ padding: "2px 4px", color: C.muted, textAlign: "right", fontSize: 9 }}>{String(hour).padStart(2, "0")}</td>
                {DAYS.map((_, di) => {
                  const cap = cellCap(di, hour);
                  const isSelected = selHas(di, hour);
                  const bg = isSelected
                    ? `${C.server}${Math.min(255, 80 + capacityVal * 20).toString(16).padStart(2, "0")}`
                    : cap != null
                      ? `${C.green}${Math.min(255, 60 + cap * 25).toString(16).padStart(2, "0")}`
                      : `${C.border}22`;
                  const borderColor = isSelected ? C.server : cap != null ? C.green : C.border;
                  return (
                    <td key={di}
                      onMouseDown={() => onCellMouseDown(di, hour)}
                      onMouseEnter={() => onCellMouseEnter(di, hour)}
                      style={{
                        width: CELL_W, height: CELL_H, background: bg,
                        border: `1px solid ${borderColor}44`, cursor: "pointer",
                        textAlign: "center", fontSize: 8, color: isSelected ? C.text : cap != null ? C.text : C.muted,
                        transition: "background 0.1s",
                      }}>
                      {cap != null ? cap : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
          {selCount > 0 ? `${selCount} cell${selCount !== 1 ? "s" : ""} selected` : "Click-drag cells to select"}
        </span>
        {selCount > 0 && <>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>Capacity:</span>
          <input type="number" min="0" max="99" step="1" value={capacityVal}
            onChange={e => setCapacityVal(parseInt(e.target.value, 10) || 0)}
            style={{ width: 50, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.server, fontFamily: FONT, fontSize: 11, padding: "3px 6px", outline: "none" }} />
          <Btn small variant="primary" onClick={applySelection}>Apply</Btn>
          <Btn small variant="ghost" onClick={clearSelection}>Clear selection</Btn>
        </>}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <Btn small variant="ghost" onClick={clearAllPeriods}>Clear All</Btn>
        <Btn small variant="ghost" onClick={invertSelection}>Invert Selection</Btn>
      </div>
      {exceptions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT, fontWeight: 600 }}>Date Exceptions</span>
          {exceptions.map((exc, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input type="date" value={exc.date || ""} onChange={e => updException(idx, { date: e.target.value })}
                style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: FONT, fontSize: 10, padding: "2px 6px", outline: "none" }} />
              <input value={exc.label || ""} onChange={e => updException(idx, { label: e.target.value })} placeholder="Label"
                style={{ width: 120, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontFamily: FONT, fontSize: 10, padding: "2px 6px", outline: "none" }} />
              <input type="number" min="0" value={exc.periods?.[0]?.capacity ?? 0} onChange={e => { const p = [...(exc.periods || [])]; p[0] = { ...p[0], capacity: parseInt(e.target.value, 10) || 0 }; updException(idx, { periods: p }); }}
                style={{ width: 50, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, color: C.server, fontFamily: FONT, fontSize: 10, padding: "2px 6px", outline: "none" }} />
              <span style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>capacity</span>
              <Btn small variant="danger" onClick={() => remException(idx)}>✕</Btn>
            </div>
          ))}
        </div>
      )}
      <Btn small variant="ghost" onClick={addException}>+ Add Exception Date</Btn>
      {previewEvents && (
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: 8 }}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: FONT, marginBottom: 4 }}>Preview: first 7 days</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 120, overflowY: "auto" }}>
            {previewEvents.events.slice(0, 20).map((ev, i) => (
              <div key={i} style={{ fontSize: 9, color: C.text, fontFamily: FONT }}>
                t={Math.round(ev.time)} → capacity {ev.capacity}
              </div>
            ))}
            {previewEvents.events.length > 20 && (
              <div style={{ fontSize: 9, color: C.muted, fontFamily: FONT }}>... and {previewEvents.events.length - 20} more</div>
            )}
          </div>
        </div>
      )}
      <InfoBox color={C.server}>
        Define your weekly capacity pattern. Selected cells become shift periods. <strong>Requires a Real-world start date (Epoch)</strong> in experiment settings to align days of the week.
      </InfoBox>
    </div>
  );
};

function mergePeriods(periods) {
  // Merge overlapping periods on the same day with the same capacity
  const byDay = {};
  for (const p of periods) {
    if (!byDay[p.dayOfWeek]) byDay[p.dayOfWeek] = [];
    byDay[p.dayOfWeek].push(p);
  }
  const result = [];
  for (const [dayStr, ps] of Object.entries(byDay)) {
    const day = Number(dayStr);
    // Sort by start time
    ps.sort((a, b) => parseHHMM(a.start) - parseHHMM(b.start));
    // Merge consecutive with same capacity
    const merged = [];
    for (const p of ps) {
      const last = merged[merged.length - 1];
      const pStart = parseHHMM(p.start);
      const pEnd = parseHHMM(p.end);
      if (last) {
        const lStart = parseHHMM(last.start);
        const lEnd = parseHHMM(last.end);
        if (pStart <= lEnd && last.capacity === p.capacity) {
          last.end = lEnd >= pEnd ? last.end : p.end;
          continue;
        }
      }
      merged.push({ dayOfWeek: day, start: p.start, end: p.end, capacity: p.capacity });
    }
    result.push(...merged);
  }
  return result;
}

export { WeeklyPatternEditor, mergePeriods };
