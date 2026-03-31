-- Add sub_step to sessions for image/phrase step tracking within contribute rounds
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS sub_step text NOT NULL DEFAULT 'image';
