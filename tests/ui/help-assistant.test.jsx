import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpAssistant } from "../../src/ui/HelpAssistant.jsx";

// Mock the LLM client
vi.mock("../../src/llm/apiClient.js", () => ({
  callLLMOnce: vi.fn(),
}));

describe("HelpAssistant", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    currentModel: null,
    currentTab: "overview",
    currentView: "library",
    validation: null,
  };

  it("renders when isOpen = true", () => {
    render(<HelpAssistant {...defaultProps} />);
    expect(screen.getByLabelText("Help Assistant")).toBeInTheDocument();
  });

  it("does not render when isOpen = false", () => {
    render(<HelpAssistant {...defaultProps} isOpen={false} />);
    expect(screen.queryByLabelText("Help Assistant")).not.toBeInTheDocument();
  });

  it("close button calls onClose callback", async () => {
    const onClose = vi.fn();
    render(<HelpAssistant {...defaultProps} onClose={onClose} />);
    const closeButton = screen.getByLabelText("Close help");
    await userEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("suggested questions render based on currentTab", () => {
    render(<HelpAssistant {...defaultProps} currentTab="entities" />);
    expect(screen.getByText("SUGGESTED QUESTIONS")).toBeInTheDocument();
    expect(
      screen.getByText(/How do I add a priority attribute/i)
    ).toBeInTheDocument();
  });

  it("different tabs show different suggested questions", () => {
    const { rerender } = render(
      <HelpAssistant {...defaultProps} currentTab="entities" />
    );
    expect(
      screen.getByText(/How do I add a priority attribute/i)
    ).toBeInTheDocument();

    rerender(<HelpAssistant {...defaultProps} currentTab="execute" />);
    expect(
      screen.getByText(/How many replications/i)
    ).toBeInTheDocument();
  });

  it("clicking a suggested question submits it", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockResolvedValue("Here's how you do it...");

    render(<HelpAssistant {...defaultProps} currentTab="entities" />);
    const questionButton = screen.getByText(/How do I add a priority attribute/i);
    await userEvent.click(questionButton);

    await waitFor(() => {
      expect(callLLMOnce).toHaveBeenCalled();
    });
  });

  it("user message appears in conversation after submit", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockResolvedValue("Here's the answer");

    render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/e.g. How do I set up exponential arrivals/i);
    await userEvent.type(textarea, "Test question{Enter}");

    expect(screen.getByText("YOU")).toBeInTheDocument();
    expect(screen.getByText("Test question")).toBeInTheDocument();
  });

  it("assistant response appears after LLM returns", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockResolvedValue("This is the assistant response");

    render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByLabelText("Your question");
    await userEvent.type(textarea, "Test question{Enter}");

    await waitFor(() => {
      expect(screen.getByText("AI")).toBeInTheDocument();
      expect(screen.getByText("This is the assistant response")).toBeInTheDocument();
    });
  });

  it("loading indicator shows while isLoading", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByLabelText("Your question");
    await userEvent.type(textarea, "Test question{Enter}");

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("error message displays if LLM call fails", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockRejectedValue(new Error("Network error"));

    render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByLabelText("Your question");
    await userEvent.type(textarea, "Test question{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument();
    });
  });

  it("conversation history persists after close/reopen", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockResolvedValue("Answer");

    const { rerender } = render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByLabelText("Your question");
    await userEvent.type(textarea, "First question{Enter}");

    await waitFor(() => {
      expect(screen.getByText("First question")).toBeInTheDocument();
    });

    // Close and reopen
    rerender(<HelpAssistant {...defaultProps} isOpen={false} />);
    rerender(<HelpAssistant {...defaultProps} isOpen={true} />);

    // Conversation should persist (not cleared on close)
    expect(screen.getByText("First question")).toBeInTheDocument();
  });

  it("input field is present and editable", async () => {
    render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByPlaceholderText(/e.g. How do I set up exponential arrivals/i);
    expect(textarea).toBeInTheDocument();
    await userEvent.type(textarea, "Test input");
    expect(textarea.value).toBe("Test input");
  });

  it("Enter key submits question", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockResolvedValue("Answer");

    render(<HelpAssistant {...defaultProps} />);
    const textarea = screen.getByLabelText("Your question");
    await userEvent.type(textarea, "Question{Enter}");

    await waitFor(() => {
      expect(callLLMOnce).toHaveBeenCalled();
    });
  });

  it("validation errors alter suggested questions", () => {
    render(
      <HelpAssistant
        {...defaultProps}
        validation={{ errors: [{ code: "V8", message: "Missing Source" }] }}
      />
    );
    expect(
      screen.getByText("How do I fix validation errors?")
    ).toBeInTheDocument();
  });

  it("sends workflow mode context to LLM", async () => {
    const { callLLMOnce } = await import("../../src/llm/apiClient.js");
    callLLMOnce.mockResolvedValue("Answer");

    render(
      <HelpAssistant
        {...defaultProps}
        currentTab="entities"
        currentView="model-detail"
      />
    );
    const questionButton = screen.getByText(/How do I add a priority attribute/i);
    await userEvent.click(questionButton);

    await waitFor(() => {
      expect(callLLMOnce).toHaveBeenCalled();
      const callArgs = callLLMOnce.mock.calls[0][0];
      expect(JSON.stringify(callArgs)).toMatch(/Designing/);
    });
  });
});
