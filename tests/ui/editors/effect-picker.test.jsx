// EffectPicker — scaling the structured pickers (M-2, M-3, F-8, S-4), and
// Sprint 94's composer-depth upgrades (docs/reviews/macro-library-ui-coverage-audit.md,
// Group A gaps 1-8): expression-capable BATCH/FILL/DRAIN/ASSIGN-container amounts,
// a combined ASSIGN composer (source, server/ANY, optional skill, optional
// container gate), an N-server-type COSEIZE composer with per-type skills, an
// optional MATCH predicate, and a SPLIT clone-type picker.
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { EffectPicker, assignOptions, bEffectOptions } from "../../../src/ui/editors/helpers.jsx";
import { MACROS, applyScalar } from "../../../src/engine/macros.js";

const oneQueueCtx = {
  matchQueues: [{ name: "Triage Queue", type: "Customer" }],
  containerTypes: [{ id: "Fuel" }],
  serverTypes: ["Nurse", "Doctor"],
};

// Richer context exercising every new expressionContext field (numericAttrs,
// stringAttrs, skills, customerTypes, serverSkillsByType) added for the
// composer-depth workstreams.
const fullCtx = {
  matchQueues: [{ name: "Triage Queue", type: "Customer" }, { name: "Ward Queue", type: "Customer" }],
  containerTypes: [{ id: "Fuel" }],
  serverTypes: ["Nurse", "Doctor", "Porter"],
  stateVars: ["load"],
  numericAttrs: ["batchSize", "units"],
  stringAttrs: ["specialty"],
  skills: ["Triage"],
  customerTypes: ["Customer", "VIP"],
  serverSkillsByType: { Nurse: ["Triage"], Doctor: ["Surgery"], Porter: [] },
  bEventServerTypes: ["Nurse", "Doctor"],
};

// Engine round-trip guard — the audit's core issue was UI composers emitting
// forms the engine doesn't actually parse (or being needlessly narrower than
// what it accepts). Every string this file asserts via onChange, and every
// enumerated option produced by the option generators, is checked against the
// engine's own MACROS[].pattern (or applyScalar's scalar-effect grammar) so UI
// output can never drift from engine grammar undetected.
const matchesScalar = s => /^\w+\+\+$/.test(s) || /^\w+--$/.test(s)
  || /^\w+\s*\+=\s*.+$/.test(s) || /^\w+\s*-=\s*.+$/.test(s) || /^\w+\s*=\s*.+$/.test(s);
const matchesEngine = s => MACROS.some(m => m.pattern.test(s)) || matchesScalar(s);

