CREATE TABLE IF NOT EXISTS public.ideas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  description text,
  hook text,
  region text DEFAULT '全球',
  viral_potential text DEFAULT 'medium'
    CHECK (viral_potential IN ('high', 'medium', 'low')),
  source_url text,
  platform text DEFAULT 'Instagram',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access ideas" ON public.ideas;
CREATE POLICY "Owner full access ideas" ON public.ideas
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner read ideas" ON public.ideas;
CREATE POLICY "Owner read ideas" ON public.ideas
  FOR SELECT USING (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ideas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
