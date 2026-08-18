-- Upgrade legacy comic caption styling (white 18px) to yellow 28px.
UPDATE public.frames
SET
  font_size = 28,
  font_color = '#FFE135'
WHERE font_size = 18 AND lower(font_color) = '#ffffff';

-- Nudge bottom-anchored captions upward.
UPDATE public.frames
SET overlay_y = 85
WHERE overlay_y = 90;

ALTER TABLE public.frames ALTER COLUMN font_size SET DEFAULT 28;
ALTER TABLE public.frames ALTER COLUMN font_color SET DEFAULT '#FFE135';
