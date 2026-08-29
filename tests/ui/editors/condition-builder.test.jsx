// ConditionBuilder's mount/prop-change effect exists to silently repair a
// stale token/invalid operator/missing value it finds in a persisted
// condition. But predicateToRows/rowsToPredicate can only represent a flat,
// single-level condition — a genuinely nested-but-valid one always looks
// "different" after a round-trip even when nothing needs fixing. Before this
// fix that difference alone was enough to fire onChange, silently flattening
// a valid condition on every render — including right after Discard, which
// restores the same nested value and re-triggers the same "edit", trapping
// the user in an unbreakable unsaved-changes loop (the reported bug).
import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConditionBuilder } from "../../../src/ui/editors/ConditionBuilder.jsx";

const entityTypes = [{ id: "et1", name: "Patient", role: "customer" }];
const queues = [{ id: "q1", name: "Triage Queue", customerType: "Patient" }];
// Matches tokens.js's queue-token shape from ConditionBuilder's own useMemo.
const TOKEN_A = "queue(Triage Queue).length";

function renderBuilder(props) {
  const onChange = vi.fn();
  render(
    <ConditionBuilder
      value={null}
      onChange={onChange}
      entityTypes={entityTypes}
      queues={queues}
      {...props}
    />
  );
  return onChange;
}

describe("ConditionBuilder — auto-repair effect must not treat flattening as an edit", () => {
  it("does not call onChange for a genuinely nested, valid condition (no stale tokens)", () => {
    const nested = {
      operator: "AND",
      clauses: [
        { operator: "AND", clauses: [
          { variable: TOKEN_A, operator: ">", value: 0 },
          { variable: TOKEN_A, operator: "<", value: 10 },
        ] },
        { variable: TOKEN_A, operator: "!=", value: 5 },
      ],
    };
    const onChange = renderBuilder({ value: nested });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still calls onChange to repair a leaf referencing a token that no longer exists", () => {
    const staleLeaf = { variable: "queue(Deleted Queue).length", operator: ">", value: 0 };
    const onChange = renderBuilder({ value: staleLeaf });
    expect(onChange).toHaveBeenCalledTimes(1);
    const repaired = onChange.mock.calls[0][0];
    // Repaired to the first available token, not left dangling.
    expect(JSON.stringify(repaired)).not.toContain("Deleted Queue");
  });

  it("does not call onChange for a string condition whose state.<name> clause resolves to a known state variable (dialect normalization is not a repair)", () => {
    // Matches the real reported bug: a persisted condition string using the
    // documented `state.<name>` dialect for a state-variable clause. The
    // dropdown's own token for that variable is always the bare `<name>` form
    // (see stateVarTokens in ConditionBuilder's useMemo) — recognizing that
    // equivalence and rewriting to the bare form is intentional, not a repair,
    // and must not fire onChange on mere mount/view.
    const conditionStr = "queue(Triage Queue).length > 0 AND state.repairsInProgress > 0";
    const onChange = renderBuilder({
      value: conditionStr,
      stateVariables: [{ id: "sv1", name: "repairsInProgress" }],
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange for a compound-object condition whose leaf variable uses the state.<name> dialect", () => {
    const conditionObj = {
      operator: "AND",
      clauses: [
        { variable: TOKEN_A, operator: ">", value: 0 },
        { variable: "state.repairsInProgress", operator: ">", value: 0 },
      ],
    };
    const onChange = renderBuilder({
      value: conditionObj,
      stateVariables: [{ id: "sv1", name: "repairsInProgress" }],
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("still calls onChange to repair a state.<name> clause whose variable no longer exists", () => {
    const conditionStr = "state.deletedVar > 0";
    const onChange = renderBuilder({
      value: conditionStr,
      stateVariables: [{ id: "sv1", name: "repairsInProgress" }],
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const repaired = onChange.mock.calls[0][0];
    expect(JSON.stringify(repaired)).not.toContain("deletedVar");
  });

  it("does not call onChange when the token list changes but every row's token still exists", () => {
    const flat = { operator: "AND", clauses: [
      { variable: TOKEN_A, operator: ">", value: 0 },
      { variable: TOKEN_A, operator: "<", value: 10 },
    ] };
    const onChange = vi.fn();
    const { rerender } = render(
      <ConditionBuilder value={flat} onChange={onChange} entityTypes={entityTypes} queues={queues} />
    );
    expect(onChange).not.toHaveBeenCalled();

    // Simulate an unrelated entity-type edit that changes the token list
    // (new useMemo identity) while the referenced token is still valid.
    rerender(
      <ConditionBuilder
        value={flat}
        onChange={onChange}
        entityTypes={[...entityTypes, { id: "et2", name: "Staff", role: "server" }]}
        queues={queues}
      />
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
