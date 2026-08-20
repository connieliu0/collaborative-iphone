-- Allow owners to overwrite their own comic frame uploads (required for upsert on re-publish).
DROP POLICY IF EXISTS "comic_frames_update_own" ON storage.objects;

CREATE POLICY "comic_frames_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'comic-frames'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'comic-frames'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
