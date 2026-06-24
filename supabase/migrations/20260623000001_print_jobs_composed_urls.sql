-- Change print_jobs to store composed image URLs instead of gallery image IDs
-- The web app now renders images with captions baked in, uploads them,
-- and the print agent just downloads and prints flat images.

alter table public.print_jobs drop column image_ids;
alter table public.print_jobs add column composed_image_urls text[] not null default '{}';
