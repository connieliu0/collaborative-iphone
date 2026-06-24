-- Store source frames on print jobs so the print agent can compose reliably server-side.
alter table public.print_jobs add column if not exists print_frames jsonb;
