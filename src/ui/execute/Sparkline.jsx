// ui/execute/Sparkline.jsx — shared mini line chart for live execute panels
// Used by ExecuteQueueNode (queue depth history) and ContainerGaugeStrip (container level history)
export const SPARKLINE_W = 138;
export const SPARKLINE_H = 22;

export function Sparkline({ history, color, width = SPARKLINE_W, height = SPARKLINE_H }) {
  if (history.length < 2) {
    return (
      <div style={{
        width,
        height,
        borderTop: `1px dashed ${color}33`,
      }} />
    );
  }
  const max = Math.max(...history, 1);
  const pts = history.map((v, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - 2 - (v / max) * (height - 4);
    return [x, y];
  });
  const linePts = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const fillPts = [
    ...pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`),
    `${width},${height}`,
    `0,${height}`,
  ].join(" ");

  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <polygon points={fillPts} fill={color} fillOpacity={0.1} />
      <polyline
        points={linePts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
