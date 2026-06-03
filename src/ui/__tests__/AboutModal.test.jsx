// src/ui/__tests__/AboutModal.test.jsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AboutModal } from "../AboutModal.jsx";

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
};

describe("AboutModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders when isOpen = true", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render when isOpen = false", () => {
    render(<AboutModal {...DEFAULT_PROPS} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Static content ────────────────────────────────────────────────────────

  it("renders the app name simmodlr", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("simmodlr");
  });

  it("renders a version string in the Version row", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    // The version label is always present regardless of the env var value
    expect(screen.getByText("Version")).toBeInTheDocument();
    // A span next to the Version label contains "v" + <version or "—">
    const versionRow = screen.getByText("Version").closest("div");
    const valueSpan  = versionRow?.querySelector("span:last-child");
    expect(valueSpan).toBeInTheDocument();
    // The value starts with "v" (either "v7.0.0" in npm context or "v—" when env is absent)
    expect(valueSpan?.textContent).toMatch(/^v/);
  });

  it("renders the copyright notice", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    expect(
      screen.getByText(/© 2026 SimModlr\. All rights reserved\./i)
    ).toBeInTheDocument();
  });

  it("renders a mailto link to support@simmodlr.app", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    const link = screen.getByRole("link", { name: /support@simmodlr\.app/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "mailto:support@simmodlr.app");
  });

  it("renders the Three-Phase method description", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    expect(screen.getByText(/Three-Phase Simulation approach/i)).toBeInTheDocument();
  });

  it("renders the feedback footer note", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    expect(
      screen.getByText(/Feedback and bug reports are welcome/i)
    ).toBeInTheDocument();
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("dialog has aria-labelledby pointing to heading", () => {
    render(<AboutModal {...DEFAULT_PROPS} />);
    const dialog  = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId)).toBeInTheDocument();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<AboutModal {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    render(<AboutModal {...DEFAULT_PROPS} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close about/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clicking the backdrop calls onClose", async () => {
    const onClose = vi.fn();
    render(<AboutModal {...DEFAULT_PROPS} onClose={onClose} />);
    // The backdrop is the role="presentation" wrapper; click it directly
    const backdrop = screen.getByRole("presentation");
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
