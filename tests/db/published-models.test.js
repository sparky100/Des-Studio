// db/published.js — the publish flow (ADR-022, ADR-025).
//
// Two things are tested here, and they matter equally:
//
//   1. The WRAPPERS call the right thing — the right table for owner-side
//      operations, the SECURITY DEFINER functions for the public side.
//
//   2. The MIGRATION's source carries the security properties it must carry.
//      The migration is the security boundary: it is what stops a published
//      model being enumerable, and what stops a draft being read. A unit
//      test cannot run Postgres, so the properties are asserted against the
//      migration's source — the same approach the repo already uses for the
//      separately-deployed import-model edge function
//      (tests/db/model-json-fields.test.js).
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../../src/db/supabase.js";
import { MODEL_JSON_FIELDS } from "../../src/model/modelJsonFields.js";
import {
  PUBLISH_STATUS,
  deletePublishedModel,
  escapeLikePattern,
  fetchPublishedModel,
  fetchPublishedModelList,
  getPublishedSettings,
  licenceLabel,
  listPublishedModelsForOwner,
  normalizePublished,
  publishModel,
  savePublishedSettings,
  unpublishPublishedModel,
  withdrawPublishedModel,
} from "../../src/db/published.js";

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20261021100000_published_models.sql", import.meta.url),
  "utf8"
);

const row = (over = {}) => ({
  id: "pm1",
  model_id: "m1",
  owner_id: "u1",
  title: "A&E model",
  summary: "24-hour A&E",
  description: "",
  category: "healthcare",
  licence: "cc-by-4.0",
  cover_image_url: null,
  released_version_id: "v1",
  release_notes: "First release",
  show_evidence_register: true,
  exposed_params: [{ path: "entityTypes.et1.count" }],
  status: "draft",
  published_at: null,
  ...over,
});

describe("normalizePublished", () => {
  it("maps a row to the UI shape", () => {
    const p = normalizePublished(row());
    expect(p).toMatchObject({
      modelId: "m1",
      ownerId: "u1",
      title: "A&E model",
      category: "healthcare",
      licence: "cc-by-4.0",
      releasedVersionId: "v1",
      showEvidenceRegister: true,
      status: PUBLISH_STATUS.DRAFT,
    });
    expect(p.exposedParams).toEqual([{ path: "entityTypes.et1.count" }]);
  });

  it("returns null for no row", () => {
    expect(normalizePublished(null)).toBeNull();
  });

  it("defaults the evidence-register flag to on", () => {
    expect(normalizePublished(row({ show_evidence_register: false })).showEvidenceRegister).toBe(false);
  });
});

