-- Align DB default with app default when title is omitted on insert.
ALTER TABLE public.comics ALTER COLUMN title SET DEFAULT 'Comic Title';
