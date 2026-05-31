// ui/shared/ThemeContext.jsx — Theme provider, palettes, and useTheme hook
import { createContext, useContext, useEffect, useState } from "react";
import { FONT } from "./tokens.js";

export const PALETTES = {
  dark: {
    bg:           "#080c10",
    surface:      "#0d1117",
    panel:        "#111820",
    border:       "#1e2d3d",
    accent:       "#06b6d4",
    text:         "#cdd9e5",
    muted:        "#7a98bb",
    green:        "#3fb950",
    amber:        "#f0883e",
    red:          "#f85149",
    purple:       "#8b5cf6",
    bEvent:       "#f59e0b",
    cEvent:       "#06b6d4",
    server:       "#a78bfa",
    phaseA:       "#8b5cf6",
    phaseB:       "#f59e0b",
    phaseC:       "#06b6d4",
    waiting:      "#f0883e",
    serving:      "#06b6d4",
    served:       "#3fb950",
    reneged:      "#f85149",
    idle:         "#3fb950",
    busy:         "#f59e0b",
    label:        "#9ca3af",
    cardBg:       "#1a1a1a",
    logBg:        "#050505",
    danger:       "#ef4444",
    warmup:       "#78350f",
    errorBg:      "#7f1d1d",
    error:        "#fca5a5",
    warnBg:       "#fde68a",
    kpiArr:       "#38bdf8",
    kpiSvc:       "#10b981",
    overlay:      "rgba(0,0,0,0.67)",
    surfaceHover: "#ffffff0a",
    chartGrid:    "rgba(255,255,255,0.06)",
    pink:         "#f472b6",
  },

  light: {
    bg:           "#f0f4f8",
    surface:      "#ffffff",
    panel:        "#e8edf2",
    border:       "#c5d0dc",
    accent:       "#0891b2",
    text:         "#0f1923",
    muted:        "#4a6280",
    green:        "#16a34a",
    amber:        "#d97706",
    red:          "#dc2626",
    purple:       "#7c3aed",
    bEvent:       "#b45309",
    cEvent:       "#0891b2",
    server:       "#6d28d9",
    phaseA:       "#7c3aed",
    phaseB:       "#b45309",
    phaseC:       "#0891b2",
    waiting:      "#d97706",
    serving:      "#0891b2",
    served:       "#16a34a",
    reneged:      "#dc2626",
    idle:         "#16a34a",
    busy:         "#d97706",
    label:        "#6b7280",
    cardBg:       "#f8fafc",
    logBg:        "#f1f5f9",
    danger:       "#dc2626",
    warmup:       "#92400e",
    errorBg:      "#fee2e2",
    error:        "#991b1b",
    warnBg:       "#fef3c7",
    kpiArr:       "#0284c7",
    kpiSvc:       "#059669",
    overlay:      "rgba(0,0,0,0.5)",
    surfaceHover: "#0000000a",
    chartGrid:    "rgba(0,0,0,0.08)",
    pink:         "#db2777",
  },

  highContrastDark: {
    bg:           "#000000",
    surface:      "#0a0a0a",
    panel:        "#111111",
    border:       "#3a5a7a",
    accent:       "#00d4f5",
    text:         "#f0f6fc",
    muted:        "#a8c0d8",
    green:        "#56d364",
    amber:        "#f0a050",
    red:          "#ff6b6b",
    purple:       "#a78bfa",
    bEvent:       "#fbbf24",
    cEvent:       "#00d4f5",
    server:       "#c4b5fd",
    phaseA:       "#a78bfa",
    phaseB:       "#fbbf24",
    phaseC:       "#00d4f5",
    waiting:      "#f0a050",
    serving:      "#00d4f5",
    served:       "#56d364",
    reneged:      "#ff6b6b",
    idle:         "#56d364",
    busy:         "#fbbf24",
    label:        "#b0bec5",
    cardBg:       "#0f0f0f",
    logBg:        "#000000",
    danger:       "#ff4444",
    warmup:       "#92350a",
    errorBg:      "#8f1d1d",
    error:        "#ffb3b3",
    warnBg:       "#fde68a",
    kpiArr:       "#38bdf8",
    kpiSvc:       "#34d399",
    overlay:      "rgba(0,0,0,0.75)",
    surfaceHover: "#ffffff14",
    chartGrid:    "rgba(255,255,255,0.10)",
    pink:         "#f9a8d4",
  },
};

export const THEME_OPTIONS = [
  { id: "system",              label: "System default" },
  { id: "dark",                label: "Dark" },
  { id: "light",               label: "Light" },
  { id: "high-contrast-dark",  label: "High Contrast Dark" },
];

function resolveThemeId(themeId) {
  if (themeId !== "system") return themeId;
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function paletteForId(resolvedId) {
  if (resolvedId === "light") return PALETTES.light;
  if (resolvedId === "high-contrast-dark") return PALETTES.highContrastDark;
  return PALETTES.dark;
}

const ThemeContext = createContext({
  C:        PALETTES.dark,
  FONT,
  themeId:  "dark",
  setTheme: () => {},
});

export function ThemeProvider({ themeId, onThemeChange, children }) {
  const [resolvedId, setResolvedId] = useState(() => resolveThemeId(themeId));

  // Re-resolve whenever themeId prop changes
  useEffect(() => {
    const rid = resolveThemeId(themeId);
    setResolvedId(rid);
  }, [themeId]);

  // Listen for OS preference changes when in "system" mode
  useEffect(() => {
    if (themeId !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setResolvedId(e.matches ? "dark" : "light");
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [themeId]);

  // Sync body background and localStorage whenever resolved palette changes
  useEffect(() => {
    const C = paletteForId(resolvedId);
    document.body.style.background = C.bg;
    try { localStorage.setItem("des.themeId", themeId); } catch (_) {}
  }, [resolvedId, themeId]);

  const value = {
    C:        paletteForId(resolvedId),
    FONT,
    themeId,
    setTheme: onThemeChange,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  // Safe fallback — components rendered outside a provider (e.g. unit tests) get dark palette
  if (!ctx) return { C: PALETTES.dark, FONT, themeId: "dark", setTheme: () => {} };
  return ctx;
}
