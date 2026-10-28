ALTER TABLE public.published_models ADD COLUMN IF NOT EXISTS public_payload jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.published_models p
    WHERE p.status = 'published' AND NOT EXISTS (
      SELECT 1 FROM public.model_versions v
      WHERE v.id = p.released_version_id AND v.model_id = p.model_id
    )
  ) THEN
    RAISE EXCEPTION 'Published models must pin a version of their own model before this migration can run';
  END IF;
END;
$$;

UPDATE public.published_models p
SET public_payload = public.get_published_model(p.model_id)
WHERE p.status = 'published' AND p.public_payload IS NULL;

CREATE OR REPLACE FUNCTION public.get_published_model(p_model_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public_payload FROM public.published_models
  WHERE model_id = p_model_id AND status = 'published';
$$;

CREATE OR REPLACE FUNCTION public.publish_model(p_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pub public.published_models%ROWTYPE;
  src jsonb;
  v_version integer;
  v_model jsonb;
  v_schedules jsonb;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.des_models m
    WHERE m.id = p_model_id AND m.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Only the model owner may publish';
  END IF;

  SELECT * INTO pub FROM public.published_models
  WHERE model_id = p_model_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no publish record for this model yet';
  END IF;

  SELECT v.model_json, v.version INTO src, v_version
  FROM public.model_versions v
  WHERE v.id = pub.released_version_id AND v.model_id = p_model_id;
  IF NOT FOUND OR src IS NULL THEN
    RAISE EXCEPTION 'Choose a saved version of this model before publishing';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'isDefault', s.is_default,
    'scheduleJson', s.schedule_json
  )), '[]'::jsonb) INTO v_schedules
  FROM public.model_schedules s WHERE s.model_id = p_model_id;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(src->'bEvents', '[]'::jsonb)) b,
      jsonb_array_elements(COALESCE(b->'schedules', '[]'::jsonb)) schedule
    WHERE schedule->>'scheduleRef' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.model_schedules s
      WHERE s.model_id = p_model_id AND s.id::text = schedule->>'scheduleRef'
    )
  ) THEN
    RAISE EXCEPTION 'A timetable referenced by the selected version is missing';
  END IF;

  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_model
  FROM jsonb_each(src)
  WHERE key = ANY(ARRAY[
    'schemaVersion', 'entityTypes', 'stateVariables', 'bEvents', 'cEvents',
    'queues', 'containerTypes', 'distances', 'skills', 'goals', 'sections',
    'graph', 'experimentDefaults', 'timeUnit', 'epoch'
  ]);
  v_model := v_model || jsonb_build_object('dataSources', '[]'::jsonb);

  UPDATE public.published_models SET
    owner_id = auth.uid(), status = 'published', published_at = v_now,
    released_schedules = v_schedules,
    public_payload = jsonb_build_object(
      'model_id', p_model_id, 'title', pub.title, 'summary', pub.summary,
      'description', pub.description, 'category', pub.category,
      'licence', pub.licence, 'cover_image_url', pub.cover_image_url,
      'author', (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
      'released_version_id', pub.released_version_id, 'released_version', v_version,
      'release_notes', pub.release_notes, 'show_evidence_register', pub.show_evidence_register,
      'exposed_params', pub.exposed_params, 'published_at', v_now,
      'model', v_model, 'schedules', v_schedules,
      'registers', CASE WHEN pub.show_evidence_register THEN jsonb_build_object(
        'evidence', COALESCE(src->'evidence', '[]'::jsonb),
        'assumptions', COALESCE(src->'assumptions', '[]'::jsonb),
        'backingLinks', COALESCE(src->'backingLinks', '[]'::jsonb)
      ) ELSE NULL END
    )
  WHERE model_id = p_model_id RETURNING * INTO pub;
  RETURN to_jsonb(pub);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_published_models(
  p_category text DEFAULT NULL, p_search text DEFAULT NULL, p_limit int DEFAULT 50
)
RETURNS TABLE (
  model_id uuid, title text, summary text, category text, licence text,
  cover_image_url text, author text, published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.model_id, p.public_payload->>'title', p.public_payload->>'summary',
    p.public_payload->>'category', p.public_payload->>'licence',
    p.public_payload->>'cover_image_url', p.public_payload->>'author', p.published_at
  FROM public.published_models p
  WHERE p.status = 'published' AND p.public_payload IS NOT NULL
    AND (p_category IS NULL OR p.public_payload->>'category' = p_category)
    AND (p_search IS NULL OR btrim(p_search) = ''
      OR p.public_payload->>'title' ILIKE '%' || p_search || '%'
      OR p.public_payload->>'summary' ILIKE '%' || p_search || '%'
      OR p.public_payload->>'description' ILIKE '%' || p_search || '%')
  ORDER BY p.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
$$;

REVOKE ALL ON FUNCTION public.publish_model(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_model(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_published_model(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_model(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.list_published_models(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_published_models(text, text, int) TO anon, authenticated;
