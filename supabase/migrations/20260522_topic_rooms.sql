CREATE TABLE IF NOT EXISTS topic_rooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  topic text NOT NULL,
  privacy text DEFAULT 'private'
    CHECK (privacy IN ('private', 'open')),
  owner_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  invite_code text UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS topic_room_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid REFERENCES topic_rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  angle text,
  role text DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS topic_clips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id uuid REFERENCES topic_rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  caption text,
  notes text,
  media_urls text[] DEFAULT '{}',
  video_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE topic_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Open rooms public read" ON topic_rooms;
CREATE POLICY "Open rooms public read" ON topic_rooms
  FOR SELECT USING (privacy = 'open' OR owner_id = auth.uid() OR
    id IN (SELECT room_id FROM topic_room_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner manage rooms" ON topic_rooms;
CREATE POLICY "Owner manage rooms" ON topic_rooms
  FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Auth create rooms" ON topic_rooms;
CREATE POLICY "Auth create rooms" ON topic_rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

ALTER TABLE topic_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Member read" ON topic_room_members;
CREATE POLICY "Member read" ON topic_room_members
  FOR SELECT USING (
    user_id = auth.uid() OR
    room_id IN (SELECT id FROM topic_rooms WHERE privacy = 'open') OR
    room_id IN (SELECT room_id FROM topic_room_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Auth join rooms" ON topic_room_members;
CREATE POLICY "Auth join rooms" ON topic_room_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owner remove members" ON topic_room_members;
CREATE POLICY "Owner remove members" ON topic_room_members
  FOR DELETE USING (
    user_id = auth.uid() OR
    room_id IN (SELECT id FROM topic_rooms WHERE owner_id = auth.uid())
  );

ALTER TABLE topic_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Room members read clips" ON topic_clips;
CREATE POLICY "Room members read clips" ON topic_clips
  FOR SELECT USING (
    room_id IN (SELECT id FROM topic_rooms WHERE privacy = 'open') OR
    room_id IN (SELECT room_id FROM topic_room_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Member add clips" ON topic_clips;
CREATE POLICY "Member add clips" ON topic_clips
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    room_id IN (SELECT room_id FROM topic_room_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Owner delete clips" ON topic_clips;
CREATE POLICY "Owner delete clips" ON topic_clips
  FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topic_rooms;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topic_room_members;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topic_clips;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
