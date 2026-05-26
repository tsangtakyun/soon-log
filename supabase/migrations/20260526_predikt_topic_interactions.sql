CREATE TABLE IF NOT EXISTS trend_fires (
  trend_id uuid REFERENCES trends(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (trend_id, user_id)
);

CREATE TABLE IF NOT EXISTS trend_votes (
  trend_id uuid REFERENCES trends(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  angle_index int NOT NULL,
  angle_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (trend_id, user_id)
);

ALTER TABLE trend_fires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read trend fires" ON trend_fires;
CREATE POLICY "Public read trend fires" ON trend_fires FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth insert own trend fires" ON trend_fires;
CREATE POLICY "Auth insert own trend fires" ON trend_fires
  FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE trend_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read trend votes" ON trend_votes;
CREATE POLICY "Public read trend votes" ON trend_votes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth insert own trend votes" ON trend_votes;
CREATE POLICY "Auth insert own trend votes" ON trend_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
