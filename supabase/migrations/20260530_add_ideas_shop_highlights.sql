ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS shop_highlights text;

NOTIFY pgrst, 'reload schema';
