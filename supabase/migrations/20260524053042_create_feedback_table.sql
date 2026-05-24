-- Migration: create feedback table
-- Sprint: In-App Feedback & About Panel

CREATE TABLE public.feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category    text NOT NULL CHECK (category IN ('bug','feature','question','other')),
  message     text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  app_version text,
  page_context text,
  user_agent  text,
  status      text NOT NULL DEFAULT 'new'
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback; no SELECT/UPDATE/DELETE for users
CREATE POLICY "Users can submit feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Anonymous users may also submit (user_id will be null)
CREATE POLICY "Anonymous feedback allowed"
  ON public.feedback FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
