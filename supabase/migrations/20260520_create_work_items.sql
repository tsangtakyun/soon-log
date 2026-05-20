CREATE TABLE IF NOT EXISTS work_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  priority text DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  due_date date,
  assignee_id uuid REFERENCES profiles(id),
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team read work items" ON work_items;
CREATE POLICY "Team read work items" ON work_items
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owner manage work items" ON work_items;
CREATE POLICY "Owner manage work items" ON work_items
  FOR ALL USING (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE work_items;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
