CREATE TABLE IF NOT EXISTS trends (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic text NOT NULL,
  icon text DEFAULT '🔥',
  heat_score int DEFAULT 50 CHECK (heat_score BETWEEN 0 AND 100),
  angles jsonb NOT NULL DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS trend_discussions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  trend_id uuid REFERENCES trends(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  images text[] DEFAULT '{}',
  link_url text,
  link_metadata jsonb,
  like_count int DEFAULT 0,
  reply_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS discussion_likes (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  discussion_id uuid REFERENCES trend_discussions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, discussion_id)
);

CREATE TABLE IF NOT EXISTS user_credits (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance int DEFAULT 30,
  daily_limit int DEFAULT 30,
  last_reset_at timestamptz DEFAULT now()
);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE trends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read trends" ON trends;
CREATE POLICY "Public read trends" ON trends FOR SELECT USING (true);

ALTER TABLE trend_discussions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read discussions" ON trend_discussions;
CREATE POLICY "Public read discussions" ON trend_discussions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Auth insert discussions" ON trend_discussions;
CREATE POLICY "Auth insert discussions" ON trend_discussions
  FOR INSERT WITH CHECK (auth.uid() = author_id);

ALTER TABLE discussion_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth manage likes" ON discussion_likes;
CREATE POLICY "Auth manage likes" ON discussion_likes
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner read credits" ON user_credits;
CREATE POLICY "Owner read credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

INSERT INTO trends (topic, icon, heat_score, angles, is_active)
SELECT topic, icon, heat_score, angles::jsonb, is_active
FROM (
  VALUES
  ('2026 世界盃', '⚽', 92,
   '[{"emoji":"🇫🇷","name":"球員花絮","percentage":35},
     {"emoji":"🎭","name":"梗圖","percentage":28},
     {"emoji":"📊","name":"預測分析","percentage":15},
     {"emoji":"🏆","name":"開幕禮","percentage":12},
     {"emoji":"⚡","name":"賽後評論","percentage":10}]',
   true),
  ('AI 取代創作者？', '🤖', 87,
   '[{"emoji":"💡","name":"工具應用","percentage":42},
     {"emoji":"😰","name":"職業危機","percentage":31},
     {"emoji":"🤝","name":"人機協作","percentage":18},
     {"emoji":"🎨","name":"創意邊界","percentage":9}]',
   true),
  ('香港夜經濟', '🌃', 74,
   '[{"emoji":"🍜","name":"深夜食堂","percentage":38},
     {"emoji":"🎵","name":"Live Music","percentage":27},
     {"emoji":"🛍️","name":"夜市文化","percentage":22},
     {"emoji":"📸","name":"夜景攝影","percentage":13}]',
   true)
) AS seed(topic, icon, heat_score, angles, is_active)
WHERE NOT EXISTS (SELECT 1 FROM trends);
