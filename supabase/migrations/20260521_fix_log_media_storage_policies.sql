INSERT INTO storage.buckets (id, name, public)
VALUES ('log-media', 'log-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public read log media" ON storage.objects;
CREATE POLICY "Public read log media" ON storage.objects
  FOR SELECT USING (bucket_id = 'log-media');

DROP POLICY IF EXISTS "Authenticated upload log media" ON storage.objects;
CREATE POLICY "Authenticated upload log media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'log-media'
    AND auth.uid() IS NOT NULL
    AND (
      name LIKE 'logs/%'
      OR name = ('avatars/' || auth.uid()::text || '.jpg')
      OR name = ('avatars/' || auth.uid()::text || '.jpeg')
      OR name = ('avatars/' || auth.uid()::text || '.png')
      OR name = ('avatars/' || auth.uid()::text || '.webp')
      OR name = ('avatars/' || auth.uid()::text || '.heic')
    )
  );

DROP POLICY IF EXISTS "Authenticated update own avatar media" ON storage.objects;
CREATE POLICY "Authenticated update own avatar media" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'log-media'
    AND auth.uid() IS NOT NULL
    AND (
      name = ('avatars/' || auth.uid()::text || '.jpg')
      OR name = ('avatars/' || auth.uid()::text || '.jpeg')
      OR name = ('avatars/' || auth.uid()::text || '.png')
      OR name = ('avatars/' || auth.uid()::text || '.webp')
      OR name = ('avatars/' || auth.uid()::text || '.heic')
    )
  )
  WITH CHECK (
    bucket_id = 'log-media'
    AND auth.uid() IS NOT NULL
    AND (
      name = ('avatars/' || auth.uid()::text || '.jpg')
      OR name = ('avatars/' || auth.uid()::text || '.jpeg')
      OR name = ('avatars/' || auth.uid()::text || '.png')
      OR name = ('avatars/' || auth.uid()::text || '.webp')
      OR name = ('avatars/' || auth.uid()::text || '.heic')
    )
  );

DROP POLICY IF EXISTS "Authenticated delete own avatar media" ON storage.objects;
CREATE POLICY "Authenticated delete own avatar media" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'log-media'
    AND auth.uid() IS NOT NULL
    AND (
      name = ('avatars/' || auth.uid()::text || '.jpg')
      OR name = ('avatars/' || auth.uid()::text || '.jpeg')
      OR name = ('avatars/' || auth.uid()::text || '.png')
      OR name = ('avatars/' || auth.uid()::text || '.webp')
      OR name = ('avatars/' || auth.uid()::text || '.heic')
    )
  );
