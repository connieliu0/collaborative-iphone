-- =============================================================================
-- Full schema + RLS: comics, frames, profiles (creates tables if missing)
-- Run this in Supabase SQL Editor or via: supabase db push
--
-- If you already have RLS on comics that allows public SELECT on all rows,
-- drop that policy first, e.g.:
--   DROP POLICY IF EXISTS "comics_select_public" ON comics;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COMICS table (create if not exists, then add collab columns if missing)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT 'Untitled',
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'complete',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comics
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'solo' CHECK (mode IN ('solo', 'collab')),
  ADD COLUMN IF NOT EXISTS current_turn_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS turn_order uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_frames int;

COMMENT ON COLUMN public.comics.mode IS 'solo or collab';
COMMENT ON COLUMN public.comics.current_turn_user_id IS 'User whose turn it is to add a frame';
COMMENT ON COLUMN public.comics.turn_order IS 'Ordered list: [owner_id, ...collaborator_ids]';
COMMENT ON COLUMN public.comics.max_frames IS 'Total frame cap for the comic (e.g. turn_order.length * 3, max 24)';

-- -----------------------------------------------------------------------------
-- 2. FRAMES table (create if not exists)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comic_id uuid NOT NULL REFERENCES public.comics(id) ON DELETE CASCADE,
  "order" integer NOT NULL,
  image_url text NOT NULL,
  caption text NOT NULL DEFAULT '',
  overlay_text text NOT NULL DEFAULT '',
  overlay_x numeric NOT NULL DEFAULT 50,
  overlay_y numeric NOT NULL DEFAULT 50,
  font_size integer NOT NULL DEFAULT 18,
  font_color text NOT NULL DEFAULT '#ffffff'
);

COMMENT ON TABLE public.frames IS 'Frames belong to a comic; order defines sequence';

-- -----------------------------------------------------------------------------
-- 2. PROFILES: create if not exists (id = auth.users.id, username unique)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE
);

-- Optional: auto-create profile on signup (so users can set username later)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    'user_' || REPLACE(LEFT(NEW.id::text, 8), '-', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow users to update their own username (for uniqueness, handle conflicts in app if needed)
COMMENT ON TABLE public.profiles IS 'User profiles; id matches auth.users.id, username for @mentions and invite lookup';

-- -----------------------------------------------------------------------------
-- 4. RLS: COMICS
-- -----------------------------------------------------------------------------
ALTER TABLE public.comics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comics_select_complete" ON public.comics;
DROP POLICY IF EXISTS "comics_select_in_progress" ON public.comics;
DROP POLICY IF EXISTS "comics_insert_owner" ON public.comics;
DROP POLICY IF EXISTS "comics_update_owner" ON public.comics;

CREATE POLICY "comics_select_complete"
  ON public.comics FOR SELECT
  USING (status = 'complete');

CREATE POLICY "comics_select_in_progress"
  ON public.comics FOR SELECT
  USING (
    status = 'in_progress'
    AND (
      owner_id = auth.uid()
      OR auth.uid() = ANY(turn_order)
    )
  );

CREATE POLICY "comics_insert_owner"
  ON public.comics FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "comics_update_owner"
  ON public.comics FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. RLS: FRAMES
-- -----------------------------------------------------------------------------
ALTER TABLE public.frames ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "frames_select_public" ON public.frames;
DROP POLICY IF EXISTS "frames_insert_owner_or_turn" ON public.frames;

CREATE POLICY "frames_select_public"
  ON public.frames FOR SELECT
  USING (true);

CREATE POLICY "frames_insert_owner_or_turn"
  ON public.frames FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comics c
      WHERE c.id = comic_id
        AND (
          c.owner_id = auth.uid()
          OR c.current_turn_user_id = auth.uid()
        )
    )
  );

-- No update/delete policies needed for collab flow; add if you want edit/delete.

-- -----------------------------------------------------------------------------
-- 6. RLS: PROFILES
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 7. STORAGE (comic-frames bucket) – run in Dashboard or add here
-- -----------------------------------------------------------------------------
-- In Supabase Dashboard: Storage > comic-frames >
--   Policy: "Users can upload to own folder"  (INSERT): (bucket_id = 'comic-frames' AND (storage.foldername(name))[1] = auth.uid()::text)
--   Policy: "Public read" (SELECT): true for comic-frames
-- Or via SQL (bucket must exist):
/*
INSERT INTO storage.buckets (id, name, public)
VALUES ('comic-frames', 'comic-frames', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "comic_frames_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comic-frames'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "comic_frames_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comic-frames');
*/
