-- =============================================================================
-- Fix infinite recursion in session_members RLS policies.
--
-- Problem: session_members SELECT policy queries session_members inside its own
-- USING clause, causing PostgreSQL to re-evaluate the same policy infinitely.
-- The same issue cascades to every other table whose SELECT policy queries
-- session_members (sessions, session_images, session_phrases, etc.).
--
-- Solution: a SECURITY DEFINER function that checks membership while bypassing
-- RLS, then rewrite all affected SELECT policies to call it.
-- =============================================================================

-- 1. Security-definer helper (bypasses RLS on session_members)
CREATE OR REPLACE FUNCTION public.is_session_member(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.session_members
    WHERE session_id = p_session_id
      AND user_id = auth.uid()
  );
$$;

-- 2. session_members: fix the self-referential SELECT policy
DROP POLICY IF EXISTS "session_members_select_members" ON public.session_members;
CREATE POLICY "session_members_select_members"
  ON public.session_members FOR SELECT
  USING (public.is_session_member(session_id));

-- 3. sessions: fix member-only SELECT and add lobby-visible policy for joining
DROP POLICY IF EXISTS "sessions_select_members" ON public.sessions;
CREATE POLICY "sessions_select_members"
  ON public.sessions FOR SELECT
  USING (public.is_session_member(id));

DROP POLICY IF EXISTS "sessions_select_lobby" ON public.sessions;
CREATE POLICY "sessions_select_lobby"
  ON public.sessions FOR SELECT
  TO authenticated
  USING (round = 'lobby');

-- 4. session_images
DROP POLICY IF EXISTS "session_images_select_members" ON public.session_images;
CREATE POLICY "session_images_select_members"
  ON public.session_images FOR SELECT
  USING (public.is_session_member(session_id));

-- 5. session_phrases
DROP POLICY IF EXISTS "session_phrases_select_members" ON public.session_phrases;
CREATE POLICY "session_phrases_select_members"
  ON public.session_phrases FOR SELECT
  USING (public.is_session_member(session_id));

-- 6. session_matchups
DROP POLICY IF EXISTS "session_matchups_select_members" ON public.session_matchups;
CREATE POLICY "session_matchups_select_members"
  ON public.session_matchups FOR SELECT
  USING (public.is_session_member(session_id));

-- 7. session_votes (goes through session_matchups to find session_id)
DROP POLICY IF EXISTS "session_votes_select_members" ON public.session_votes;
CREATE POLICY "session_votes_select_members"
  ON public.session_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_matchups smu
      WHERE smu.id = session_votes.matchup_id
        AND public.is_session_member(smu.session_id)
    )
  );
