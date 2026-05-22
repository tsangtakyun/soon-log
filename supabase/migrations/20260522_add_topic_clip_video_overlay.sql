ALTER TABLE topic_clips
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS time_str text,
  ADD COLUMN IF NOT EXISTS date_str text,
  ADD COLUMN IF NOT EXISTS caption_align text DEFAULT 'center',
  ADD COLUMN IF NOT EXISTS text_size text DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS background_color text DEFAULT 'black';

NOTIFY pgrst, 'reload schema';
