// src/ui/__tests__/AppNavBar.test.jsx
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppNavBar } from "../AppNavBar.jsx";

const DEFAULT_PROPS = {
  profile: { initials: "AB", full_name: "Ada Baker", color: "#06b6d4" },
  isAdmin: true,
  isAdminActive: false,
  onHelpOpen: vi.fn(),
  onSettings: vi.fn(),
  onAdmin: vi.fn(),
  onSignOut: vi.fn(),
  userId: "user-1",
  currentPage: "library",
};

// Installs a mock window.matchMedia that reports `matches` for any query and
// captures listeners so a test can flip the viewport (e.g. simulate a resize
// across the 640px breakpoint) by calling the returned `fireChange`.
function mockMatchMedia(initialMatches) {
  let matches = initialMatches;
  const listeners = new Set();

  window.matchMedia = vi.fn().mockImplementation((query) => {
    const mql = {
      media: query,
      get matches() { return matches; },
      addEventListener: (_type, cb) => listeners.add(cb),
      removeEventListener: (_type, cb) => listeners.delete(cb),
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb),
    };
    return mql;
  });

  return {
    fireChange(nextMatches) {
      matches = nextMatches;
      listeners.forEach((cb) => cb({ matches: nextMatches }));
    },
  };
}

describe("AppNavBar — responsive overflow", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  // ── Above 640px: inline layout ───────────────────────────────────────────

  it("renders individual action buttons inline at desktop widths", () => {
    mockMatchMedia(false); // "(max-width: 639px)" does not match
    render(<AppNavBar {...DEFAULT_PROPS} />);

    expect(screen.getByRole("button", { name: /submit feedback/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /about flow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /simulation assistant/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /admin panel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more options/i })).not.toBeInTheDocument();
  });

  // ── Below 640px: collapsed into HeaderAccountMenu ────────────────────────

  it("collapses Feedback/About/Help/Admin/Sign Out into the ••• trigger below 640px", () => {
    mockMatchMedia(true); // "(max-width: 639px)" matches
    render(<AppNavBar {...DEFAULT_PROPS} />);

    expect(screen.queryByRole("button", { name: /submit feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /about flow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simulation assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin panel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
  });

  it("keeps the Settings gear as its own icon on mobile, outside the overflow menu", () => {
    mockMatchMedia(true);
    render(<AppNavBar {...DEFAULT_PROPS} />);

    // Settings is rendered directly, not inside the closed ••• menu
    expect(screen.getByRole("button", { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("surfaces the collapsed actions inside the ••• menu on mobile", async () => {
    mockMatchMedia(true);
    render(<AppNavBar {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByRole("button", { name: /more options/i }));

    expect(screen.getByRole("menuitem", { name: /feedback/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /about flow/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /help/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /admin panel/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();

    // Settings/theme is explicitly excluded from this menu
    expect(screen.queryByRole("menuitem", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("wires the ••• menu's Sign Out item to the onSignOut prop", async () => {
    const onSignOut = vi.fn();
    mockMatchMedia(true);
    render(<AppNavBar {...DEFAULT_PROPS} onSignOut={onSignOut} />);

    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
