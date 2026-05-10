// ui/shared/tokens.js — Design tokens and shared constants

export const C = {
  bg:      "#080c10",
  surface: "#0d1117",
  panel:   "#111820",
  border:  "#1e2d3d",
  accent:  "#06b6d4",
  text:    "#cdd9e5",
  muted:   "#5c7a99",
  green:   "#3fb950",
  amber:   "#f0883e",
  red:     "#f85149",
  purple:  "#8b5cf6",
  bEvent:  "#f59e0b",
  cEvent:  "#06b6d4",
  server:  "#a78bfa",
  phaseA:  "#8b5cf6",
  phaseB:  "#f59e0b",
  phaseC:  "#06b6d4",
  waiting: "#f0883e",
  serving: "#06b6d4",
  served:  "#3fb950",
  reneged: "#f85149",
  idle:    "#3fb950",
  busy:    "#f59e0b",
  label:   "#9ca3af",
  cardBg:  "#1a1a1a",
  logBg:   "#050505",
  danger:  "#ef4444",
  warmup:  "#78350f",
  errorBg:"#7f1d1d",
  error:   "#fca5a5",
  warnBg:  "#fde68a",
  kpiArr:  "#38bdf8",
  kpiSvc:  "#10b981",
};

export const FONT = "'JetBrains Mono','Fira Code',monospace";

export const GOOGLE_FONT_URL =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap";

export const TOKEN_COLORS = ["#06b6d4", "#f59e0b", "#8b5cf6", "#3fb950", "#f87171", "#a78bfa", "#34d399", "#fbbf24"];

// Utility: title-case a string
export const toTitleCase = s =>
  (s || '').trim().replace(/\b\w/g, c => c.toUpperCase());

// Normalise entity type name: trim + title-case
export const normTypeName = s =>
  toTitleCase((s || '').replace(/\s+/g, " "));

