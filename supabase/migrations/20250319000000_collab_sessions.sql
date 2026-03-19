-- =============================================================================
-- Collab session data model (scaffold for future Cloud Mode)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Sessions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round text NOT NULL DEFAULT 'lobby',
  created_at timestamptz NOT NULL DEFAULT now(),
  final_comic_id uuid REFERENCES public.comics(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 2. Session Members
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

ALTER TABLE public.session_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_members_select_members" ON public.session_members;
CREATE POLICY "session_members_select_members"
  ON public.session_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = session_members.session_id
        AND sm.user_id = auth.uid()
    )
  );

-- Anyone can join if they are inserting their own membership row.
DROP POLICY IF EXISTS "session_members_insert_self" ON public.session_members;
CREATE POLICY "session_members_insert_self"
  ON public.session_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 1b. Sessions RLS + policies (after session_members exists)
-- -----------------------------------------------------------------------------
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Members can read sessions they're in.
DROP POLICY IF EXISTS "sessions_select_members" ON public.sessions;
CREATE POLICY "sessions_select_members"
  ON public.sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = sessions.id
        AND sm.user_id = auth.uid()
    )
  );

-- Host can insert/update sessions they host.
DROP POLICY IF EXISTS "sessions_insert_host" ON public.sessions;
CREATE POLICY "sessions_insert_host"
  ON public.sessions FOR INSERT
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS "sessions_update_host" ON public.sessions;
CREATE POLICY "sessions_update_host"
  ON public.sessions FOR UPDATE
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. Round 1 Images: user contributes images
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_images_select_members" ON public.session_images;
CREATE POLICY "session_images_select_members"
  ON public.session_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = session_images.session_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "session_images_insert_self" ON public.session_images;
CREATE POLICY "session_images_insert_self"
  ON public.session_images FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. Round 2 Phrases: user contributes phrases
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text text NOT NULL,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_phrases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_phrases_select_members" ON public.session_phrases;
CREATE POLICY "session_phrases_select_members"
  ON public.session_phrases FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = session_phrases.session_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "session_phrases_insert_self" ON public.session_phrases;
CREATE POLICY "session_phrases_insert_self"
  ON public.session_phrases FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Round 4 Voting Matchups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_matchups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  round_number int NOT NULL,
  option_a_image_url text NOT NULL,
  option_a_caption text NOT NULL,
  option_b_image_url text NOT NULL,
  option_b_caption text NOT NULL,
  winner text
);

ALTER TABLE public.session_matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_matchups_select_members" ON public.session_matchups;
CREATE POLICY "session_matchups_select_members"
  ON public.session_matchups FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = session_matchups.session_id
        AND sm.user_id = auth.uid()
    )
  );

-- Host generates matchups; allow updates by host.
DROP POLICY IF EXISTS "session_matchups_insert_host" ON public.session_matchups;
CREATE POLICY "session_matchups_insert_host"
  ON public.session_matchups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_matchups.session_id
        AND s.host_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "session_matchups_update_host" ON public.session_matchups;
CREATE POLICY "session_matchups_update_host"
  ON public.session_matchups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_matchups.session_id
        AND s.host_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE s.id = session_matchups.session_id
        AND s.host_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- 6. Votes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.session_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matchup_id uuid NOT NULL REFERENCES public.session_matchups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  choice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(matchup_id, user_id)
);

ALTER TABLE public.session_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_votes_select_members" ON public.session_votes;
CREATE POLICY "session_votes_select_members"
  ON public.session_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_matchups smu
      JOIN public.session_members sm
        ON sm.session_id = smu.session_id
      WHERE smu.id = session_votes.matchup_id
        AND sm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "session_votes_insert_self" ON public.session_votes;
CREATE POLICY "session_votes_insert_self"
  ON public.session_votes FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 7. Add session_id to comics for collab result comics
-- -----------------------------------------------------------------------------
ALTER TABLE public.comics
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id);

