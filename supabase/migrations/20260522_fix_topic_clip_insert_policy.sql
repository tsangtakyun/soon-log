CREATE OR REPLACE FUNCTION public.can_add_topic_clip(target_room_id uuid, target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.is_topic_room_member(target_room_id, target_user_id)
    OR public.is_topic_room_owner(target_room_id, target_user_id);
$$;

REVOKE ALL ON FUNCTION public.can_add_topic_clip(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_add_topic_clip(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Member add clips" ON topic_clips;
CREATE POLICY "Member add clips" ON topic_clips
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.can_add_topic_clip(room_id)
  );
