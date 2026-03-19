import { supabase } from './supabase'

const BUCKET = 'comic-frames'

// Deletes a comic owned by the user:
// 1) remove storage objects
// 2) delete frames rows
// 3) delete comic row
export async function deleteComic(
  userId: string,
  comicId: string
): Promise<{ success: true } | { error: string }> {
  const prefix = `${userId}/${comicId}`

  // Best-effort storage cleanup. If your RLS doesn't allow storage DELETE yet,
  // we still proceed with deleting DB rows so the profile UI works.
  try {
    const { data: objects, error: listError } = await supabase.storage
      .from(BUCKET)
      .list(prefix)

    if (!listError && objects && objects.length > 0) {
      const paths = objects.map((o) => `${prefix}/${o.name}`)
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths)
      if (removeError) console.error('deleteComic: failed to remove storage objects', removeError)
    } else if (listError) {
      console.error('deleteComic: failed to list storage objects', listError)
    }
  } catch (err) {
    console.error('deleteComic: storage cleanup failed (continuing)', err)
  }

  // Delete frames (RLS requires DELETE policy for owner)
  const { error: deleteFramesError } = await supabase
    .from('frames')
    .delete()
    .eq('comic_id', comicId)

  if (deleteFramesError) return { error: deleteFramesError.message }

  // Delete comic row (requires DELETE policy for owner)
  const { error: deleteComicError } = await supabase
    .from('comics')
    .delete()
    .eq('id', comicId)
    .eq('owner_id', userId)

  if (deleteComicError) return { error: deleteComicError.message }

  return { success: true }
}

