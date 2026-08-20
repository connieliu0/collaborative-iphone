-- WordHack presentation photo uploads (separate from gallery_images).
-- QR → /whupload; comic viewer montages these on one special frame.

create table public.wh_photos (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  created_at timestamptz not null default now()
);

create index wh_photos_created_at_idx on public.wh_photos(created_at);

alter table public.wh_photos enable row level security;

create policy "wh_photos public read"
  on public.wh_photos for select using (true);

create policy "wh_photos public insert"
  on public.wh_photos for insert with check (true);

alter publication supabase_realtime add table public.wh_photos;
