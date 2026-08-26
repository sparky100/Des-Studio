import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalShell } from "../../../src/ui/shared/ModalShell.jsx";
import { ThemeProvider } from "../../../src/ui/shared/ThemeContext.jsx";

function renderShell(props = {}) {
  const onClose = vi.fn();
  const utils = render(
    <ThemeProvider>
      <button>Outside trigger</button>
      <ModalShell isOpen title="A Title" onClose={onClose} {...props}>
        <p>Body content</p>
        <button>First</button>
        <button>Last</button>
      </ModalShell>
    </ThemeProvider>
  );
  return { onClose, ...utils };
}

describe("ModalShell", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ThemeProvider>
        <ModalShell isOpen={false} onClose={vi.fn()} title="Hidden">
          <p>never shown</p>
        </ModalShell>
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a labelled dialog with its title and body when open", () => {
    renderShell();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("A Title")).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName("A Title");
  });

  it("calls onClose when the backdrop is clicked, but not when the dialog body is clicked", () => {
    const { onClose } = renderShell();
    fireEvent.click(screen.getByText("Body content"));
    expect(onClose).not.toHaveBeenCalled();

    // role="presentation" wrapper is the backdrop; clicking it directly
    // (not a descendant) should close.
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const { onClose } = renderShell();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the header close button is clicked", () => {
    const { onClose } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("autofocuses the first focusable element inside the dialog on open (the header close button, since it's first in DOM order)", async () => {
    renderShell();
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });
  });

  it("autofocuses the first focusable body element when there's no header (no title given)", async () => {
    render(
      <ThemeProvider>
        <ModalShell isOpen onClose={vi.fn()}>
          <button>Inside</button>
        </ModalShell>
      </ThemeProvider>
    );
    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();
    });
  });

  it("restores focus to the trigger element after closing", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <ThemeProvider>
        <ModalShell isOpen onClose={vi.fn()}>
          <button>Inside</button>
        </ModalShell>
      </ThemeProvider>
    );
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus());

    rerender(
      <ThemeProvider>
        <ModalShell isOpen={false} title="T" onClose={vi.fn()}>
          <button>Inside</button>
        </ModalShell>
      </ThemeProvider>
    );

    expect(trigger).toHaveFocus();
    document.body.removeChild(trigger);
  });

  it("renders a footer when provided", () => {
    renderShell({ footer: <button>Footer action</button> });
    expect(screen.getByRole("button", { name: "Footer action" })).toBeInTheDocument();
  });

  it("omits aria-labelledby when no title is given", () => {
    render(
      <ThemeProvider>
        <ModalShell isOpen onClose={vi.fn()}>
          <button>Only content</button>
        </ModalShell>
      </ThemeProvider>
    );
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-labelledby");
  });
});