describe("EffectPicker — quantity-bearing macros (M-3)", () => {
  it("adds BATCH with a chosen queue and a typed quantity, clamped to >= 2", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "BATCH" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["BATCH(Triage Queue, 7)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("clamps an invalid BATCH quantity up to the engine's minimum of 2", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "BATCH" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["BATCH(Triage Queue, 2)"]);
  });

  it("adds SPLIT deriving the entity type from the chosen queue", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "SPLIT" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["SPLIT(Customer, 3, Triage Queue)"]);
  });

  it("adds DRAIN with a chosen container and a typed amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "DRAIN" }));
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression (e.g. Entity.units * 2)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["DRAIN(Fuel, 25)"]);
  });

  it("adds FILL with a chosen container and a typed amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "FILL" }));
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression (e.g. Entity.units * 2)"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["FILL(Fuel, 6)"]);
  });

  it("does not add DRAIN/FILL for a zero or negative amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "DRAIN" }));
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression (e.g. Entity.units * 2)"), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EffectPicker — expression-capable amounts (Sprint 94, audit gaps 4/5)", () => {
  it("BATCH attribute mode emits an Entity reference instead of a literal", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "BATCH" }));
    fireEvent.click(screen.getByRole("button", { name: "from attribute" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["BATCH(Triage Queue, Entity.batchSize)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("FILL accepts an expression amount", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "FILL" }));
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression (e.g. Entity.units * 2)"), { target: { value: "Entity.units * 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["FILL(Fuel, Entity.units * 2)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("DRAIN rejects a malformed expression", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "DRAIN" }));
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression (e.g. Entity.units * 2)"), { target: { value: "foo(" } });

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("EffectPicker — ASSIGN composer (Sprint 94, audit gaps 1/2/3)", () => {
  it("adds a plain ASSIGN with the default queue and server", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["ASSIGN(Triage Queue, Nurse)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("pools any idle server type with no skill (gap 3)", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
    fireEvent.change(screen.getByDisplayValue("Nurse"), { target: { value: "ANY" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["ASSIGN(Triage Queue, ANY)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds a literal-skill ASSIGN", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
    // Two "— none —" selects render (skill, container) — the skill one is first in the DOM.
    fireEvent.change(screen.getAllByDisplayValue("— none —")[0], { target: { value: "lit:Triage" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(['ASSIGN(Triage Queue, Nurse, "Triage")']);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds an entity-attribute-skill ASSIGN", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
    fireEvent.change(screen.getAllByDisplayValue("— none —")[0], { target: { value: "attr:specialty" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["ASSIGN(Triage Queue, Nurse, Entity.specialty)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds a container-gated ASSIGN with an expression amount (gap 1)", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
    // Index 1: the skill select (index 0) stays unset, so this is the container select.
    fireEvent.change(screen.getAllByDisplayValue("— none —")[1], { target: { value: "Fuel" } });
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression"), { target: { value: "Entity.units" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["ASSIGN(Triage Queue, Nurse, Fuel:Entity.units)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("combines a skill and a container gate on one ASSIGN (gap 2)", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "ASSIGN (any server, skill + container)" }));
    // Setting the skill first collapses the ambiguity — only the container
    // select still reads "— none —" afterward.
    fireEvent.change(screen.getAllByDisplayValue("— none —")[0], { target: { value: "lit:Triage" } });
    fireEvent.change(screen.getByDisplayValue("— none —"), { target: { value: "Fuel" } });
    fireEvent.change(screen.getByPlaceholderText("amount — number or expression"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(['ASSIGN(Triage Queue, Nurse, "Triage", Fuel:2)']);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("does not offer ASSIGN with no server types in context", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()}
      expressionContext={{ ...fullCtx, serverTypes: [] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    expect(screen.queryByRole("button", { name: /^ASSIGN/ })).not.toBeInTheDocument();
  });
});

describe("EffectPicker — COSEIZE composer v2 (Sprint 94, audit gap 6)", () => {
  it("adds COSEIZE with the default two server types (regression)", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["COSEIZE(Triage Queue, Nurse, Doctor)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds a third server type via '+ add server type', with a per-type skill", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.click(screen.getByRole("button", { name: "＋ add server type" }));
    // Row 1 (Nurse) gets its skill set to "Triage"; the newly added row defaults to Porter.
    // All three rows still read "— no skill —" until changed — row 1 is first in the DOM.
    fireEvent.change(screen.getAllByDisplayValue("— no skill —")[0], { target: { value: "Triage" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["COSEIZE(Triage Queue, Nurse[Triage], Doctor, Porter)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("disables Add when two rows share the same server type", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.change(screen.getByDisplayValue("Doctor"), { target: { value: "Nurse" } });

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  // Sprint 95 — COSEIZE Type:N quantity syntax
  it("raising row 1's quantity emits Type:N", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.change(screen.getByLabelText("Quantity for server type row 1"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["COSEIZE(Triage Queue, Nurse:2, Doctor)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("combines a per-row skill and quantity: Nurse[Triage]:2", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.change(screen.getAllByDisplayValue("— no skill —")[0], { target: { value: "Triage" } });
    fireEvent.change(screen.getByLabelText("Quantity for server type row 1"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["COSEIZE(Triage Queue, Nurse[Triage]:2, Doctor)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("disables Add when a row's quantity is zero or empty", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.change(screen.getByLabelText("Quantity for server type row 1"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Quantity for server type row 1"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("disables Add when a row's quantity is non-numeric", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));
    fireEvent.change(screen.getByLabelText("Quantity for server type row 1"), { target: { value: "abc" } });

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("cannot remove a row below the two-row minimum", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "COSEIZE (N server types)" }));

    expect(screen.queryByRole("button", { name: /Remove server type row/ })).not.toBeInTheDocument();
  });

  it("does not offer COSEIZE with fewer than 2 server types", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()}
      expressionContext={{ ...oneQueueCtx, serverTypes: ["Nurse"] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    expect(screen.queryByRole("button", { name: /COSEIZE/ })).not.toBeInTheDocument();
  });
});

describe("EffectPicker — MATCH composer with optional predicate (Sprint 94, audit gap 7)", () => {
  it("emits the plain 5-arg form when the predicate is left empty", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "MATCH (compatible pair)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["MATCH(Customer, Triage Queue, Customer, Ward Queue, Triage Queue)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("keeps the quoted 6-arg form when a predicate is given (regression)", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "MATCH (compatible pair)" }));
    fireEvent.change(screen.getByPlaceholderText("optional — e.g. Entity.bloodType == Other.bloodType"),
      { target: { value: "Entity.bloodType == Other.bloodType" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(['MATCH(Customer, Triage Queue, Customer, Ward Queue, Triage Queue, "Entity.bloodType == Other.bloodType")']);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });
});

describe("EffectPicker — SPLIT clone-type picker (Sprint 94, audit gap 8)", () => {
  it("overrides the queue-derived clone type", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "SPLIT" }));
    fireEvent.change(screen.getByDisplayValue("— same as queue's entity —"), { target: { value: "VIP" } });
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 2)"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["SPLIT(VIP, 3, Triage Queue)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });
});

describe("EffectPicker — FAIL/REPAIR partial-quantity composer (Sprint 96)", () => {
  it("adds FAIL with a chosen server type and quantity", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "FAIL (N servers)" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["FAIL(Nurse, 1)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds REPAIR with a chosen server type and quantity", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "REPAIR (N servers)" }));
    fireEvent.change(screen.getByDisplayValue("Nurse"), { target: { value: "Doctor" } });
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["REPAIR(Doctor, 2)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("disables Add when the quantity is zero or empty", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "FAIL (N servers)" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("disables Add when the quantity is non-numeric", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "REPAIR (N servers)" }));
    fireEvent.change(screen.getByPlaceholderText("quantity (≥ 1)"), { target: { value: "abc" } });

    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("does not offer FAIL/REPAIR composers with no server types in context", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()}
      expressionContext={{ ...fullCtx, bEventServerTypes: [] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    expect(screen.queryByRole("button", { name: /^FAIL/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^REPAIR/ })).not.toBeInTheDocument();
  });
});

describe("EffectPicker — PREEMPT/FINISH victim-selection composer (Sprint 97)", () => {
  it("adds a plain PREEMPT with no criterion, matching the enumerated quick-pick's output", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "PREEMPT (by criterion)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["PREEMPT(Nurse)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds PREEMPT with a PRIORITY(attr) criterion", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "PREEMPT (by criterion)" }));
    fireEvent.change(screen.getByDisplayValue("— first busy server —"), { target: { value: "PRIORITY" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["PREEMPT(Nurse, PRIORITY(batchSize))"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds PREEMPT with a LONGEST criterion", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "PREEMPT (by criterion)" }));
    fireEvent.change(screen.getByDisplayValue("— first busy server —"), { target: { value: "LONGEST" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["PREEMPT(Nurse, LONGEST)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds FINISH with a SHORTEST criterion on a chosen server type", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "FINISH (by criterion)" }));
    fireEvent.change(screen.getByDisplayValue("Nurse"), { target: { value: "Doctor" } });
    fireEvent.change(screen.getByDisplayValue("— first busy server —"), { target: { value: "SHORTEST" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["FINISH(Doctor, SHORTEST)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("disables Add when the criterion is PRIORITY but no numeric attribute exists in context", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()}
      expressionContext={{ ...fullCtx, numericAttrs: [] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "PREEMPT (by criterion)" }));

    // With no numeric attrs, the "by priority attribute" option isn't offered at all.
    expect(screen.queryByRole("option", { name: "by priority attribute" })).not.toBeInTheDocument();
  });

  it("does not offer PREEMPT/FINISH composers with no server types in context", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()}
      expressionContext={{ ...fullCtx, bEventServerTypes: [], serverTypes: [] }} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    expect(screen.queryByRole("button", { name: /^PREEMPT/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^FINISH/ })).not.toBeInTheDocument();
  });
});

describe("EffectPicker — type-ahead search (M-2)", () => {
  const manyOptions = [
    { label: "— select effect —", value: "" },
    { label: "── Service ──", value: "", disabled: true },
    { label: "Start service with Nurse and Customer from Triage Queue", value: "ASSIGN(Triage Queue, Nurse)" },
    { label: "Start service with Doctor and Customer from Triage Queue", value: "ASSIGN(Triage Queue, Doctor)" },
    { label: "── Cost ──", value: "", disabled: true },
    { label: "COST(1) — flat rate", value: "COST(1)" },
  ];

  it("filters the flat select to only matching options", () => {
    render(<EffectPicker effects={[]} options={manyOptions} onChange={vi.fn()} expressionContext={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.change(screen.getByPlaceholderText("Search effects…"), { target: { value: "doctor" } });

    expect(screen.getByRole("option", { name: /Start service with Doctor/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Start service with Nurse/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "COST(1) — flat rate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "── Cost ──" })).not.toBeInTheDocument();
  });

  it("drops a header entirely once none of its options match", () => {
    render(<EffectPicker effects={[]} options={manyOptions} onChange={vi.fn()} expressionContext={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.change(screen.getByPlaceholderText("Search effects…"), { target: { value: "cost" } });

    expect(screen.getByRole("option", { name: "COST(1) — flat rate" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "── Cost ──" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "── Service ──" })).not.toBeInTheDocument();
  });

  it("keeps a header visible when at least one of its options still matches", () => {
    render(<EffectPicker effects={[]} options={manyOptions} onChange={vi.fn()} expressionContext={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.change(screen.getByPlaceholderText("Search effects…"), { target: { value: "nurse" } });

    expect(screen.getByRole("option", { name: "── Service ──" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Start service with Nurse/ })).toBeInTheDocument();
  });
});

describe("EffectPicker option generators — combinatorial caps (F-8)", () => {
  it("caps MATCH enumeration above the option threshold, leaving only the composer path", () => {
    // 6 queues -> 6*5/2*6 = 90 MATCH combinations, over the 50-option cap.
    const queues = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, name: `Queue ${i}` }));
    const opts = assignOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], [], queues);
    expect(opts.some(o => /^MATCH\(/.test(o.value))).toBe(false);
  });

  it("still enumerates MATCH combinations under the option threshold", () => {
    // 2 queues -> 2*1/2*2 = 2 combinations, well under the cap.
    const queues = [{ id: "q0", name: "Queue A" }, { id: "q1", name: "Queue B" }];
    const opts = assignOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], [], queues);
    expect(opts.some(o => /^MATCH\(/.test(o.value))).toBe(true);
  });

  it("caps COSEIZE enumeration above the option threshold, leaving only the composer path", () => {
    // 6 servers -> C(6,2) = 15 pairs (no skills) per queue; 6 queues -> 90
    // combinations total, over the 50-option cap.
    const queues = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, name: `Queue ${i}` }));
    const servers = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `Server ${i}`, role: "server", attrDefs: [] }));
    const opts = assignOptions(servers, [], queues);
    expect(opts.some(o => /^COSEIZE\(/.test(o.value))).toBe(false);
  });

  it("no longer enumerates BATCH/DRAIN/SPLIT/FILL at fixed sizes (M-3)", () => {
    const queues = [{ id: "q0", name: "Queue A" }];
    const containerTypes = [{ id: "Fuel" }];
    const assignOpts = assignOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], [], queues, "", containerTypes);
    expect(assignOpts.some(o => /^BATCH\(/.test(o.value))).toBe(false);
    expect(assignOpts.some(o => /^DRAIN\(/.test(o.value))).toBe(false);

    const bOpts = bEffectOptions([{ id: "cust", name: "Customer", role: "customer", attrDefs: [] }], queues, [], containerTypes);
    expect(bOpts.some(o => /^SPLIT\(/.test(o.value))).toBe(false);
    expect(bOpts.some(o => /^FILL\(/.test(o.value))).toBe(false);
  });
});

describe("EffectPicker option generators — engine round-trip (Sprint 94 regression guard)", () => {
  // Pins the whole enumerated-option surface to the engine's own grammar: every
  // non-header, non-blank option value that either generator can produce must
  // be parseable by some MACROS[].pattern, or be a scalar effect applyScalar
  // understands. This is the guard the audit found missing — without it, a UI
  // composer could silently emit a string the engine rejects at run time.
  const entityTypes = [
    { id: "cust", name: "Customer", role: "customer", attrDefs: [
      { name: "priority", valueType: "number", mutable: true },
      { name: "specialty", valueType: "string", mutable: true },
    ] },
    { id: "vip", name: "VIP", role: "customer", attrDefs: [] },
    { id: "nurse", name: "Nurse", role: "server", skills: ["Triage"] },
    { id: "doctor", name: "Doctor", role: "server", skills: ["Surgery"] },
  ];
  const queues = [
    { name: "Triage Queue", customerType: "Customer" },
    { name: "Ward Queue", customerType: "Customer" },
  ];
  const stateVariables = [{ name: "load" }];
  const containerTypes = [{ id: "Fuel" }];
  const skills = ["Triage", "Surgery"];

  it("every assignOptions (C-event) option value matches the engine grammar", () => {
    const opts = assignOptions(entityTypes, stateVariables, queues, "Service", containerTypes, null, skills);
    const values = opts.filter(o => o.value && !o.disabled).map(o => o.value);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(matchesEngine(v)).toBe(true);
  });

  it("every bEffectOptions (B-event) option value matches the engine grammar", () => {
    const opts = bEffectOptions(entityTypes, queues, stateVariables, containerTypes);
    const values = opts.filter(o => o.value && !o.disabled).map(o => o.value);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(matchesEngine(v)).toBe(true);
  });
});

describe("EffectPicker — JOIN fork/join composer (Sprint 98)", () => {
  it("adds JOIN with the default rendezvous queue and a distinct default target", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "JOIN (fork/join)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["JOIN(Triage Queue, Ward Queue)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("adds JOIN with a re-chosen rendezvous queue, keeping the two arguments distinct", () => {
    const onChange = vi.fn();
    const threeQueueCtx = {
      ...fullCtx,
      matchQueues: [
        { name: "Triage Queue", type: "Customer" },
        { name: "Sync Queue", type: "Customer" },
        { name: "Ward Queue", type: "Customer" },
      ],
    };
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={threeQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "JOIN (fork/join)" }));
    // Defaults committed on click: rendezvous "Triage Queue", target "Sync Queue".
    fireEvent.change(screen.getByDisplayValue("Sync Queue"), { target: { value: "Ward Queue" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).toHaveBeenCalledWith(["JOIN(Triage Queue, Ward Queue)"]);
    expect(matchesEngine(onChange.mock.calls[0][0][0])).toBe(true);
  });

  it("disables Add when the rendezvous and target queues are the same", () => {
    const onChange = vi.fn();
    render(<EffectPicker effects={[]} options={[]} onChange={onChange} expressionContext={fullCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    fireEvent.click(screen.getByRole("button", { name: "JOIN (fork/join)" }));
    // Move the rendezvous onto the committed target ("Ward Queue"): the two
    // args now collide, and Add must refuse to emit JOIN(Q, Q).
    fireEvent.change(screen.getByDisplayValue("Triage Queue"), { target: { value: "Ward Queue" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not offer the JOIN composer with fewer than two queues in context", () => {
    render(<EffectPicker effects={[]} options={[]} onChange={vi.fn()} expressionContext={oneQueueCtx} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add Effect" }));
    expect(screen.queryByRole("button", { name: /^JOIN/ })).not.toBeInTheDocument();
  });
});