describe("the owner side", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reads the owner's own row for a model", async () => {
    supabase.from("published_models").maybeSingle.mockResolvedValueOnce({ data: row(), error: null });
    const p = await getPublishedSettings("m1");
    expect(supabase.from("published_models").select).toHaveBeenCalled();
    expect(supabase.from("published_models").eq).toHaveBeenCalledWith("model_id", "m1");
    expect(p.title).toBe("A&E model");
  });

  it("upserts on model_id, so a model has exactly one published row", async () => {
    supabase.from("published_models").single.mockResolvedValueOnce({ data: row(), error: null });
    await savePublishedSettings("m1", "u1", { title: "A&E model", category: "healthcare" });
    expect(supabase.from("published_models").upsert).toHaveBeenCalled();
    const [payload, opts] = supabase.from("published_models").upsert.mock.calls[0];
    expect(opts).toMatchObject({ onConflict: "model_id" });
    expect(payload).toMatchObject({ model_id: "m1", owner_id: "u1", title: "A&E model" });
  });

  it("refuses to save a published row with no title", async () => {
    await expect(savePublishedSettings("m1", "u1", { title: "   " })).rejects.toThrow(/title/i);
    expect(supabase.from("published_models").upsert).not.toHaveBeenCalled();
  });

  it("explains that a publish record is needed before publishing", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(publishModel("m1", "u1")).rejects.toThrow(/no publish record/i);
  });

  it("publishes by setting the status and stamping the time", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: row({ status: "published", published_at: "2026-10-28T18:00:00Z" }), error: null });
    const published = await publishModel("m1", "u1");
    expect(published.status).toBe("published");
    expect(published.publishedAt).toBe("2026-10-28T18:00:00Z");
    expect(supabase.rpc).toHaveBeenCalledWith("publish_model", { p_model_id: "m1" });
    expect(supabase.from("published_models").update).not.toHaveBeenCalled();
  });

  it("withdraws by clearing the status and the published time", async () => {
    supabase.from("published_models").single.mockResolvedValueOnce({ data: row({ status: "withdrawn" }), error: null });
    await withdrawPublishedModel("m1", "u1");
    const payload = supabase.from("published_models").update.mock.calls[0][0];
    expect(payload.status).toBe("withdrawn");
    expect(payload.published_at).toBeNull();
  });

  it("unpublishes back to a draft, keeping the settings", async () => {
    supabase.from("published_models").single.mockResolvedValueOnce({ data: row(), error: null });
    await unpublishPublishedModel("m1", "u1");
    expect(supabase.from("published_models").update.mock.calls[0][0].status).toBe("draft");
  });

  it("deletes the row, scoped to the owner", async () => {
    await deletePublishedModel("m1", "u1");
    expect(supabase.from("published_models").delete).toHaveBeenCalled();
    expect(supabase.from("published_models").eq).toHaveBeenCalledWith("owner_id", "u1");
  });

  it("lists the owner's own published models", async () => {
    supabase.from("published_models").order.mockResolvedValueOnce({ data: [row()], error: null });
    const list = await listPublishedModelsForOwner("u1");
    expect(supabase.from("published_models").eq).toHaveBeenCalledWith("owner_id", "u1");
    expect(list).toHaveLength(1);
  });
});

describe("the public side", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reads a published model through the SECURITY DEFINER function, not the table", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: { title: "A&E model" }, error: null });
    const p = await fetchPublishedModel("m1");
    expect(supabase.rpc).toHaveBeenCalledWith("get_published_model", { p_model_id: "m1" });
    expect(supabase.from).not.toHaveBeenCalledWith("published_models");
    expect(p.title).toBe("A&E model");
  });

  it("returns null when there is no published model", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchPublishedModel("m1")).toBeNull();
  });

  it("lists the gallery through the function", async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ model_id: "m1", title: "A&E model", summary: "s", category: "healthcare", licence: "mit", cover_image_url: null, published_at: "2026-10-21" }],
      error: null,
    });
    const list = await fetchPublishedModelList({ category: "healthcare", search: "A&E", limit: 20 });
    expect(supabase.rpc).toHaveBeenCalledWith("list_published_models", {
      p_category: "healthcare", p_search: "A&E", p_limit: 20,
    });
    expect(list[0]).toMatchObject({ modelId: "m1", title: "A&E model" });
  });
});

// ── The migration's security properties ──────────────────────────────────────
//
// The migration IS the security boundary. These assertions fail if someone
// widens a policy or drops a filter.

