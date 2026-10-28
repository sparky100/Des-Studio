import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { normalizePublished, publishModel, savePublishedSettings } from "../../src/db/published.js";
import { supabase } from "../../src/db/supabase.js";

const migration = readFileSync(new URL("../../supabase/migrations/20261028180000_published_release_snapshots.sql", import.meta.url), "utf8");

describe("published release snapshots", () => {
  it("round-trips release settings and schedules without publishing a draft", async () => {
    const settings = {
      title: "Supplier", releasedVersionId: "version-1", releaseNotes: "Reviewed",
      exposedParams: [{ path: "entityTypes.staff.count", min: 1, max: 20, businessLabel: "Staff" }],
      showEvidenceRegister: false,
    };
    const schedules = [{ id: "schedule-1", isDefault: true, scheduleJson: [{ eventId: "arrival", rows: [] }] }];
    supabase.from("published_models").single.mockImplementationOnce(async () => ({
      data: { ...supabase.from("published_models").upsert.mock.calls.at(-1)[0], released_schedules: schedules, status: "draft" },
      error: null,
    }));
    const saved = await savePublishedSettings("model-1", "owner-1", settings);
    expect(saved).toMatchObject(settings);
    expect(saved.releasedSchedules).toEqual(schedules);
    expect(saved.status).toBe("draft");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(normalizePublished(null)).toBeNull();
  });

  it("does not report success when the atomic publication fails", async () => {
    supabase.rpc.mockRejectedValueOnce(new Error("Missing timetable"));
    await expect(publishModel("model-1", "owner-1")).rejects.toThrow("Missing timetable");
  });

  it("does not allow a missing caller identity to publish", async () => {
    vi.clearAllMocks();
    await expect(publishModel("model-1", "")).rejects.toThrow(/owner/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("limits the publication function to an authenticated model owner", () => {
    expect(migration).toMatch(/auth\.uid\(\) IS NULL/);
    expect(migration).toMatch(/m\.id = p_model_id AND m\.owner_id = auth\.uid\(\)/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.publish_model\(uuid\) FROM PUBLIC, anon/);
    expect(migration).toMatch(/v\.id = pub\.released_version_id AND v\.model_id = p_model_id/);
  });

  it("serves frozen payloads and captures even an empty timetable set", () => {
    expect(migration).toMatch(/SELECT public_payload FROM public\.published_models/);
    expect(migration).toMatch(/released_schedules = v_schedules/);
    expect(migration).toMatch(/'schedules', v_schedules/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).not.toMatch(/NULLIF\(.*released_schedules/);
    expect(migration).toMatch(/public_payload->>'title'/);
  });

  it("keeps data-source configuration and row metadata out of a new release", () => {
    const whitelist = migration.match(/WHERE key = ANY\(ARRAY\[([\s\S]*?)\]\)/)[1];
    for (const field of ["owner_id", "access", "notes", "dataSources"]) {
      expect(whitelist).not.toContain("'" + field + "'");
    }
    expect(migration).toContain("jsonb_build_object('dataSources', '[]'::jsonb)");
  });
});
