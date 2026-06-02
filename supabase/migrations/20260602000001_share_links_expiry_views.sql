-- C2: optional expiry on share links (expires_at)
-- C4: view tracking (view_count, last_viewed_at)

ALTER TABLE public.share_links
  ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_count     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

-- Refresh the public read policy to also exclude expired links
DROP POLICY IF EXISTS "Anyone can read active share links" ON public.share_links;
CREATE POLICY "Anyone can read active share links"
  ON public.share_links
  FOR SELECT
  TO public
  USING (
    revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Security-definer function so anonymous viewers can record their visit.
-- Direct UPDATE by anon would bypass RLS, so we gate the logic here.
CREATE OR REPLACE FUNCTION public.increment_share_view(p_token TEXT)
  RETURNS VOID
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.share_links
     SET view_count     = view_count + 1,
         last_viewed_at = now()
   WHERE token        = p_token
     AND revoked_at   IS NULL
     AND (expires_at IS NULL OR expires_at > now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_share_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_share_view(TEXT) TO authenticated;
