UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime'
  ],
  file_size_limit = 104857600
WHERE id = 'log-media';
