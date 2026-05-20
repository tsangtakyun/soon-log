CREATE TABLE IF NOT EXISTS schedules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  location text,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  type text DEFAULT 'shoot'
    CHECK (type IN ('shoot', 'meeting', 'deadline', 'publish', 'other')),
  collaborators uuid[] DEFAULT '{}',
  related_log_id uuid REFERENCES logs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team read schedules" ON schedules;
CREATE POLICY "Team read schedules" ON schedules
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owner manage schedules" ON schedules;
CREATE POLICY "Owner manage schedules" ON schedules
  FOR ALL USING (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE schedules;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
