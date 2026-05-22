DROP POLICY IF EXISTS "Owner read own clips" ON topic_clips;

CREATE POLICY "Owner read own clips" ON topic_clips
  FOR SELECT USING (
    auth.uid() = user_id OR
    room_id IN (
      SELECT id FROM topic_rooms WHERE privacy = 'open'
    ) OR
    room_id IN (
      SELECT room_id FROM topic_room_members
      WHERE user_id = auth.uid()
    )
  );
