// src/ui/__tests__/FeedbackModal.test.jsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// vi.mock is hoisted to the top by Vitest — factory must not reference
// variables declared later. Use vi.fn() inline; configure per-test via
// vi.mocked() in beforeEach.
vi.mock("../../db/supabase.js", () => ({
  supabase: { from: vi.fn() },
  submitFeedback: vi.fn(),
}));

import { submitFeedback } from "../../db/supabase.js";
import { FeedbackModal }   from "../FeedbackModal.jsx";

const DEFAULT_PROPS = {
  isOpen: true,
  onClose: vi.fn(),
  userId: "user-abc",
  currentPage: "library",
};

describe("FeedbackModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(submitFeedback).mockResolvedValue(undefined);
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it("renders when isOpen = true", () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // "Send Feedback" appears in both the heading and the submit button
    expect(screen.getAllByText("Send Feedback").length).toBeGreaterThanOrEqual(1);
  });

  it("does not render when isOpen = false", () => {
    render(<FeedbackModal {...DEFAULT_PROPS} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // ── Submit button disabled states ─────────────────────────────────────────

  it("submit button is disabled when message is empty", () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const btn = screen.getByRole("button", { name: /send feedback/i });
    expect(btn).toBeDisabled();
  });

  it("submit button is disabled when message has fewer than 10 characters", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const textarea = screen.getByRole("textbox", { name: /feedback message/i });
    await userEvent.type(textarea, "Too short");
    const btn = screen.getByRole("button", { name: /send feedback/i });
    expect(btn).toBeDisabled();
  });

  it("submit button is enabled when message has 10 or more characters", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const textarea = screen.getByRole("textbox", { name: /feedback message/i });
    await userEvent.type(textarea, "This is a valid message");
    const btn = screen.getByRole("button", { name: /send feedback/i });
    expect(btn).not.toBeDisabled();
  });

  // ── Category pills ────────────────────────────────────────────────────────

  it("renders all four category pills", () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    expect(screen.getByRole("button", { name: /bug report/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /feature request/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /question/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /other/i })).toBeInTheDocument();
  });

  it("clicking a category pill marks it as active (aria-pressed)", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const featureBtn = screen.getByRole("button", { name: /feature request/i });
    expect(featureBtn).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(featureBtn);
    expect(featureBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("selecting Feature Request deselects Bug Report", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const bugBtn     = screen.getByRole("button", { name: /bug report/i });
    const featureBtn = screen.getByRole("button", { name: /feature request/i });

    // Bug is active by default
    expect(bugBtn).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(featureBtn);
    expect(featureBtn).toHaveAttribute("aria-pressed", "true");
    expect(bugBtn).toHaveAttribute("aria-pressed", "false");
  });

  // ── Successful submission ─────────────────────────────────────────────────

  it("shows confirmation message after successful submission", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const textarea = screen.getByRole("textbox", { name: /feedback message/i });
    await userEvent.type(textarea, "This is a valid test message");
    await userEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/thank you — your feedback has been received/i)
      ).toBeInTheDocument();
    });
  });

  it("submitFeedback is called with correct category, message, and appVersion", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);

    // Switch to Feature Request
    await userEvent.click(screen.getByRole("button", { name: /feature request/i }));

    const textarea = screen.getByRole("textbox", { name: /feedback message/i });
    await userEvent.type(textarea, "Please add dark mode support");

    await userEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(vi.mocked(submitFeedback)).toHaveBeenCalledTimes(1);
    });

    const [callArgs] = vi.mocked(submitFeedback).mock.calls;
    expect(callArgs[0].category).toBe("feature");
    expect(callArgs[0].message).toBe("Please add dark mode support");
    // appVersion comes from import.meta.env.VITE_APP_VERSION which is
    // substituted via vite.config.js define; may be the package version
    // or undefined depending on how npm started the test. Either way, it
    // must be present as the key (even if undefined).
    expect(callArgs[0]).toHaveProperty("appVersion");
    expect(callArgs[0].userId).toBe("user-abc");
    expect(callArgs[0].replyEmail).toBe("");
  });

  it("passes the optional reply email through on submit", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);

    await userEvent.type(screen.getByRole("textbox", { name: /feedback message/i }), "Please contact me about this issue");
    await userEvent.type(screen.getByRole("textbox", { name: /reply email/i }), "person@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(vi.mocked(submitFeedback)).toHaveBeenCalledTimes(1);
    });

    const [callArgs] = vi.mocked(submitFeedback).mock.calls;
    expect(callArgs[0].replyEmail).toBe("person@example.com");
  });

  it("shows an inline error when reply email is invalid", async () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);

    await userEvent.type(screen.getByRole("textbox", { name: /feedback message/i }), "Please contact me about this issue");
    await userEvent.type(screen.getByRole("textbox", { name: /reply email/i }), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    expect(screen.getByText(/enter a valid reply email address/i)).toBeInTheDocument();
    expect(vi.mocked(submitFeedback)).not.toHaveBeenCalled();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it("shows error message when submission fails", async () => {
    vi.mocked(submitFeedback).mockRejectedValue(new Error("Network timeout"));
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const textarea = screen.getByRole("textbox", { name: /feedback message/i });
    await userEvent.type(textarea, "This is a valid test message");
    await userEvent.click(screen.getByRole("button", { name: /send feedback/i }));

    await waitFor(() => {
      expect(screen.getByText(/network timeout/i)).toBeInTheDocument();
    });
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it("dialog has aria-labelledby pointing to heading", () => {
    render(<FeedbackModal {...DEFAULT_PROPS} />);
    const dialog  = screen.getByRole("dialog");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId)).toBeInTheDocument();
  });

  it("pressing Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<FeedbackModal {...DEFAULT_PROPS} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close button calls onClose", async () => {
    const onClose = vi.fn();
    render(<FeedbackModal {...DEFAULT_PROPS} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: /close feedback/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
