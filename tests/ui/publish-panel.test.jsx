// The Publish panel (ADR-022).
//
// The panel is the owner's act of publishing. What matters is that it says
// what publishing costs BEFORE the button, that it refuses to publish a
// broken model, and that it pins a release.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The mock factories are hoisted above the module imports, so the mock
// functions have to be hoisted with them.
const publish = vi.hoisted(() => ({
  getPublishedSettings: vi.fn(),
  savePublishedSettings: vi.fn(),
  publishModel: vi.fn(),
  withdrawPublishedModel: vi.fn(),
  unpublishPublishedModel: vi.fn(),
  deletePublishedModel: vi.fn(),
  listPublishedModelsForOwner: vi.fn(),
}));
const versions = vi.hoisted(() => ({
  listVersions: vi.fn(),
  getNextVersion: vi.fn(),
  createVersion: vi.fn(),
}));

vi.mock('../../src/db/published.js', async () => {
  const actual = await vi.importActual('../../src/db/published.js');
  return { ...actual, ...publish };
});
vi.mock('../../src/db/models.js', async () => {
  const actual = await vi.importActual('../../src/db/models.js');
  return { ...actual, ...versions };
});

import { PublishPanel } from '../../src/ui/PublishPanel.jsx';

const model = {
  name: "Clinic",
  entityTypes: [{ id: "et_srv", name: "Consultant", role: "server", count: 3, attrDefs: [] }],
  stateVariables: [],
  queues: [{ id: "q1", name: "Waiting Room", customerType: "Patient", discipline: "FIFO" }],
  bEvents: [{ id: "b1", name: "Patient Arrives", effect: ["ARRIVE(Patient, Waiting Room)"], schedules: [] }],
  cEvents: [],
  containerTypes: [],
  distances: [],
  dataSources: [],
  goals: [],
  evidence: [{ id: "ev1" }],
  assumptions: [],
  backingLinks: [],
};

const noErrors = { errors: [], warnings: [] };

beforeEach(() => {
  vi.clearAllMocks();
  publish.getPublishedSettings.mockResolvedValue(null);
  publish.listPublishedModelsForOwner.mockResolvedValue([]);
  versions.listVersions.mockResolvedValue([]);
  versions.getNextVersion.mockResolvedValue(1);
  versions.createVersion.mockResolvedValue({ id: "v1", version: 1, name: "Published release v1" });
  publish.savePublishedSettings.mockImplementation(async (id, uid, s) => ({
    id: "pm1", modelId: id, ownerId: uid, status: "draft", exposedParams: [], ...s,
  }));
  publish.publishModel.mockResolvedValue({ id: "pm1", modelId: "m1", status: "published", publishedAt: "2026-10-21" });
});

const renderPanel = (props = {}) =>
  render(<PublishPanel model={model} modelId="m1" userId="u1" validation={noErrors} {...props} />);

