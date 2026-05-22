CREATE OR REPLACE FUNCTION public.is_topic_room_member(target_room_id uuid, target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.topic_room_members
    WHERE room_id = target_room_id
      AND user_id = target_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_topic_room_owner(target_room_id uuid, target_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.topic_rooms
    WHERE id = target_room_id
      AND owner_id = target_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_topic_room_open(target_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.topic_rooms
    WHERE id = target_room_id
      AND privacy = 'open'
  );
$$;

REVOKE ALL ON FUNCTION public.is_topic_room_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_topic_room_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_topic_room_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_topic_room_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_topic_room_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_topic_room_open(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Open rooms public read" ON topic_rooms;
CREATE POLICY "Open rooms public read" ON topic_rooms
  FOR SELECT USING (
    privacy = 'open'
    OR owner_id = auth.uid()
    OR public.is_topic_room_member(id)
  );

DROP POLICY IF EXISTS "Member read" ON topic_room_members;
CREATE POLICY "Member read" ON topic_room_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_topic_room_open(room_id)
    OR public.is_topic_room_member(room_id)
  );

DROP POLICY IF EXISTS "Owner remove members" ON topic_room_members;
CREATE POLICY "Owner remove members" ON topic_room_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR public.is_topic_room_owner(room_id)
  );

DROP POLICY IF EXISTS "Room members read clips" ON topic_clips;
CREATE POLICY "Room members read clips" ON topic_clips
  FOR SELECT USING (
    public.is_topic_room_open(room_id)
    OR public.is_topic_room_member(room_id)
  );

DROP POLICY IF EXISTS "Member add clips" ON topic_clips;
CREATE POLICY "Member add clips" ON topic_clips
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND public.is_topic_room_member(room_id)
  );
