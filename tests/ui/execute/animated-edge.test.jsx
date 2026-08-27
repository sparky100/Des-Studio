// AnimatedEdge — the token-dot edge renderer. SMIL's begin="0s" is relative
// to the SVG document timeline, so late-inserted tokens used to render
// already-finished (a static dot at the path end). The fix starts each dot's
// motion explicitly via beginElement() on mount.
import { render } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import { AnimatedEdge } from "../../../src/ui/execute/AnimatedEdge.jsx";

vi.mock("../../../src/ui/shared/xyflow.js", () => ({
  BaseEdge: ({ path }) => <path data-testid="base-edge" d={path} />,
  getBezierPath: () => ["M0,0 L100,100"],
}));

const EDGE_PROPS = {
  id: "e1",
  sourceX: 0, sourceY: 0, sourcePosition: "right",
  targetX: 100, targetY: 100, targetPosition: "left",
};

afterEach(() => {
  vi.restoreAllMocks();
});

function renderEdge(tokens) {
  return render(
    <svg>
      <AnimatedEdge {...EDGE_PROPS} data={{ tokens }} />
    </svg>
  );
}

describe("AnimatedEdge", () => {
  test("starts each token's motion via beginElement on mount", () => {
    // jsdom's SVGElement has no beginElement — stub it on the prototype so
    // the mount effect finds and calls it.
    const beginElement = vi.fn();
    window.SVGElement.prototype.beginElement = beginElement;
    try {
      renderEdge([{ id: "t1", color: "#f0f" }, { id: "t2", color: "#0ff" }]);
      expect(beginElement).toHaveBeenCalledTimes(2);
    } finally {
      delete window.SVGElement.prototype.beginElement;
    }
  });

  test("renders one dot per token with begin='indefinite', without crashing when SMIL is unavailable", () => {
    const { container } = renderEdge([{ id: "t1", color: "#f0f" }]);
    const motions = container.querySelectorAll("animateMotion");
    expect(motions).toHaveLength(1);
    expect(motions[0].getAttribute("begin")).toBe("indefinite");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  test("skips beginElement under prefers-reduced-motion (dot renders, no travel)", () => {
    const beginElement = vi.fn();
    window.SVGElement.prototype.beginElement = beginElement;
    const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true });
    try {
      const { container } = renderEdge([{ id: "t1", color: "#f0f" }]);
      expect(beginElement).not.toHaveBeenCalled();
      expect(container.querySelectorAll("circle")).toHaveLength(1);
    } finally {
      delete window.SVGElement.prototype.beginElement;
      matchMedia.mockRestore();
    }
  });

  test("renders no dots when there are no tokens", () => {
    const { container } = renderEdge([]);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.querySelector('[data-testid="base-edge"]')).toBeTruthy();
  });
});
