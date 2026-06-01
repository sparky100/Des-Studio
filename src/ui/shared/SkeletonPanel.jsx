// ui/shared/SkeletonPanel.jsx — animated placeholder for loading states
import { RADIUS } from "./tokens.js";
import { useTheme } from "./ThemeContext.jsx";

const STYLE_ID = "des-skeleton-pulse";

function ensurePulseKeyframes() {

  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes des-pulse {
      0%, 100% { opacity: 0.4; }
      50%       { opacity: 0.9; }
    }
  `;
  document.head.appendChild(style);
}

export function SkeletonPanel({ rows = 4, height = 14, gap = 10 }) {
  const { C, FONT } = useTheme();
  ensurePulseKeyframes();
  const widths = ["100%", "80%", "92%", "65%", "75%"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap, padding: "16px 0" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height,
            width: widths[i % widths.length],
            background: C.border,
            borderRadius: RADIUS.sm,
            animation: `des-pulse 1.6s ease-in-out infinite`,
            animationDelay: `${i * 120}ms`,
          }}
        />
      ))}
    </div>
  );
}
