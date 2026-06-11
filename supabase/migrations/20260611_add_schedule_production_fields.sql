alter table public.schedules
  add column if not exists script_doc_id uuid,
  add column if not exists script_doc_title text,
  add column if not exists memo text,
  add column if not exists reference_images jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
