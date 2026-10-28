-- Sprint 100: Publishing as a first-class act
-- ADR-022 (publishing) + ADR-025 (anonymous public access)
--
-- A published model is a documented, versioned, publicly reachable artefact —
-- a page a stranger can open, read, understand and cite. It is NOT the same
-- act as `des_models.visibility = 'public'`, which only means "listed in the
-- community gallery for signed-in users". An author may reasonably want one
-- without the other, so they are kept apart.
--
-- The security design, and why it is shaped this way:
--
--   * The table has NO select policy for `anon` or `authenticated` — only the
--     owner's. The public read is a single SECURITY DEFINER function granted
--     to `anon`, so nothing can be enumerated: there is no policy permitting a
--     list, and the only public path is a function that filters on
--     status = 'published'.
--
--   * A draft, withdrawn and never-published model all return the SAME empty
--     answer, so the public page cannot tell a stranger that an id exists.
--
--   * The function returns a CONSTRUCTED payload, not the row, so the owner's
--     other settings are not exposed by accident. The payload is built from a
--     WHITELIST of the model's own fields (see below), not by subtracting a
--     list of private ones.
--
--   * The RLS policy keys on the MODEL's owner_id, not on collaborator roles:
--     publishing a model to the world is the owner's call, and an `editor`
--     collaborator does not get to make it.
--
--   * The payload serves the PINNED RELEASE's snapshot, not the live model —
--     so a published release is internally consistent: the parameters shown and
--     the provenance shown describe the same thing.

-- ── The table ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.published_models (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id               uuid        NOT NULL REFERENCES public.des_models(id) ON DELETE CASCADE,
  owner_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The public identity. Deliberately separate from the model's own name:
  -- the owner's working copy and the stranger's copy are different things.
  title                  text        NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  summary                text        NOT NULL DEFAULT '' CHECK (char_length(summary) <= 500),
  description            text        NOT NULL DEFAULT '' CHECK (char_length(description) <= 8000),
  category               text        CHECK (category IS NULL OR category IN (
                           'healthcare', 'logistics', 'manufacturing', 'service',
                           'transport', 'retail', 'education', 'public-sector', 'other')),
  licence                text        NOT NULL DEFAULT 'all-rights-reserved',
  cover_image_url        text,
  -- The pinned release. Its model_json carries the registers with it, so
  -- pinning the release pins the provenance too.
  released_version_id    uuid        REFERENCES public.model_versions(id) ON DELETE SET NULL,
  release_notes          text        NOT NULL DEFAULT '',
  -- The owner may keep the provenance private while publishing the model.
  show_evidence_register boolean     NOT NULL DEFAULT true,
  -- Parameter PATHS (not names), so renaming a parameter in the model does
  -- not silently change what the published surface exposes.
  exposed_params         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- A snapshot of the model's named schedules (ADR-016) as they stood when
  -- the model was published. See the function below for why this travels
  -- with the published model at all.
  released_schedules     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  status                 text        NOT NULL DEFAULT 'draft'
                                     CHECK (status IN ('draft', 'published', 'withdrawn')),
  published_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT published_models_one_per_model UNIQUE (model_id)
);

CREATE INDEX IF NOT EXISTS published_models_owner_idx
  ON public.published_models (owner_id);

CREATE INDEX IF NOT EXISTS published_models_gallery_idx
  ON public.published_models (published_at DESC NULLS LAST)
  WHERE status = 'published';

CREATE OR REPLACE FUNCTION public.set_published_models_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_published_models_updated_at ON public.published_models;
CREATE TRIGGER trg_published_models_updated_at
  BEFORE UPDATE ON public.published_models
  FOR EACH ROW EXECUTE FUNCTION public.set_published_models_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.published_models ENABLE ROW LEVEL SECURITY;

-- The owner of the MODEL manages the published row. Keyed on
-- des_models.owner_id, NOT on des_models.access: an `editor` collaborator
-- does not get to publish a model to the world.
DROP POLICY IF EXISTS "model owner can manage published model" ON public.published_models;
CREATE POLICY "model owner can manage published model"
  ON public.published_models
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = published_models.model_id
        AND m.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.des_models m
      WHERE m.id = published_models.model_id
        AND m.owner_id = auth.uid()
    )
  );

-- Deliberately NO select policy for `anon` or `authenticated`. The public
-- read path is the function below and nothing else.

-- ── The public read path ─────────────────────────────────────────────────────

