-- Publishing hardening: close the older anonymous read paths and stop owners
-- writing the published page directly.
--
-- Two separate holes, both found reviewing ADR-022 publishing:
--
-- 1. SHARE LINKS. The share_links select policy is `TO public`, so anyone,
--    signed in or not, could list every live share link and with it every
--    live share TOKEN. The des_models and simulation_runs policies also let
--    any signed-in user open a model or run just because it had a live share
--    link (model_has_active_share / run_has_active_share). Published models
--    do not need any of this: they have their own constructed payload
--    (get_published_model).
--
--    The shared-dashboard page is the one consumer, so it gets a function of
--    its own, get_shared_dashboard(token), that returns exactly what the page
--    shows and nothing else, to anonymous and signed-in visitors alike. The
--    table policies then drop the share-link branches.
--
-- 2. OWNER WRITES TO THE PUBLISHED ROW. The owner policy on published_models
--    is FOR ALL, so an owner could write `public_payload`, `status` and
--    `published_at` straight to the table: a page with a fabricated author
--    or content that never went through publish_model(). The owner still
--    saves their settings (title, summary, …) and withdraws or unpublishes
--    directly, so a trigger guards the columns only publish_model() may set.
--    publish_model() is SECURITY DEFINER, so inside it current_user is the
--    function owner, not `authenticated`, and the guard steps aside.

-- ── 1a. The shared dashboard's own read path ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_shared_dashboard(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link public.share_links%ROWTYPE;
  run  public.simulation_runs%ROWTYPE;
  mdl  public.des_models%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO link FROM public.share_links WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- The token is the secret, so telling its holder WHY a link no longer
  -- works leaks nothing.
  IF link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'revoked');
  END IF;
  IF link.expires_at IS NOT NULL AND link.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT * INTO run FROM public.simulation_runs WHERE id = link.run_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO mdl FROM public.des_models WHERE id = run.model_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'link', jsonb_build_object(
      'id', link.id, 'config', link.config, 'created_at', link.created_at
    ),
    'run', jsonb_build_object(
      'id', run.id,
      'model_id', run.model_id,
      'ran_at', run.ran_at,
      'replications', run.replications,
      'seed', run.seed,
      'total_arrived', run.total_arrived,
      'total_served', run.total_served,
      'total_reneged', run.total_reneged,
      'avg_wait_time', run.avg_wait_time,
      'avg_service_time', run.avg_service_time,
      'max_simulation_time', run.max_simulation_time,
      'warmup_period', run.warmup_period,
      'results_json', run.results_json,
      'ai_insights', run.ai_insights,
      'narrative_text', run.narrative_text,
      'model_description_text', run.model_description_text
    ),
    -- to_jsonb(row)->'col' rather than mdl.col: tolerant of an older schema
    -- that predates a column, as the client's runDesModelsSelect is.
    'model', jsonb_build_object(
      'name', mdl.name,
      'entity_types', COALESCE(to_jsonb(mdl)->'entity_types', '[]'::jsonb),
      'queues', COALESCE(to_jsonb(mdl)->'queues', '[]'::jsonb),
      'graph', to_jsonb(mdl)->'model_json'->'graph'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_dashboard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_dashboard(text) TO anon, authenticated;

-- ── 1b. Take the share-link and anonymous grants off the tables ─────────────

-- The repo's migrations and the live database name these policies
-- differently (the live ones were reworked out of band), so every known name
-- is dropped before the replacement is created. Either way the end state is
-- the same.
--
-- des_models / simulation_runs: authenticated only, and a share link no
-- longer opens the row (get_shared_dashboard does the reading). What a
-- signed-in user can see otherwise is unchanged: your own, public models,
-- and models shared with you.
DROP POLICY IF EXISTS "Allow select" ON public.des_models;
DROP POLICY IF EXISTS "models: select own or shared or public" ON public.des_models;
CREATE POLICY "models: select own or shared or public"
  ON public.des_models
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR visibility = 'public'
    OR access ? ((SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS "Allow select" ON public.simulation_runs;
DROP POLICY IF EXISTS "runs: select own runs or visible model runs" ON public.simulation_runs;
CREATE POLICY "runs: select own runs or visible model runs"
  ON public.simulation_runs
  FOR SELECT
  TO authenticated
  USING (
    run_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = simulation_runs.model_id
        AND (
          m.owner_id = (SELECT auth.uid())
          OR m.visibility = 'public'
          OR m.access ? ((SELECT auth.uid())::text)
        )
    )
  );

-- share_links: the person who created a link manages it. The old policy was
-- `TO public`, so anyone — signed in or not — could list every live link and
-- with it every live share TOKEN.
DROP POLICY IF EXISTS "Allow select" ON public.share_links;
DROP POLICY IF EXISTS "Anyone can read active share links" ON public.share_links;
CREATE POLICY "Allow select"
  ON public.share_links
  FOR SELECT
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

-- model_has_active_share() and run_has_active_share() are no longer used by
-- any policy in this repo. They are left in place rather than dropped: a
-- DROP would fail outright if some policy applied outside these migrations
-- still depends on one.

-- ── 2. published_models: columns only publish_model() may set ────────────────

CREATE OR REPLACE FUNCTION public.guard_published_models_writes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- A caller coming in through the API runs as `authenticated` (or `anon`).
  -- publish_model() is SECURITY DEFINER, so it runs as the function owner and
  -- is not subject to this guard; neither is the service role.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- The author is whoever owns the model, not whoever the client says.
  NEW.owner_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'draft';
    NEW.published_at := NULL;
    NEW.public_payload := NULL;
    NEW.released_schedules := '[]'::jsonb;
    RETURN NEW;
  END IF;

  -- UPDATE: settings are the owner's to edit; the published content is not.
  NEW.public_payload := OLD.public_payload;
  NEW.released_schedules := OLD.released_schedules;
  NEW.model_id := OLD.model_id;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Withdrawing and returning to draft are the owner's; going live is
    -- publish_model()'s, because it is what builds the payload.
    IF NEW.status = 'published' THEN
      RAISE EXCEPTION 'A model is published by publish_model(), not by changing its status'
        USING ERRCODE = '42501';
    END IF;
    NEW.published_at := NULL;
  ELSE
    NEW.published_at := OLD.published_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_published_models_guard ON public.published_models;
CREATE TRIGGER trg_published_models_guard
  BEFORE INSERT OR UPDATE ON public.published_models
  FOR EACH ROW EXECUTE FUNCTION public.guard_published_models_writes();
