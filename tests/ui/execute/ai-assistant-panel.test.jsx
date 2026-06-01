import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiAssistantPanel } from "../../../src/ui/execute/AiAssistantPanel.jsx";

vi.mock("../../../src/llm/apiClient.js", () => ({
  streamNarrative: vi.fn(),
}));

describe("AiAssistantPanel", () => {
  it("renders the results Analyse panel without crashing", () => {
    render(
      <AiAssistantPanel
        activeTab="results"
        model={{ name: "Clinic model" }}
        results={{ summary: { served: 12 } }}
        aggregateStats={{ meanWait: 4.2 }}
        comparisonRuns={[]}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole("complementary", { name: "AI assistant" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Analyse results" })).toBeTruthy();
  });
});