-- get_published_model: one published model, by its model id.
--
-- Returns NULL for a draft, a withdrawn model, and a model that was never
-- published — the same answer in every case, so an id cannot be probed.
CREATE OR REPLACE FUNCTION public.get_published_model(p_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pub         public.published_models%ROWTYPE;
  src         jsonb;
  v_version   integer;
  v_model     jsonb;
  v_schedules jsonb;
  v_author    text;
BEGIN
  SELECT * INTO pub
    FROM public.published_models
   WHERE model_id = p_model_id
     AND status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- The release's snapshot when a release is pinned; the live model
  -- otherwise. The registers live inside model_json, so this is the release's
  -- register snapshot too.
  IF pub.released_version_id IS NOT NULL THEN
    SELECT v.model_json INTO src
      FROM public.model_versions v
     WHERE v.id = pub.released_version_id;
  END IF;
  IF src IS NULL THEN
    SELECT m.model_json INTO src
      FROM public.des_models m
     WHERE m.id = p_model_id;
  END IF;
  IF src IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT v.version INTO v_version
    FROM public.model_versions v
   WHERE v.id = pub.released_version_id;

  -- WHITELIST, not a strip list.
  --
  -- A version snapshot stores the whole in-memory model, which carries the
  -- owner's ROW METADATA as well as the model: the collaborator access map
  -- (user ids and their roles), the owner id, the internal notes, the
  -- Business-view curation, the tags. Subtracting a list of known-private
  -- fields is exactly how those leak — a metadata field added later is
  -- exposed by default. Building the payload from an explicit list of the
  -- model's OWN fields means new metadata is private unless it is added here
  -- on purpose.
  --
  -- tests/db/published-models.test.js checks this list against
  -- MODEL_JSON_FIELDS in src/model/modelJsonFields.js, so the two cannot
  -- drift apart.
  --
  -- The registers are deliberately NOT here: they are served through the
  -- gated `registers` key below, so the owner's "keep the provenance private"
  -- choice is honoured in the model payload too.
  v_model := jsonb_build_object(
    'schemaVersion',      src->'schemaVersion',
    'entityTypes',        src->'entityTypes',
    'stateVariables',     src->'stateVariables',
    'bEvents',            src->'bEvents',
    'cEvents',            src->'cEvents',
    'queues',             src->'queues',
    'containerTypes',     src->'containerTypes',
    'distances',          src->'distances',
    'skills',             src->'skills',
    'goals',              src->'goals',
    'dataSources',        src->'dataSources',
    'sections',           src->'sections',
    'graph',              src->'graph',
    'experimentDefaults', src->'experimentDefaults',
    'timeUnit',           src->'timeUnit',
    'epoch',              src->'epoch'
  );

  -- The named schedules (ADR-016) live in their own table, but a B-event's
  -- `scheduleRef` points at one, and the engine resolves that reference
  -- through the schedules map it is given.
  --
  -- If the rows are missing, resolveInlineSchedules() finds no match and the
  -- engine pushes the event to t=1e9 — the published model would run with NO
  -- scheduled arrivals, and say nothing. A published model that does not
  -- behave like the owner's is worse than no published model at all, so the
  -- rows travel with it.
  --
  -- The published release carries its OWN snapshot of them, so a timetable
  -- edited (or deleted) after publication cannot silently change — or empty —
  -- the published model's arrivals. The live rows are a fallback for models
  -- published before the snapshot existed.
  v_schedules := COALESCE(
    NULLIF(pub.released_schedules, '[]'::jsonb),
    (SELECT jsonb_agg(jsonb_build_object(
              'id',           s.id,
              'name',         s.name,
              'isDefault',    s.is_default,
              'scheduleJson', s.schedule_json))
       FROM public.model_schedules s
      WHERE s.model_id = p_model_id),
    '[]'::jsonb);

  -- The author's DISPLAY NAME only, as a byline. `profiles` is readable by
  -- signed-in users only, so without this an anonymous visitor could not see
  -- who published the model — and a published model with no author is not
  -- citable. This is the one piece of owner metadata the public payload
  -- carries, and it is deliberately limited to the name: no id, no email, no
  -- role, no plan. The publish panel says so before the owner publishes.
  v_author := (SELECT p.full_name FROM public.profiles p WHERE p.id = pub.owner_id);

  RETURN jsonb_build_object(
    'model_id',               pub.model_id,
    'title',                  pub.title,
    'summary',                pub.summary,
    'description',            pub.description,
    'category',               pub.category,
    'licence',                pub.licence,
    'cover_image_url',        pub.cover_image_url,
    'author',                 v_author,
    'released_version_id',    pub.released_version_id,
    'released_version',       v_version,
    'release_notes',          pub.release_notes,
    'show_evidence_register', pub.show_evidence_register,
    'exposed_params',         pub.exposed_params,
    'published_at',           pub.published_at,
    'model',                  v_model,
    'schedules',              v_schedules,
    'registers',              CASE WHEN pub.show_evidence_register
                                   THEN jsonb_build_object(
                                     'evidence',     COALESCE(src->'evidence', '[]'::jsonb),
                                     'assumptions',  COALESCE(src->'assumptions', '[]'::jsonb),
                                     'backingLinks', COALESCE(src->'backingLinks', '[]'::jsonb))
                                   ELSE NULL
                                 END
  );
END;
$$;

-- list_published_models: the gallery listing.
--
-- Only published rows. The model JSON is NOT included — a gallery listing
-- must not carry every model's full definition.
CREATE OR REPLACE FUNCTION public.list_published_models(
  p_category text DEFAULT NULL,
  p_search   text DEFAULT NULL,
  p_limit    int   DEFAULT 50
)
RETURNS TABLE (
  model_id        uuid,
  title           text,
  summary         text,
  category        text,
  licence         text,
  cover_image_url text,
  author          text,
  published_at    timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.model_id, p.title, p.summary, p.category, p.licence, p.cover_image_url,
         (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = p.owner_id),
         p.published_at
    FROM public.published_models p
   WHERE p.status = 'published'
     AND (p_category IS NULL OR p.category = p_category)
     AND (p_search IS NULL OR btrim(p_search) = ''
          OR p.title ILIKE '%' || p_search || '%'
          OR p.summary ILIKE '%' || p_search || '%'
          OR p.description ILIKE '%' || p_search || '%')
   ORDER BY p.published_at DESC NULLS LAST
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

-- The public functions are the ONLY way to read published models. Revoke the
-- default PUBLIC execute and grant it deliberately.
REVOKE ALL ON FUNCTION public.get_published_model(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_published_models(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_model(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_published_models(text, text, int) TO anon, authenticated;
