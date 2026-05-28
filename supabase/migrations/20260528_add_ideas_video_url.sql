ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS video_url text;

NOTIFY pgrst, 'reload schema';
