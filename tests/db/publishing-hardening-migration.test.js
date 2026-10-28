// tests/db/publishing-hardening-migration.test.js — the security properties of
// 20261028200000_publishing_hardening.sql, asserted against its source (the
// same approach published-models.test.js takes). The behaviour itself — what
// anon, another user and the owner can read and write — was exercised against
// a real Postgres when the migration was written; these fail if a later edit
// widens a policy or drops a guard.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  new URL("../../supabase/migrations/20261028200000_publishing_hardening.sql", import.meta.url),
  "utf8",
);
// Comments aside: the assertions below are about statements, not prose.
const CODE = SQL.replace(/--.*$/gm, "");
const policies = CODE.match(/create policy[\s\S]*?;/gi) || [];

describe("share links stop being readable by everyone", () => {
  it("drops the public read policy on share_links", () => {
    expect(CODE).toMatch(/drop policy if exists "Anyone can read active share links" on public\.share_links/i);
  });

  it("replaces the share_links select policy with a creator-only one for signed-in users", () => {
    const policy = policies.find(p => /on public\.share_links/i.test(p));
    expect(policy).toBeTruthy();
    expect(policy).toMatch(/for select/i);
    expect(policy).toMatch(/to authenticated/i);
    expect(policy).toMatch(/created_by\s*=\s*\(select auth\.uid\(\)\)/i);
  });

  it("creates no policy for anon or public", () => {
    for (const policy of policies) {
      expect(policy, policy).not.toMatch(/\bto\s+(anon|public)\b/i);
    }
  });

  it("no longer lets a share link open a model or a run", () => {
    for (const policy of policies) {
      expect(policy, policy).not.toMatch(/model_has_active_share|run_has_active_share/i);
    }
  });

  it("keeps what a signed-in user could already see: own, public and shared-with-you", () => {
    const models = policies.find(p => /on public\.des_models/i.test(p)) || "";
    expect(models).toMatch(/owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
    expect(models).toMatch(/visibility\s*=\s*'public'/i);
    expect(models).toMatch(/access \? /i);
    const runs = policies.find(p => /on public\.simulation_runs/i.test(p)) || "";
    expect(runs).toMatch(/run_by\s*=\s*\(select auth\.uid\(\)\)/i);
  });
});

describe("get_shared_dashboard", () => {
  it("is SECURITY DEFINER with a pinned search_path", () => {
    const fn = CODE.match(/create or replace function public\.get_shared_dashboard[\s\S]*?\$\$;/i)?.[0] || "";
    expect(fn).toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path = public/i);
  });

  it("is callable by anon and signed-in visitors only through an explicit grant", () => {
    expect(CODE).toMatch(/revoke all on function public\.get_shared_dashboard\(text\) from public/i);
    expect(CODE).toMatch(/grant execute on function public\.get_shared_dashboard\(text\) to anon, authenticated/i);
  });

  it("answers a revoked or expired link, and returns nothing for an unknown token", () => {
    expect(CODE).toMatch(/'status',\s*'revoked'/i);
    expect(CODE).toMatch(/'status',\s*'expired'/i);
    expect(CODE).toMatch(/return null/i);
  });

  it("does not return the collaborator access map or notes", () => {
    const fn = CODE.match(/create or replace function public\.get_shared_dashboard[\s\S]*?\$\$;/i)?.[0] || "";
    expect(fn).not.toMatch(/'access'/i);
    expect(fn).not.toMatch(/\bnotes\b/i);
    expect(fn).not.toMatch(/owner_id/i);
  });
});

describe("published_models write guard", () => {
  const guard = CODE.match(/create or replace function public\.guard_published_models_writes[\s\S]*?\$\$;/i)?.[0] || "";

  it("runs before every insert and update", () => {
    expect(CODE).toMatch(/before insert or update on public\.published_models/i);
  });

  it("steps aside for SECURITY DEFINER functions and the service role", () => {
    expect(guard).toMatch(/current_user not in \('authenticated', 'anon'\)/i);
  });

  it("takes the author from the session, not the client", () => {
    expect(guard).toMatch(/new\.owner_id := auth\.uid\(\)/i);
  });

  it("forces a new row to be a draft with no payload", () => {
    expect(guard).toMatch(/new\.status := 'draft'/i);
    expect(guard).toMatch(/new\.public_payload := null/i);
  });

  it("keeps the payload and the schedules snapshot as they were on update", () => {
    expect(guard).toMatch(/new\.public_payload := old\.public_payload/i);
    expect(guard).toMatch(/new\.released_schedules := old\.released_schedules/i);
  });

  it("refuses to publish by changing the status", () => {
    expect(guard).toMatch(/new\.status = 'published'/i);
    expect(guard).toMatch(/raise exception/i);
  });
});
