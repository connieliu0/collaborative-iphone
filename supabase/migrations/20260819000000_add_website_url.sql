-- Add website_url column to frames table for Instagram/website embeds
ALTER TABLE public.frames
  ADD COLUMN IF NOT EXISTS website_url text;

COMMENT ON COLUMN public.frames.website_url IS 'Optional URL for embedded content (e.g. Instagram post)';
