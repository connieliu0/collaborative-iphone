-- Enable Supabase Realtime on all session-related tables.
-- Without this, postgres_changes subscriptions receive no events.

ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_images;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_phrases;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_matchups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comics;
