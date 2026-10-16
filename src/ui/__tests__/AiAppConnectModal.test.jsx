// src/ui/__tests__/AiAppConnectModal.test.jsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";

import { AiAppConnectModal, MCP_DOWNLOADS, MCP_CONFIG_SNIPPET } from "../AiAppConnectModal.jsx";

describe("AiAppConnectModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders only when open", () => {
    const { rerender } = render(<AiAppConnectModal isOpen onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Connect your AI app to Flow" })).toBeInTheDocument();
    rerender(<AiAppConnectModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers both downloads from Flow itself, not GitHub", () => {
    render(<AiAppConnectModal isOpen onClose={vi.fn()} />);
    const ext = screen.getByRole("link", { name: /Download flow\.mcpb/ });
    const server = screen.getByRole("link", { name: /Download flow-mcp\.mjs/ });
    expect(ext).toHaveAttribute("href", MCP_DOWNLOADS.extension);
    expect(server).toHaveAttribute("href", MCP_DOWNLOADS.server);
    expect(MCP_DOWNLOADS.extension).toMatch(/\/downloads\/flow\.mcpb$/);
    expect(document.body.innerHTML).not.toMatch(/github\.com/i);
  });

  it("the linked files are published in public/downloads", () => {
    // Vitest runs from the repo root.
    expect(existsSync(path.join(process.cwd(), "public/downloads/flow.mcpb"))).toBe(true);
    expect(existsSync(path.join(process.cwd(), "public/downloads/flow-mcp.mjs"))).toBe(true);
  });

  it("copies the settings snippet for other MCP apps", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AiAppConnectModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy settings" }));
    expect(writeText).toHaveBeenCalledWith(MCP_CONFIG_SNIPPET);
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("closes on Escape and on the close button", () => {
    const onClose = vi.fn();
    render(<AiAppConnectModal isOpen onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
