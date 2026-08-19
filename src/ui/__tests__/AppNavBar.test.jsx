// src/ui/__tests__/AppNavBar.test.jsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppNavBar } from "../AppNavBar.jsx";

const DEFAULT_PROPS = {
  profile: { initials: "AB", full_name: "Ada Baker", color: "#06b6d4" },
  isAdmin: true,
  onHelpOpen: vi.fn(),
  onSettings: vi.fn(),
  onAdmin: vi.fn(),
  onSignOut: vi.fn(),
  userId: "user-1",
  currentPage: "library",
};

describe("AppNavBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Collapsed at all viewports ────────────────────────────────────────────

  it("renders the ••• trigger instead of individual action buttons", () => {
    render(<AppNavBar {...DEFAULT_PROPS} />);

    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /submit feedback/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /about flow/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simulation assistant/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /admin panel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out/i })).not.toBeInTheDocument();
  });

  it("keeps the Settings gear as its own persistent header icon, outside the menu", () => {
    render(<AppNavBar {...DEFAULT_PROPS} />);

    expect(screen.getByRole("button", { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onSettings when the gear is clicked", async () => {
    const onSettings = vi.fn();
    render(<AppNavBar {...DEFAULT_PROPS} onSettings={onSettings} />);

    await userEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it("surfaces Feedback/About/Help/Admin/Sign Out inside the ••• menu", async () => {
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
    render(<AppNavBar {...DEFAULT_PROPS} onSignOut={onSignOut} />);

    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("omits Admin panel from the menu when isAdmin is false", async () => {
    render(<AppNavBar {...DEFAULT_PROPS} isAdmin={false} />);

    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.queryByRole("menuitem", { name: /admin panel/i })).not.toBeInTheDocument();
  });
});
