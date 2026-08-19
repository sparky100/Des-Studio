// src/ui/__tests__/HeaderAccountMenu.test.jsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { HeaderAccountMenu } from "../HeaderAccountMenu.jsx";

const DEFAULT_PROPS = {
  appName: "flow",
  isAdmin: false,
  onFeedback: vi.fn(),
  onAbout: vi.fn(),
  onHelp: vi.fn(),
  onAdminPanel: vi.fn(),
  onSignOut: vi.fn(),
};

describe("HeaderAccountMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Closed state ──────────────────────────────────────────────────────────

  it("renders only the ••• trigger by default", () => {
    render(<HeaderAccountMenu {...DEFAULT_PROPS} />);
    expect(screen.getByRole("button", { name: /more options/i })).toBeInTheDocument();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  // ── Open state ────────────────────────────────────────────────────────────

  it("opens the menu when the trigger is clicked, with Support and Account tiers", async () => {
    render(<HeaderAccountMenu {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByText("Support")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /feedback/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /about flow/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /help/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeInTheDocument();
  });

  it("does not render Admin panel when isAdmin is false", async () => {
    render(<HeaderAccountMenu {...DEFAULT_PROPS} isAdmin={false} />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.queryByRole("menuitem", { name: /admin panel/i })).not.toBeInTheDocument();
  });

  it("renders Admin panel when isAdmin is true", async () => {
    render(<HeaderAccountMenu {...DEFAULT_PROPS} isAdmin={true} />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByRole("menuitem", { name: /admin panel/i })).toBeInTheDocument();
  });

  // ── Item callbacks ────────────────────────────────────────────────────────

  it("calls onFeedback and closes the menu when Feedback is clicked", async () => {
    const onFeedback = vi.fn();
    render(<HeaderAccountMenu {...DEFAULT_PROPS} onFeedback={onFeedback} />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /feedback/i }));

    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls onSignOut when Sign Out is clicked", async () => {
    const onSignOut = vi.fn();
    render(<HeaderAccountMenu {...DEFAULT_PROPS} onSignOut={onSignOut} />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  // ── Dismissal ─────────────────────────────────────────────────────────────

  it("closes on Escape", async () => {
    render(<HeaderAccountMenu {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on outside click", async () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <HeaderAccountMenu {...DEFAULT_PROPS} />
      </div>
    );
    await userEvent.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("outside"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
