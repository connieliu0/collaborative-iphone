-- =============================================================================
-- Performance mode: session_type, round_number tracking, pairings table
-- =============================================================================

-- 1. Add session_type and round_number to sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS session_type text NOT NULL DEFAULT 'collab',
  ADD COLUMN IF NOT EXISTS round_number int NOT NULL DEFAULT 0;

-- 2. Tag images and phrases with the contribute round they came from
ALTER TABLE public.session_images
  ADD COLUMN IF NOT EXISTS round_number int;

ALTER TABLE public.session_phrases
  ADD COLUMN IF NOT EXISTS round_number int;

-- 3. Pairings table (compose step output for performance mode)
CREATE TABLE IF NOT EXISTS public.session_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  phrase_text text NOT NULL,
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_pairings ENABLE ROW LEVEL SECURITY;

-- Members can read pairings in their session
DROP POLICY IF EXISTS "session_pairings_select_members" ON public.session_pairings;
CREATE POLICY "session_pairings_select_members"
  ON public.session_pairings FOR SELECT
  USING (public.is_session_member(session_id));

-- Players insert their own pairing
DROP POLICY IF EXISTS "session_pairings_insert_self" ON public.session_pairings;
CREATE POLICY "session_pairings_insert_self"
  ON public.session_pairings FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Host can update featured flag
DROP POLICY IF EXISTS "session_pairings_update_host" ON public.session_pairings;
CREATE POLICY "session_pairings_update_host"
  ON public.session_pairings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_pairings.session_id
        AND s.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_pairings.session_id
        AND s.host_id = auth.uid()
    )
  );

-- 4. Allow any authenticated user to discover active performance sessions
DROP POLICY IF EXISTS "sessions_select_performance" ON public.sessions;
CREATE POLICY "sessions_select_performance"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (session_type = 'performance' AND round != 'complete');

-- 5. Realtime for pairings
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_pairings;
