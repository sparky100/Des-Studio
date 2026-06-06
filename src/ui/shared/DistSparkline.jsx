// ui/shared/DistSparkline.jsx — Small SVG preview of distribution shape
import { useTheme } from "./ThemeContext.jsx";

const W = 120;
const H = 40;
const PAD = 4;
const IW = W - PAD * 2;
const IH = H - PAD * 2;

function pathPoints(xs, ys) {

  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = 0, yMax = Math.max(...ys, 0.01);
  const px = x => PAD + ((x - xMin) / (xMax - xMin || 1)) * IW;
  const py = y => PAD + IH - ((y - yMin) / (yMax - yMin || 1)) * IH;
  return xs.map((x, i) => `${i === 0 ? "M" : "L"} ${px(x).toFixed(1)} ${py(ys[i]).toFixed(1)}`).join(" ");
}

function linspace(a, b, n) {
  return Array.from({ length: n }, (_, i) => a + (i / (n - 1)) * (b - a));
}

// Approximate PDF shapes

function ExponentialShape({ mean }) {
  const { C } = useTheme();
  const m = Math.max(0.01, parseFloat(mean) || 1);
  const xs = linspace(0, m * 4, 40);
  const ys = xs.map(x => Math.exp(-x / m) / m);
  const d = pathPoints(xs, ys);
  return <path d={d} fill="none" stroke={C.cEvent} strokeWidth={1.5} />;
}

function UniformShape({ min, max }) {
  const { C } = useTheme();
  const lo = parseFloat(min) || 0;
  const hi = parseFloat(max) || 1;
  if (lo >= hi) return <rect x={PAD} y={PAD} width={IW} height={IH} fill={C.cEvent + "44"} stroke={C.cEvent} strokeWidth={1} />;
  const h = 1 / (hi - lo);
  const px = x => PAD + ((x - lo) / (hi - lo)) * IW;
  const py = y => PAD + IH - y * IH / (h || 1);
  const top = py(h);
  return (
    <g>
      <rect x={px(lo)} y={top} width={px(hi) - px(lo)} height={PAD + IH - top} fill={C.cEvent + "33"} stroke={C.cEvent} strokeWidth={1.5} />
    </g>
  );
}

function FixedShape({ value }) {
  const { C } = useTheme();
  const v = parseFloat(value) || 1;
  const cx = PAD + IW / 2;
  return (
    <g>
      <line x1={cx} y1={PAD} x2={cx} y2={PAD + IH} stroke={C.cEvent} strokeWidth={2} />
      <circle cx={cx} cy={PAD} r={3} fill={C.cEvent} />
    </g>
  );
}

function NormalShape({ mean, stddev }) {
  const { C } = useTheme();
  const m = parseFloat(mean) || 1;
  const s = Math.max(0.01, parseFloat(stddev) || 0.3);
  const range = s * 4;
  const xs = linspace(Math.max(0, m - range), m + range, 50);
  const ys = xs.map(x => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI)));
  const d = pathPoints(xs, ys);
  return <path d={d} fill="none" stroke={C.cEvent} strokeWidth={1.5} />;
}

function TriangularShape({ min, mode, max }) {
  const { C } = useTheme();
  const a = parseFloat(min) || 0;
  const c = parseFloat(mode) || 0.5;
  const b = parseFloat(max) || 1;
  if (a >= b) return <IconShape label="△" />;
  const peak = 2 / (b - a);
  const xs = [a, c, b];
  const ys = [0, peak, 0];
  const d = pathPoints(xs, ys);
  return <path d={d} fill={C.cEvent + "33"} stroke={C.cEvent} strokeWidth={1.5} />;
}

function ErlangShape({ k, mean }) {
  const { C } = useTheme();
  const kv = Math.max(1, Math.round(parseFloat(k) || 2));
  const m = Math.max(0.01, parseFloat(mean) || 1);
  const rate = kv / m;
  const xs = linspace(0, m * 3, 50);
  // Erlang PDF: rate^k * x^(k-1) * exp(-rate*x) / (k-1)!
  const factorial = n => n <= 1 ? 1 : n * factorial(n - 1);
  const fk = factorial(kv - 1);
  const ys = xs.map(x => x <= 0 ? 0 : (rate ** kv) * (x ** (kv - 1)) * Math.exp(-rate * x) / fk);
  const d = pathPoints(xs, ys);
  return <path d={d} fill="none" stroke={C.cEvent} strokeWidth={1.5} />;
}

function IconShape({ label }) {
  const { C } = useTheme();
  return (
    <text x={W / 2} y={H / 2 + 4} textAnchor="middle" fill={C.muted} fontSize={13} fontFamily="sans-serif">
      {label}
    </text>
  );
}

const SHAPE_MAP = {
  Fixed:      ({ p }) => <FixedShape {...p} />,
  Exponential:({ p }) => <ExponentialShape {...p} />,
  Uniform:    ({ p }) => <UniformShape {...p} />,
  Normal:     ({ p }) => <NormalShape {...p} />,
  Triangular: ({ p }) => <TriangularShape {...p} />,
  Erlang:     ({ p }) => <ErlangShape {...p} />,
  Piecewise:  ()      => <IconShape label="⏱" />,
  Schedule:   ()      => <IconShape label="📅" />,
  Empirical:  ()      => <IconShape label="📊" />,
  ServerAttr: ()      => <IconShape label="⚙" />,
  EntityAttr: ()      => <IconShape label="👤" />,
};

export function DistSparkline({ dist, distParams = {} }) {
  const { C } = useTheme();
  const ShapeComp = SHAPE_MAP[dist] || (() => <IconShape label="?" />);
  return (
    <svg
      width={W}
      height={H}
      aria-label={`${dist} distribution preview`}
      role="img"
      style={{ display: "block", overflow: "visible" }}
    >
      <rect x={0} y={0} width={W} height={H} rx={3} fill={C.bg} stroke={C.border} strokeWidth={0.5} />
      <ShapeComp p={distParams} />
    </svg>
  );
}
