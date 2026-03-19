-- -----------------------------------------------------------------------------
-- Enable DELETE for user-owned comics and allow owner cleanup of storage objects.
-- -----------------------------------------------------------------------------

-- 1) comics: allow owners to delete their own comics
ALTER TABLE public.comics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comics_delete_owner" ON public.comics;
CREATE POLICY "comics_delete_owner"
  ON public.comics FOR DELETE
  USING (owner_id = auth.uid());

-- 2) storage: best-effort cleanup in the app.
-- If your migration role cannot manage storage.objects policies, it's safe to
-- omit storage DELETE policies; the DB rows will still be deleted.

