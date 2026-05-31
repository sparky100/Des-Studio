// ui/shared/tokens.js — Design tokens and shared constants

export const C = {
  bg:      "#080c10",
  surface: "#0d1117",
  panel:   "#111820",
  border:  "#1e2d3d",
  accent:  "#06b6d4",
  text:    "#cdd9e5",
  muted:   "#7a98bb",
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
  overlay:      "rgba(0,0,0,0.67)",
  surfaceHover: "#ffffff0a",
  chartGrid:    "rgba(255,255,255,0.06)",
  pink:         "#f472b6",
};

export const FONT = "'JetBrains Mono','Fira Code',monospace";

export const GOOGLE_FONT_URL =
  "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap";

export const TOKEN_COLORS = ["#06b6d4", "#f59e0b", "#8b5cf6", "#3fb950", "#f87171", "#a78bfa", "#34d399", "#fbbf24"];

// Spacing scale (px)
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

// Border-radius scale: sm=inputs/chips, md=cards/buttons/panels, lg=modals/overlays
export const RADIUS = { sm: 4, md: 6, lg: 10 };

// Box shadows
export const SHADOW = {
  panel:   "-8px 0 32px rgba(0,0,0,0.6)",
  overlay: "0 8px 32px rgba(0,0,0,0.5)",
  card:    "0 2px 8px rgba(0,0,0,0.4)",
};

// Z-index stack
export const Z = { dropdown: 100, tooltip: 150, overlay: 180, modal: 200 };

// Transition timings
export const TRANS = { fast: "120ms ease", base: "200ms ease", slow: "300ms ease" };

// Typography scale (use as spread: style={{ ...TYPO.label }})
export const TYPO = {
  label:   { fontSize: 11, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" },
  body:    { fontSize: 12, fontWeight: 400, lineHeight: 1.5 },
  caption: { fontSize: 11, fontWeight: 400 },
  heading: { fontSize: 14, fontWeight: 700 },
  title:   { fontSize: 16, fontWeight: 700 },
};

// Alpha: append 2-digit hex opacity to a hex colour token
// alpha(C.amber, 0.1) → "#f0883e1a"
export const alpha = (hex, opacity) =>
  `${hex}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`;

// Linearly interpolate between two hex colours. t in [0,1].
export const lerpColor = (hexA, hexB, t) => {
  const parse = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = parse(hexA);
  const [r2,g2,b2] = parse(hexB);
  return `rgb(${Math.round(r1+t*(r2-r1))},${Math.round(g1+t*(g2-g1))},${Math.round(b1+t*(b2-b1))})`;
};

// Utility: title-case a string
export const toTitleCase = s =>
  (s || '').trim().replace(/\b\w/g, c => c.toUpperCase());


// Normalise entity type name: trim + title-case
export const normTypeName = s =>
  toTitleCase((s || '').replace(/\s+/g, " "));

