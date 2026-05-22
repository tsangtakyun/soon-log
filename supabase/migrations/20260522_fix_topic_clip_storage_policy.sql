DROP POLICY IF EXISTS "Authenticated upload log media" ON storage.objects;
CREATE POLICY "Authenticated upload log media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'log-media'
    AND auth.uid() IS NOT NULL
    AND (
      name LIKE 'logs/%'
      OR name LIKE 'topic-clips/%'
      OR name = 'avatars/' || auth.uid() || '.jpg'
      OR name = 'avatars/' || auth.uid() || '.jpeg'
      OR name = 'avatars/' || auth.uid() || '.png'
      OR name = 'avatars/' || auth.uid() || '.webp'
      OR name = 'avatars/' || auth.uid() || '.heic'
    )
  );
