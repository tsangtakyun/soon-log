ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}';

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS social_stats jsonb DEFAULT '{}';

NOTIFY pgrst, 'reload schema';
