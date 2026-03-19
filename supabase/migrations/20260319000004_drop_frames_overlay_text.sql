-- Drop overlay_text column from frames.
-- Text overlay on the image is now derived from `frames.caption` in the frontend.

ALTER TABLE public.frames
  DROP COLUMN IF EXISTS overlay_text;

