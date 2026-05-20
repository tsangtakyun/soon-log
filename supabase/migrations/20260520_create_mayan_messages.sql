CREATE TABLE IF NOT EXISTS mayan_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mayan_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner only mayan messages" ON mayan_messages;
CREATE POLICY "Owner only mayan messages" ON mayan_messages
  FOR ALL USING (auth.uid() = user_id);