describe("the published_models migration", () => {
  it("creates the table with the fields the publish flow needs", () => {
    expect(MIGRATION).toMatch(/create table if not exists public\.published_models/i);
    for (const column of [
      "model_id", "owner_id", "title", "summary", "description", "category",
      "licence", "cover_image_url", "released_version_id", "release_notes",
      "show_evidence_register", "exposed_params", "status", "published_at",
    ]) {
      expect(MIGRATION, column).toMatch(new RegExp(`\\b${column}\\b`, "i"));
    }
  });

  it("allows one published row per model", () => {
    expect(MIGRATION).toMatch(/unique\s*\(model_id\)/i);
  });

  it("constrains the status to draft, published or withdrawn", () => {
    expect(MIGRATION).toMatch(/status\s+text\s+not null\s+default 'draft'/i);
    expect(MIGRATION).toMatch(/check\s*\(status in \('draft',\s*'published',\s*'withdrawn'\)\)/i);
  });

  it("grants NO select policy to anon or authenticated", () => {
    // The table's only policy is the owner's. A `for select` policy naming
    // anon or authenticated would make the table enumerable.
    const policies = MIGRATION.match(/create policy[^;]+;/gi) || [];
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy.toLowerCase()).not.toMatch(/\banon\b/);
      expect(policy.toLowerCase()).not.toMatch(/\bauthenticated\b/);
      expect(policy.toLowerCase()).not.toMatch(/for\s+select/i);
    }
  });

  it("keys the owner policy on the model's owner_id, not on collaborator roles", () => {
    expect(MIGRATION).toMatch(/m\.owner_id\s*=\s*auth\.uid\(\)/i);
    // The collaborator `access` map must not appear in the published policy.
    const policy = (MIGRATION.match(/create policy[\s\S]*?;/i) || [""])[0];
    expect(policy).not.toMatch(/\baccess\b/i);
  });

  it("makes both public functions SECURITY DEFINER and grants them to anon", () => {
    expect(MIGRATION).toMatch(/function public\.get_published_model[\s\S]*?security definer/i);
    expect(MIGRATION).toMatch(/function public\.list_published_models[\s\S]*?security definer/i);
    expect(MIGRATION).toMatch(/grant execute on function public\.get_published_model\(uuid\) to anon/i);
    expect(MIGRATION).toMatch(/grant execute on function public\.list_published_models\(text, text, int\) to anon/i);
  });

  it("revokes the default PUBLIC execute on the public functions", () => {
    expect(MIGRATION).toMatch(/revoke all on function public\.get_published_model\(uuid\) from public/i);
    expect(MIGRATION).toMatch(/revoke all on function public\.list_published_models\(text, text, int\) from public/i);
  });

  it("returns nothing for a model that is not published", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    expect(fn).toMatch(/status\s*=\s*'published'/i);
    expect(fn).toMatch(/if not found then\s+return null/i);
  });

  it("serves the pinned release's snapshot, not the live model", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    expect(fn).toMatch(/from public\.model_versions v[\s\S]*?released_version_id/i);
  });

  it("gates the registers on the owner's show_evidence_register choice", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    expect(fn).toMatch(/case when pub\.show_evidence_register\s+then/i);
  });

  it("lists only published models in the gallery", () => {
    const fn = (MIGRATION.match(/function public\.list_published_models[\s\S]*?\$\$;/i) || [""])[0];
    expect(fn).toMatch(/where p\.status\s*=\s*'published'/i);
  });

  // ── The payload must not leak the owner's row metadata ──────────────────────
  //
  // A version snapshot stores the WHOLE in-memory model, which carries the
  // row's metadata as well as the model: the collaborator access map (user
  // ids and their roles), the owner id, the internal notes, the Business-view
  // curation, the tags. The public payload is therefore built from a
  // WHITELIST of the model's own fields — subtracting a list of known
  // private fields is exactly how those leak, because a metadata field added
  // later is exposed by default.

  it("builds the public model from a whitelist, not by subtracting private fields", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    const build = (fn.match(/v_model\s*:=\s*jsonb_build_object\([\s\S]*?\);/) || [""])[0];
    expect(build).toBeTruthy();
    // No subtraction of private fields — the whitelist is the whole mechanism.
    expect(build).not.toMatch(/-\s*'notes'/);
    expect(build).not.toMatch(/-\s*'access'/);
  });

  it("whitelists every model_json field, and nothing else", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    const build = (fn.match(/v_model\s*:=\s*jsonb_build_object\([\s\S]*?\);/) || [""])[0];
    const whitelisted = new Set(
      [...build.matchAll(/'([A-Za-z]+)'\s*,\s*src->/g)].map(m => m[1])
    );

    // Every model_json field is either whitelisted, or deliberately withheld.
    const WITHHELD = new Set([
      // Private to the owner.
      "notes", "exposedParams",
      // The registers — served through the gated `registers` key instead, so
      // the owner's "keep the provenance private" choice is honoured in the
      // model payload too.
      "evidence", "assumptions", "backingLinks", "backingLinkSettings",
    ]);

    for (const field of MODEL_JSON_FIELDS) {
      if (WITHHELD.has(field)) continue;
      expect(whitelisted.has(field), `model_json field '${field}' is not in the public whitelist`).toBe(true);
    }

    // And the whitelist holds no field that is not a model_json field — a
    // stray name would be a field nobody reviewed.
    for (const field of whitelisted) {
      const known = MODEL_JSON_FIELDS.includes(field) || field === "schemaVersion";
      expect(known, `'${field}' is not a model_json field`).toBe(true);
    }
  });

  it("never exposes the collaborator access map or the owner id", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    // 'access' and 'owner_id' are the two metadata fields that would leak
    // other people's identities.
    expect(fn).not.toMatch(/'access'\s*,\s*src->/);
    expect(fn).not.toMatch(/'owner_id'\s*,\s*src->/);
    // The owner's id is exposed as a display name only.
    expect(fn).toMatch(/v_author\s*:=\s*\(select p\.full_name from public\.profiles p where p\.id = pub\.owner_id\)/i);
  });

  // ── The named schedules must travel with the payload ───────────────────────
  //
  // A B-event's `scheduleRef` points at a row in `model_schedules` (ADR-016).
  // The engine resolves that reference through the schedules map it is given;
  // if the map has no entry, resolveInlineSchedules() leaves the entry
  // unresolved and the engine pushes the event to t=1e9 — the published model
  // would run with NO scheduled arrivals, silently.

  it("carries the named schedules in the payload", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    expect(fn).toMatch(/'schedules',\s*v_schedules/i);
    expect(fn).toMatch(/from public\.model_schedules s/i);
    // The rows, not just the ids.
    expect(fn).toMatch(/'scheduleJson',\s*s\.schedule_json/i);
    // And the default flag, so the published run picks the same schedule the
    // owner's own run picks.
    expect(fn).toMatch(/'isDefault',\s*s\.is_default/i);
  });

  it("serves the release's schedule snapshot, not the live timetable", () => {
    const fn = (MIGRATION.match(/function public\.get_published_model[\s\S]*?\$\$;/i) || [""])[0];
    expect(fn).toMatch(/nullif\(pub\.released_schedules,\s*'\[\]'::jsonb\)/i);
    // The snapshot column exists.
    expect(MIGRATION).toMatch(/released_schedules\s+jsonb\s+not null default '\[\]'::jsonb/i);
  });
});

describe("the gallery search", () => {
  it("escapes ILIKE wildcards so a search means the text it contains", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("plain text")).toBe("plain text");
  });

  it("sends the escaped search to the listing function", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    await fetchPublishedModelList({ search: "100%_done" });
    expect(supabase.rpc).toHaveBeenCalledWith("list_published_models", expect.objectContaining({ p_search: "100\\%\\_done" }));
  });

  it("sends no search when there is none", async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    await fetchPublishedModelList({});
    expect(supabase.rpc).toHaveBeenCalledWith("list_published_models", expect.objectContaining({ p_search: null }));
  });
});

describe("licenceLabel", () => {
  it("never shows a slug for a known licence", () => {
    expect(licenceLabel("cc-by-sa-4.0")).toBe("Creative Commons Attribution-ShareAlike 4.0");
    expect(licenceLabel("mit")).toBe("MIT licence");
    expect(licenceLabel("all-rights-reserved")).toBe("All rights reserved");
  });

  it("falls back to the stored text for an unknown licence and to all rights reserved for none", () => {
    expect(licenceLabel("custom-terms")).toBe("custom-terms");
    expect(licenceLabel(null)).toBe("All rights reserved");
  });
});
