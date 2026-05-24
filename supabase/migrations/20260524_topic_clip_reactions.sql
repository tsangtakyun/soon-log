ALTER TABLE topic_clips
  ADD COLUMN IF NOT EXISTS like_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count int DEFAULT 0;

CREATE TABLE IF NOT EXISTS topic_clip_likes (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  clip_id uuid REFERENCES topic_clips(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, clip_id)
);

CREATE TABLE IF NOT EXISTS topic_clip_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clip_id uuid REFERENCES topic_clips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE topic_clip_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_clip_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read clip likes" ON topic_clip_likes;
CREATE POLICY "Read clip likes" ON topic_clip_likes
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM topic_clips tc
      WHERE tc.id = clip_id
        AND (
          public.is_topic_room_open(tc.room_id)
          OR public.is_topic_room_member(tc.room_id)
        )
    )
  );

DROP POLICY IF EXISTS "Manage own clip likes" ON topic_clip_likes;
CREATE POLICY "Manage own clip likes" ON topic_clip_likes
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM topic_clips tc
      WHERE tc.id = clip_id
        AND (
          public.is_topic_room_open(tc.room_id)
          OR public.is_topic_room_member(tc.room_id)
        )
    )
  );

DROP POLICY IF EXISTS "Read clip comments" ON topic_clip_comments;
CREATE POLICY "Read clip comments" ON topic_clip_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM topic_clips tc
      WHERE tc.id = clip_id
        AND (
          public.is_topic_room_open(tc.room_id)
          OR public.is_topic_room_member(tc.room_id)
        )
    )
  );

DROP POLICY IF EXISTS "Create clip comments" ON topic_clip_comments;
CREATE POLICY "Create clip comments" ON topic_clip_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM topic_clips tc
      WHERE tc.id = clip_id
        AND (
          public.is_topic_room_open(tc.room_id)
          OR public.is_topic_room_member(tc.room_id)
        )
    )
  );

DROP POLICY IF EXISTS "Delete own clip comments" ON topic_clip_comments;
CREATE POLICY "Delete own clip comments" ON topic_clip_comments
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.sync_topic_clip_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE topic_clips
    SET like_count = COALESCE(like_count, 0) + 1
    WHERE id = NEW.clip_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE topic_clips
    SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1)
    WHERE id = OLD.clip_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_topic_clip_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE topic_clips
    SET comment_count = COALESCE(comment_count, 0) + 1
    WHERE id = NEW.clip_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE topic_clips
    SET comment_count = GREATEST(0, COALESCE(comment_count, 0) - 1)
    WHERE id = OLD.clip_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_topic_clip_like_count_insert ON topic_clip_likes;
CREATE TRIGGER sync_topic_clip_like_count_insert
  AFTER INSERT ON topic_clip_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_topic_clip_like_count();

DROP TRIGGER IF EXISTS sync_topic_clip_like_count_delete ON topic_clip_likes;
CREATE TRIGGER sync_topic_clip_like_count_delete
  AFTER DELETE ON topic_clip_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_topic_clip_like_count();

DROP TRIGGER IF EXISTS sync_topic_clip_comment_count_insert ON topic_clip_comments;
CREATE TRIGGER sync_topic_clip_comment_count_insert
  AFTER INSERT ON topic_clip_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_topic_clip_comment_count();

DROP TRIGGER IF EXISTS sync_topic_clip_comment_count_delete ON topic_clip_comments;
CREATE TRIGGER sync_topic_clip_comment_count_delete
  AFTER DELETE ON topic_clip_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_topic_clip_comment_count();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topic_clip_likes;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE topic_clip_comments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
