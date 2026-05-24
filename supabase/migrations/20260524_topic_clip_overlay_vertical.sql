ALTER TABLE topic_clips
  ADD COLUMN IF NOT EXISTS overlay_vertical text DEFAULT 'middle'
  CHECK (overlay_vertical IN ('top', 'middle', 'bottom'));

NOTIFY pgrst, 'reload schema';
