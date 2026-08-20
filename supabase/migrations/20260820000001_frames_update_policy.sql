-- Add UPDATE policy for frames table
-- Allows comic owner to update frames
CREATE POLICY frames_update_owner
  ON frames
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM comics c
      WHERE c.id = frames.comic_id
        AND c.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM comics c
      WHERE c.id = frames.comic_id
        AND c.owner_id = auth.uid()
    )
  );

-- Add DELETE policy for frames table while we're at it
-- Allows comic owner to delete frames
CREATE POLICY frames_delete_owner
  ON frames
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM comics c
      WHERE c.id = frames.comic_id
        AND c.owner_id = auth.uid()
    )
  );
