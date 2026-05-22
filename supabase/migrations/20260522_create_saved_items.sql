CREATE TABLE IF NOT EXISTS saved_items (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('trend', 'discussion')),
  item_id uuid NOT NULL,
  saved_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, item_type, item_id)
);

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manage saved items" ON saved_items;
CREATE POLICY "Owner manage saved items" ON saved_items
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
