-- Gallery Print App schema

create type upload_queue_status as enum ('waiting', 'active', 'confirmed', 'cancelled');
create type print_job_status as enum ('pending', 'printing', 'done', 'failed');

create table public.gallery_images (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  caption text not null default '',
  position double precision not null,
  inserted_after_id uuid references public.gallery_images(id) on delete set null,
  created_at timestamptz not null default now()
);

create index gallery_images_position_idx on public.gallery_images(position);

create table public.display_state (
  id int primary key default 1 check (id = 1),
  current_image_id uuid references public.gallery_images(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.display_state (id) values (1);

create table public.upload_queue (
  id uuid primary key default gen_random_uuid(),
  user_session_id text not null,
  staged_image_url text not null,
  insert_after_id uuid references public.gallery_images(id) on delete set null,
  status upload_queue_status not null default 'waiting',
  active_at timestamptz,
  created_at timestamptz not null default now()
);

create index upload_queue_status_created_idx on public.upload_queue(status, created_at);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  image_ids uuid[] not null,
  status print_job_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index print_jobs_status_idx on public.print_jobs(status, created_at);

-- Storage bucket for gallery images
insert into storage.buckets (id, name, public)
values ('gallery-images', 'gallery-images', true)
on conflict (id) do nothing;

-- RLS
alter table public.gallery_images enable row level security;
alter table public.display_state enable row level security;
alter table public.upload_queue enable row level security;
alter table public.print_jobs enable row level security;

create policy "gallery_images public read"
  on public.gallery_images for select using (true);

create policy "gallery_images public insert"
  on public.gallery_images for insert with check (true);

create policy "display_state public read"
  on public.display_state for select using (true);

create policy "display_state public update"
  on public.display_state for update using (true);

create policy "upload_queue public read"
  on public.upload_queue for select using (true);

create policy "upload_queue public insert"
  on public.upload_queue for insert with check (true);

create policy "upload_queue public update"
  on public.upload_queue for update using (true);

create policy "upload_queue public delete"
  on public.upload_queue for delete using (true);

create policy "print_jobs public read"
  on public.print_jobs for select using (true);

create policy "print_jobs public insert"
  on public.print_jobs for insert with check (true);

create policy "print_jobs public update"
  on public.print_jobs for update using (true);

-- Storage policies
create policy "gallery images public read"
  on storage.objects for select
  using (bucket_id = 'gallery-images');

create policy "gallery images public upload"
  on storage.objects for insert
  with check (bucket_id = 'gallery-images');

-- Realtime
alter publication supabase_realtime add table public.gallery_images;
alter publication supabase_realtime add table public.display_state;
alter publication supabase_realtime add table public.upload_queue;
alter publication supabase_realtime add table public.print_jobs;

-- Compute position when inserting after a given image
create or replace function public.compute_insert_position(p_after_id uuid)
returns double precision
language plpgsql
as $$
declare
  after_pos double precision;
  next_pos double precision;
begin
  if p_after_id is null then
    select coalesce(max(position), 0) + 1000 into after_pos from public.gallery_images;
    return after_pos;
  end if;

  select position into after_pos from public.gallery_images where id = p_after_id;
  if after_pos is null then
    return 1000;
  end if;

  select position into next_pos
  from public.gallery_images
  where position > after_pos
  order by position asc
  limit 1;

  if next_pos is null then
    return after_pos + 1000;
  end if;

  return (after_pos + next_pos) / 2.0;
end;
$$;

-- Promote next waiting user to active
create or replace function public.promote_next_in_queue()
returns void
language plpgsql
as $$
declare
  next_id uuid;
begin
  if exists (select 1 from public.upload_queue where status = 'active') then
    return;
  end if;

  select id into next_id
  from public.upload_queue
  where status = 'waiting'
  order by created_at asc
  limit 1;

  if next_id is not null then
    update public.upload_queue
    set status = 'active', active_at = now()
    where id = next_id;
  end if;
end;
$$;

-- Join upload queue atomically
create or replace function public.join_upload_queue(
  p_session_id text,
  p_staged_url text
)
returns public.upload_queue
language plpgsql
as $$
declare
  existing public.upload_queue;
  new_row public.upload_queue;
  has_active boolean;
begin
  select * into existing
  from public.upload_queue
  where user_session_id = p_session_id
    and status in ('waiting', 'active')
  limit 1;

  if existing.id is not null then
    return existing;
  end if;

  select exists(select 1 from public.upload_queue where status = 'active') into has_active;

  insert into public.upload_queue (user_session_id, staged_image_url, status, active_at)
  values (
    p_session_id,
    p_staged_url,
    case when has_active then 'waiting'::upload_queue_status else 'active'::upload_queue_status end,
    case when has_active then null else now() end
  )
  returning * into new_row;

  return new_row;
end;
$$;

-- Finalize upload: insert gallery image and advance queue
create or replace function public.confirm_gallery_upload(
  p_queue_id uuid,
  p_insert_after_id uuid,
  p_caption text
)
returns public.gallery_images
language plpgsql
as $$
declare
  queue_row public.upload_queue;
  new_image public.gallery_images;
  new_pos double precision;
begin
  select * into queue_row
  from public.upload_queue
  where id = p_queue_id and status = 'active'
  for update;

  if queue_row.id is null then
    raise exception 'Queue entry not active or not found';
  end if;

  new_pos := public.compute_insert_position(p_insert_after_id);

  insert into public.gallery_images (image_url, caption, position, inserted_after_id)
  values (queue_row.staged_image_url, p_caption, new_pos, p_insert_after_id)
  returning * into new_image;

  update public.upload_queue
  set status = 'confirmed', insert_after_id = p_insert_after_id
  where id = p_queue_id;

  perform public.promote_next_in_queue();

  return new_image;
end;
$$;

-- Cancel queue entry
create or replace function public.cancel_queue_entry(p_queue_id uuid)
returns void
language plpgsql
as $$
declare
  was_active boolean;
begin
  select status = 'active' into was_active
  from public.upload_queue where id = p_queue_id;

  update public.upload_queue
  set status = 'cancelled'
  where id = p_queue_id and status in ('waiting', 'active');

  if was_active then
    perform public.promote_next_in_queue();
  end if;
end;
$$;

grant execute on function public.compute_insert_position(uuid) to anon, authenticated;
grant execute on function public.promote_next_in_queue() to anon, authenticated;
grant execute on function public.join_upload_queue(text, text) to anon, authenticated;
grant execute on function public.confirm_gallery_upload(uuid, uuid, text) to anon, authenticated;
grant execute on function public.cancel_queue_entry(uuid) to anon, authenticated;