describe("PublishPanel", () => {
  it("offers the fields a public page needs", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByLabelText(/published summary/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/published description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/published category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/published licence/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/release notes/i)).toBeInTheDocument();
  });

  it("shows the current publish state", async () => {
    publish.getPublishedSettings.mockResolvedValue({
      id: "pm1", modelId: "m1", title: "A&E", status: "published", publishedAt: "2026-10-21",
      exposedParams: [], showEvidenceRegister: true,
    });
    renderPanel();
    await waitFor(() => expect(screen.getByText("Published")).toBeInTheDocument(), { timeout: 5000 });
  });

  it("states what publishing makes readable before the button is pressed", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/makes this model readable by anyone with the link/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/i understand this model becomes publicly readable/i)).toBeInTheDocument();
  });

  it("will not publish until the disclosure is acknowledged", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.change(screen.getByLabelText(/published title/i), { target: { value: "A&E model" } });
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    expect(publish.publishModel).not.toHaveBeenCalled();
  });

  it("publishes once the disclosure is acknowledged", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.change(screen.getByLabelText(/published title/i), { target: { value: "A&E model" } });
    fireEvent.click(screen.getByLabelText(/i understand this model becomes publicly readable/i));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(publish.publishModel).toHaveBeenCalledWith("m1", "u1"));
  });

  it("blocks publishing while the model has errors", async () => {
    renderPanel({ validation: { errors: [{ code: "V1", message: "bad", tab: "entities" }], warnings: [] } });
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.change(screen.getByLabelText(/published title/i), { target: { value: "A&E model" } });
    fireEvent.click(screen.getByLabelText(/i understand this model becomes publicly readable/i));
    const button = screen.getByRole("button", { name: /^publish$/i });
    expect(button).toBeDisabled();
    expect(screen.getByText(/has 1 error/i)).toBeInTheDocument();
  });

  it("pins a release when publishing, taking a snapshot if none was chosen", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.change(screen.getByLabelText(/published title/i), { target: { value: "A&E model" } });
    fireEvent.click(screen.getByLabelText(/i understand this model becomes publicly readable/i));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(versions.createVersion).toHaveBeenCalled());
    const [, , args] = versions.createVersion.mock.calls[0];
    expect(args.modelJson).toBe(model);
    await waitFor(() => expect(publish.publishModel).toHaveBeenCalled());
    // The pinned version is saved with the publish.
    const saved = publish.savePublishedSettings.mock.calls.at(-1)[2];
    expect(saved.releasedVersionId).toBe("v1");
  });

  it("pins an existing version when the owner chose one", async () => {
    versions.listVersions.mockResolvedValue([{ id: "v7", version: 7, name: "Milestone" }]);
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published release/i)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.change(screen.getByLabelText(/published title/i), { target: { value: "A&E model" } });
    fireEvent.change(screen.getByLabelText(/published release/i), { target: { value: "v7" } });
    fireEvent.click(screen.getByLabelText(/i understand this model becomes publicly readable/i));
    fireEvent.click(screen.getByRole("button", { name: /^publish$/i }));
    await waitFor(() => expect(publish.publishModel).toHaveBeenCalled());
    expect(versions.createVersion).not.toHaveBeenCalled();
    expect(publish.savePublishedSettings.mock.calls.at(-1)[2].releasedVersionId).toBe("v7");
  });

  it("offers to withdraw a published model", async () => {
    publish.getPublishedSettings.mockResolvedValue({
      id: "pm1", modelId: "m1", title: "A&E", status: "published", publishedAt: "2026-10-21",
      exposedParams: [], showEvidenceRegister: true,
    });
    publish.withdrawPublishedModel.mockResolvedValue({ id: "pm1", modelId: "m1", status: "withdrawn" });
    renderPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: /withdraw/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /withdraw/i }));
    await waitFor(() => expect(publish.withdrawPublishedModel).toHaveBeenCalledWith("m1", "u1"));
  });

  it("lets the owner keep the provenance register private", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    const toggle = screen.getByRole("checkbox", { name: /show the evidence and assumption register/i });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it("reports how much of the model is currently evidenced", async () => {
    renderPanel();
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/currently evidenced/i)).toBeInTheDocument();
  });

  it("warns that a visitor cannot reach the model's live data sources", async () => {
    renderPanel({ model: { ...model, dataSources: [{ id: "ds1", label: "Roster feed", type: "rest", url: "https://internal.test/x" }] } });
    await waitFor(() => expect(screen.getByLabelText(/published title/i)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/cannot reach those/i)).toBeInTheDocument();
  });

  it("lists the owner's other published models so a stray publication is visible", async () => {
    publish.listPublishedModelsForOwner.mockResolvedValue([
      { modelId: "m2", title: "A&E model", status: "published" },
      { modelId: "m3", title: "Ward model", status: "draft" },
    ]);
    renderPanel();
    await waitFor(() => expect(screen.getByText("YOUR OTHER PUBLISHED MODELS")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("A&E model")).toBeInTheDocument();
    expect(screen.getByText("Ward model")).toBeInTheDocument();
    // Only a published one can be withdrawn.
    expect(screen.getByRole("button", { name: /withdraw a&e model/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /withdraw ward model/i })).not.toBeInTheDocument();
  });

  it("withdraws a stray published model from the list", async () => {
    publish.listPublishedModelsForOwner.mockResolvedValue([
      { modelId: "m2", title: "A&E model", status: "published" },
    ]);
    publish.withdrawPublishedModel.mockResolvedValue({ modelId: "m2", status: "withdrawn" });
    renderPanel();
    await waitFor(() => expect(screen.getByText("YOUR OTHER PUBLISHED MODELS")).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole("button", { name: /withdraw a&e model/i }));
    await waitFor(() => expect(publish.withdrawPublishedModel).toHaveBeenCalledWith("m2", "u1"));
  });
});
