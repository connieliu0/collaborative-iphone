-- Allow session members to claim phrases by setting used_by (first-come-first-served).
ALTER TABLE public.session_phrases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_phrases_update_claim" ON public.session_phrases;
CREATE POLICY "session_phrases_update_claim"
  ON public.session_phrases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = session_phrases.session_id
        AND sm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.session_members sm
      WHERE sm.session_id = session_phrases.session_id
        AND sm.user_id = auth.uid()
    )
  );
