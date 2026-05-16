// ui/shared/hooks.js — Shared React hooks
import { useState, useEffect } from "react";

export const BP = {
  mobile:  720,
  compact: 1024,
};

export function useViewport() {
  const [width, setWidth] = useState(() => {
    if (typeof document === "undefined") return 1280;
    return document.documentElement.clientWidth || 1280;
  });

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w != null) setWidth(w);
    });
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);

  return {
    width,
    isMobile:  width < BP.mobile,
    isCompact: width >= BP.mobile && width < BP.compact,
    isDesktop: width >= BP.compact,
  };
}
