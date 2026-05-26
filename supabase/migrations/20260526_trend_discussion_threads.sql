CREATE TABLE IF NOT EXISTS trend_discussion_replies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discussion_id uuid REFERENCES trend_discussions(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  like_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trend_discussion_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read trend discussion replies" ON trend_discussion_replies;
CREATE POLICY "Public read trend discussion replies" ON trend_discussion_replies
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth insert trend discussion replies" ON trend_discussion_replies;
CREATE POLICY "Auth insert trend discussion replies" ON trend_discussion_replies
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE OR REPLACE FUNCTION public.sync_trend_discussion_reply_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.trend_discussions
    SET reply_count = COALESCE(reply_count, 0) + 1
    WHERE id = NEW.discussion_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.trend_discussions
    SET reply_count = GREATEST(0, COALESCE(reply_count, 0) - 1)
    WHERE id = OLD.discussion_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_trend_discussion_reply_count_insert ON public.trend_discussion_replies;
CREATE TRIGGER sync_trend_discussion_reply_count_insert
  AFTER INSERT ON public.trend_discussion_replies
  FOR EACH ROW EXECUTE FUNCTION public.sync_trend_discussion_reply_count();

DROP TRIGGER IF EXISTS sync_trend_discussion_reply_count_delete ON public.trend_discussion_replies;
CREATE TRIGGER sync_trend_discussion_reply_count_delete
  AFTER DELETE ON public.trend_discussion_replies
  FOR EACH ROW EXECUTE FUNCTION public.sync_trend_discussion_reply_count();
