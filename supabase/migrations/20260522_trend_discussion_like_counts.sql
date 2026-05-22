CREATE OR REPLACE FUNCTION public.sync_trend_discussion_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.trend_discussions
    SET like_count = COALESCE(like_count, 0) + 1
    WHERE id = NEW.discussion_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE public.trend_discussions
    SET like_count = GREATEST(0, COALESCE(like_count, 0) - 1)
    WHERE id = OLD.discussion_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_trend_discussion_like_count_insert ON public.discussion_likes;
CREATE TRIGGER sync_trend_discussion_like_count_insert
  AFTER INSERT ON public.discussion_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_trend_discussion_like_count();

DROP TRIGGER IF EXISTS sync_trend_discussion_like_count_delete ON public.discussion_likes;
CREATE TRIGGER sync_trend_discussion_like_count_delete
  AFTER DELETE ON public.discussion_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_trend_discussion_like_count();
