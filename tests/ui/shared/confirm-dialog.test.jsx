import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../../../src/ui/shared/ConfirmDialog.jsx";
import { useConfirm } from "../../../src/ui/shared/useConfirm.jsx";
import { ThemeProvider } from "../../../src/ui/shared/ThemeContext.jsx";

describe("ConfirmDialog", () => {
  it("renders the message and calls onConfirm/onCancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ThemeProvider>
        <ConfirmDialog isOpen title="Delete it?" message="This cannot be undone." onConfirm={onConfirm} onCancel={onCancel} />
      </ThemeProvider>
    );

    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("uses custom labels when given", () => {
    render(
      <ThemeProvider>
        <ConfirmDialog isOpen title="X" message="Y" confirmLabel="Delete" cancelLabel="Keep" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("hides the cancel button and labels the action OK for a single-action alert", () => {
    render(
      <ThemeProvider>
        <ConfirmDialog isOpen singleAction title="Heads up" message="No numeric values found." onConfirm={vi.fn()} onCancel={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("shows a busy state while an async onConfirm is in flight", async () => {
    let resolveConfirm;
    const onConfirm = vi.fn(() => new Promise(r => { resolveConfirm = r; }));
    render(
      <ThemeProvider>
        <ConfirmDialog isOpen title="X" message="Y" onConfirm={onConfirm} onCancel={vi.fn()} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByRole("button", { name: "Working…" })).toBeInTheDocument();

    await act(async () => { resolveConfirm(); });
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});

function Harness({ onResult }) {
  const { confirm, confirmDialog } = useConfirm();
  return (
    <div>
      <button onClick={async () => onResult(await confirm("Delete this?"))}>Trigger</button>
      {confirmDialog}
    </div>
  );
}

describe("useConfirm", () => {
  it("resolves true when the dialog is confirmed", async () => {
    const onResult = vi.fn();
    render(
      <ThemeProvider>
        <Harness onResult={onResult} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(await screen.findByText("Delete this?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByText("Delete this?")).not.toBeInTheDocument();
  });

  it("resolves false when cancelled, and renders nothing until confirm() is called", async () => {
    const onResult = vi.fn();
    render(
      <ThemeProvider>
        <Harness onResult={onResult} />
      </ThemeProvider>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Trigger" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });
});
