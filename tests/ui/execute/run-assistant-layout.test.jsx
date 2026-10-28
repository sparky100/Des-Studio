import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiAssistantPanel as Assistant } from "../../../src/ui/execute/AiAssistantPanel.jsx";

vi.mock("../../../src/llm/apiClient.js", () => ({
  streamNarrative: vi.fn(),
  tryExtractJson: raw => JSON.parse(raw),
}));

const model = { name: "Clinic", queues: [], entityTypes: [], bEvents: [], cEvents: [] };
const results = { summary: { served: 12 }, log: [] };

function AiAssistantPanel(props) {
  return <Assistant comparisonRuns={[]} aggregateStats={{}} {...props} />;
}

function selectMode(name) {
  fireEvent.click(within(screen.getByRole("group", { name: "Run assistant modes" })).getByRole("button", { name }));
}

afterEach(() => vi.unstubAllGlobals());

describe("Run assistant layout", () => {
  it.each([
    ["sidebar", { sidebar: true }],
    ["overlay", { overlay: true }],
    ["phone", { mobileFullscreen: true }],
  ])("keeps modes and close available while switching content in the %s", (_name, presentation) => {
    render(<AiAssistantPanel activeTab="execute" model={model} results={results}
      onClose={vi.fn()} onOpenOptimise={vi.fn()} {...presentation} />);

    expect(screen.getByRole("button", { name: "Design", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Optimise/ })).toHaveLength(1);
    const question = screen.getByPlaceholderText("e.g. How many queues does this model have?");
    fireEvent.change(question, { target: { value: "Explain my queues" } });

    selectMode("Diagnose");
    expect(screen.getByRole("button", { name: "Diagnose", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Diagnosis")).toBeInTheDocument();
    expect(screen.queryByText("Debugging Chat")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("AI analysis response")).not.toBeInTheDocument();

    selectMode("Debug");
    expect(screen.getByText("Debugging Chat")).toBeInTheDocument();
    expect(screen.queryByText("Diagnosis")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a question about your model…")).toBeInTheDocument();
    expect(screen.queryByLabelText("AI analysis response")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close Simulation Assistant" })).toBeInTheDocument();

    selectMode("Design");
    expect(screen.getByDisplayValue("Explain my queues")).toBeInTheDocument();
    expect(screen.getByLabelText("AI analysis response")).toBeInTheDocument();
  });

  it("shows the run prerequisite in each diagnostic mode without an unused response box", () => {
    render(<AiAssistantPanel sidebar activeTab="execute" model={model} onClose={vi.fn()} />);
    for (const mode of ["Diagnose", "Debug"]) {
      selectMode(mode);
      expect(screen.getByText("Run the model to enable Simulation Assistant diagnostics.")).toBeInTheDocument();
      expect(screen.queryByLabelText("AI analysis response")).not.toBeInTheDocument();
    }
  });

  it("shows diagnosis findings and keeps the mode controls available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify({
        overallAssessment: "Arrivals exceed capacity.",
        findings: [{ severity: "WARNING", title: "Queue grows", explanation: "Add capacity to drain the queue." }],
      }) }),
    }));
    render(<AiAssistantPanel sidebar activeTab="execute" model={model} results={results} onClose={vi.fn()} />);
    selectMode("Diagnose");
    fireEvent.click(screen.getAllByRole("button", { name: "Diagnose" }).at(-1));
    expect(await screen.findByText("Queue grows")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-diagnose" })).toBeInTheDocument();
    selectMode("Debug");
    expect(screen.getByText("Debugging Chat")).toBeInTheDocument();
  });

  it("preserves the Design assistant Q&A and response surface", () => {
    render(<AiAssistantPanel sidebar activeTab="visual" model={model} onClose={vi.fn()} />);
    expect(screen.queryByRole("group", { name: "Run assistant modes" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. How many queues does this model have?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explain the process flow" })).toBeInTheDocument();
    expect(screen.getByLabelText("AI analysis response")).toBeInTheDocument();
  });
});
