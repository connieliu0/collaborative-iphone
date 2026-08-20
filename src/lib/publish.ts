import { supabase } from './supabase'
import { MAX_FRAMES, type ComicFrame } from '../stores/useComicStore'

const BUCKET = 'comic-frames'
const MAX_FRAMES_CAP = MAX_FRAMES

function getFileExtension(file: File): string {
  if (/^image\/(heic|heif)/i.test(file.type)) return '.jpg'
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  if (lastDot === -1) return '.png'
  const ext = name.slice(lastDot).toLowerCase()
  if (/\.heic$/i.test(ext)) return '.jpg'
  return /\.(jpe?g|png|gif|webp)$/.test(ext) ? ext : '.png'
}

/** Convert a data URL (e.g. from legacy localStorage draft) to a File for upload. */
function dataUrlToFile(dataUrl: string, filename: string): File | null {
  if (!dataUrl.startsWith('data:')) return null
  const [header, base64] = dataUrl.split(',', 2)
  if (!base64) return null
  const mimeMatch = header.match(/^data:([^;]+)/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new File([bytes], filename, { type: mime })
  } catch {
    return null
  }
}

/** Convert a blob URL (e.g. from IndexedDB-restored draft) to a File for upload. */
async function blobUrlToFile(blobUrl: string, filename: string): Promise<File | null> {
  if (!blobUrl.startsWith('blob:')) return null
  try {
    const res = await fetch(blobUrl)
    const blob = await res.blob()
    const mime = blob.type || 'image/png'
    return new File([blob], filename, { type: mime })
  } catch {
    return null
  }
}

function isRemoteImageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function storageObjectNameFromPublicUrl(url: string): string | null {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : null
  } catch {
    return null
  }
}

async function getFrameUploadFile(frame: ComicFrame): Promise<File | null> {
  if (frame.imageFile) return frame.imageFile
  const filename = `frame-${frame.id}.png`
  if (frame.imageUrl.startsWith('data:')) {
    return dataUrlToFile(frame.imageUrl, filename)
  }
  if (frame.imageUrl.startsWith('blob:')) {
    return blobUrlToFile(frame.imageUrl, filename)
  }
  return null
}

export type PublishResult = { slug: string; comicId: string; uploadedUrls: string[] } | { error: string }

export interface PublishOptions {
  mode: 'solo' | 'collab'
  title?: string
  /** Collaborator user IDs (max 5). Turn order is [owner, ...collaboratorIds]. */
  collaboratorIds?: string[]
  /** For collab: total frame cap. Default turn_order.length * 3, max MAX_FRAMES. */
  maxFrames?: number
}

export async function publishComic(
  userId: string,
  frames: ComicFrame[],
  options: PublishOptions = { mode: 'solo' }
): Promise<PublishResult> {
  // Filter out completely empty frames (no image, no website, no caption)
  const framesWithContent = frames.filter((f) => f.imageUrl || f.websiteUrl || f.caption.trim())
  
  if (framesWithContent.length === 0) {
    return { error: 'No frames to publish' }
  }
  
  // Use filtered frames for publishing
  frames = framesWithContent

  const slug = crypto.randomUUID().slice(0, 8)
  const title = options.title?.trim() || 'Comic Title'
  const isCollab = options.mode === 'collab'
  const collaboratorIds = options.collaboratorIds ?? []
  const turnOrder = [userId, ...collaboratorIds]
  const maxFrames = options.maxFrames ?? Math.min(
    Math.max(turnOrder.length * 3, 1),
    MAX_FRAMES_CAP
  )
  const currentTurnUserId = isCollab
    ? (collaboratorIds[0] ?? userId)
    : null

  const insertPayload: Record<string, unknown> = {
    slug,
    owner_id: userId,
    title,
    status: isCollab ? 'in_progress' : 'complete',
    mode: options.mode,
  }
  if (isCollab) {
    insertPayload.current_turn_user_id = currentTurnUserId
    insertPayload.turn_order = turnOrder
    insertPayload.max_frames = Math.min(maxFrames, MAX_FRAMES_CAP)
  }

  const { data: comicRow, error: comicError } = await supabase
    .from('comics')
    .insert(insertPayload)
    .select('id')
    .single()

  if (comicError) {
    console.error('publishComic: failed to insert comic', {
      userId,
      insertPayload,
      error: comicError,
    })
    return { error: comicError.message }
  }

  if (!comicRow || !(comicRow as { id?: string }).id) {
    // Some RLS configurations can cause a "no row returned" situation without a useful error.
    console.error('publishComic: comic insert returned no row', {
      userId,
      insertPayload,
      comicRow,
    })
    return {
      error:
        'Failed to create comic record. Check Supabase RLS/policies (inserts may be blocked).',
    }
  }

  const comicId = (comicRow as { id: string }).id

  // Prepare all files first (parallel) - skip frames without images
  const fileResults = await Promise.all(
    frames.map(async (frame, i) => {
      // Frames without images (website embeds or text-only) don't need upload
      const hasImage = frame.imageFile || frame.imageUrl
      
      if (!hasImage) {
        return { index: i, file: null, noImageNeeded: true }
      }
      const file = await getFrameUploadFile(frame)
      // Allow frames with any content (caption or website URL) even if image file can't be retrieved
      if (!file && (frame.caption.trim() || frame.websiteUrl)) {
        return { index: i, file: null, noImageNeeded: true }
      }
      return { index: i, file, noImageNeeded: false }
    })
  )
  const missingFile = fileResults.find((r) => !r.file && !r.noImageNeeded)
  if (missingFile) {
    return { error: `Frame ${missingFile.index + 1} has no image file` }
  }

  // Upload in parallel batches for speed
  const BATCH_SIZE = 5
  const uploadedUrls: string[] = new Array(frames.length)

  // First, fill in empty strings for frames without images
  for (const { index, noImageNeeded } of fileResults) {
    if (noImageNeeded) {
      uploadedUrls[index] = ''
    }
  }

  // Then upload frames with images in batches
  const toUpload = fileResults.filter((r) => r.file)
  for (let batchStart = 0; batchStart < toUpload.length; batchStart += BATCH_SIZE) {
    const batch = toUpload.slice(batchStart, batchStart + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async ({ index, file }) => {
        const frame = frames[index]
        const ext = getFileExtension(file!)
        const path = `${userId}/${comicId}/${frame.id}${ext}`

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file!, {
            contentType: file!.type || 'image/png',
            upsert: false,
          })

        if (uploadError) {
          return { index, error: uploadError.message }
        }

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        return { index, url: urlData.publicUrl }
      })
    )

    for (const result of results) {
      if ('error' in result) {
        return { error: result.error! }
      }
      uploadedUrls[result.index] = result.url!
    }
  }

  const framesRows = frames.map((frame, index) => ({
    comic_id: comicId,
    order: index,
    image_url: uploadedUrls[index],
    caption: frame.caption,
    overlay_x: frame.overlayPosition.x,
    overlay_y: frame.overlayPosition.y,
    font_size: frame.fontSize,
    font_color: frame.fontColor,
    website_url: frame.websiteUrl ?? null,
  }))

  const { error: framesError } = await supabase.from('frames').insert(framesRows)

  if (framesError) {
    return { error: framesError.message }
  }

  return { slug, comicId, uploadedUrls }
}

type FrameInsertRow = {
  comic_id: string
  order: number
  image_url: string
  caption: string
  overlay_x: number
  overlay_y: number
  font_size: number
  font_color: string
  website_url: string | null
}

/** Update existing frames in order; insert extras; delete leftovers. Never reuses client IDs. */
async function replaceComicFrames(
  comicId: string,
  rows: FrameInsertRow[]
): Promise<{ error?: string }> {
  const { data: existing, error: existingError } = await supabase
    .from('frames')
    .select('id')
    .eq('comic_id', comicId)
    .order('order', { ascending: true })

  if (existingError) {
    return { error: existingError.message }
  }

  const existingIds = (existing ?? []).map((row) => row.id as string)
  const overlap = Math.min(existingIds.length, rows.length)

  if (overlap > 0) {
    const updates = await Promise.all(
      rows.slice(0, overlap).map(async (row, i) => {
        const { data, error } = await supabase
          .from('frames')
          .update(row)
          .eq('id', existingIds[i])
          .select('id')
        if (error) return { error: error.message }
        if (!data?.length) {
          return { error: `Failed to update frame ${i + 1} (no rows affected — check ownership)` }
        }
        return {}
      })
    )
    const failed = updates.find((result) => 'error' in result && result.error)
    if (failed && 'error' in failed) return { error: failed.error! }
  }

  if (rows.length > existingIds.length) {
    const { error } = await supabase.from('frames').insert(rows.slice(existingIds.length))
    if (error) return { error: error.message }
  }

  if (existingIds.length > rows.length) {
    const { error } = await supabase
      .from('frames')
      .delete()
      .in('id', existingIds.slice(rows.length))
    if (error) return { error: error.message }
  }

  return {}
}

/** Re-publish into an existing comic (solo). Updates frames in place + replaces storage objects. */
export async function updateComic(
  comicId: string,
  userId: string,
  frames: ComicFrame[],
  title?: string
): Promise<PublishResult> {
  // Filter out completely empty frames (no image, no website, no caption)
  const framesWithContent = frames.filter((f) => f.imageUrl || f.websiteUrl || f.caption.trim())
  
  if (framesWithContent.length === 0) return { error: 'No frames to publish' }
  
  // Use filtered frames for publishing
  frames = framesWithContent

  const { data: comicRow, error: comicError } = await supabase
    .from('comics')
    .select('id, slug')
    .eq('id', comicId)
    .maybeSingle()

  if (comicError) {
    console.error('updateComic: failed to load comic', { comicId, userId, error: comicError })
    return { error: comicError.message }
  }

  if (!comicRow) {
    return { error: 'Comic not found. It may have been deleted. Please create a new comic instead.' }
  }

  const slug = comicRow.slug as string
  const prefix = `${userId}/${comicId}`

  // Prepare files and identify which need uploading (parallel)
  const preparedFrames = await Promise.all(
    frames.map(async (frame, i) => {
      // Frames without images (website embeds or text-only) don't need upload
      const hasImage = frame.imageFile || frame.imageUrl
      if (!hasImage) {
        return { index: i, noImageNeeded: true }
      }
      if (!frame.imageFile && isRemoteImageUrl(frame.imageUrl)) {
        return { index: i, existingUrl: frame.imageUrl }
      }
      const file = await getFrameUploadFile(frame)
      // Allow frames with any content (caption or website URL) even if image file can't be retrieved
      if (!file && (frame.caption.trim() || frame.websiteUrl)) {
        return { index: i, noImageNeeded: true }
      }
      return { index: i, file, frame }
    })
  )

  const missingFileIndex = preparedFrames.findIndex((p) => {
    const hasExisting = 'existingUrl' in p && p.existingUrl
    const hasFile = 'file' in p && p.file
    const noImageNeeded = 'noImageNeeded' in p && p.noImageNeeded
    return !hasExisting && !hasFile && !noImageNeeded
  })
  if (missingFileIndex !== -1) {
    return { error: `Frame ${missingFileIndex + 1} has no image file` }
  }

  // Upload new files in parallel batches
  const BATCH_SIZE = 5
  const uploadedUrls: string[] = new Array(frames.length)

  // First, fill in existing URLs and empty strings for frames without images
  for (const p of preparedFrames) {
    if ('existingUrl' in p && p.existingUrl) {
      uploadedUrls[p.index] = p.existingUrl
    } else if ('noImageNeeded' in p && p.noImageNeeded) {
      uploadedUrls[p.index] = ''
    }
  }

  // Then upload new files in batches
  const toUpload = preparedFrames.filter((p) => 'file' in p && p.file)
  for (let batchStart = 0; batchStart < toUpload.length; batchStart += BATCH_SIZE) {
    const batch = toUpload.slice(batchStart, batchStart + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async ({ index, file, frame }) => {
        const ext = getFileExtension(file!)
        const path = `${userId}/${comicId}/${frame!.id}${ext}`
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file!, {
          contentType: file!.type || 'image/png',
          upsert: true,
        })
        if (uploadError) return { index, error: uploadError.message }

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        return { index, url: urlData.publicUrl }
      })
    )

    for (const result of results) {
      if ('error' in result) {
        return { error: result.error! }
      }
      uploadedUrls[result.index] = result.url!
    }
  }

  const framesRows: FrameInsertRow[] = frames.map((frame, index) => ({
    comic_id: comicId,
    order: index,
    image_url: uploadedUrls[index],
    caption: frame.caption,
    overlay_x: frame.overlayPosition.x,
    overlay_y: frame.overlayPosition.y,
    font_size: frame.fontSize,
    font_color: frame.fontColor,
    website_url: frame.websiteUrl ?? null,
  }))

  const replaceResult = await replaceComicFrames(comicId, framesRows)
  if (replaceResult.error) {
    console.error('updateComic: failed to replace frames', { comicId, userId, error: replaceResult.error })
    return { error: replaceResult.error }
  }

  // Ensure comic is marked complete for solo.
  const { data: updatedComicRows, error: updateComicError } = await supabase
    .from('comics')
    .update({
      title: title?.trim() || 'Comic Title',
      status: 'complete',
      current_turn_user_id: null,
      mode: 'solo',
    })
    .eq('id', comicId)
    .eq('owner_id', userId)
    .select('id')

  if (updateComicError) {
    console.error('updateComic: failed to update comic status', { comicId, userId, error: updateComicError })
    return { error: updateComicError.message }
  }
  if (!updatedComicRows?.length) {
    return { error: 'Failed to update comic (you may not be the owner)' }
  }

  const keepNames = new Set(
    uploadedUrls
      .map(storageObjectNameFromPublicUrl)
      .filter((name): name is string => Boolean(name))
  )
  const { data: objects, error: listError } = await supabase.storage.from(BUCKET).list(prefix)
  if (listError) {
    console.error('updateComic: failed to list leftover storage objects', { prefix, error: listError })
  } else {
    const orphanPaths = (objects ?? [])
      .map((object) => object.name)
      .filter((name) => name && !keepNames.has(name))
      .map((name) => `${prefix}/${name}`)
    if (orphanPaths.length > 0) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(orphanPaths)
      if (removeError) {
        console.error('updateComic: failed to remove leftover storage objects', {
          prefix,
          error: removeError,
        })
      }
    }
  }

  return { slug, comicId, uploadedUrls }
}

/** Update a collab comic's turn_order and current turn after inviting collaborators. */
export async function updateComicCollaborators(
  comicId: string,
  ownerId: string,
  collaboratorIds: string[]
): Promise<{ error?: string }> {
  const turnOrder = [ownerId, ...collaboratorIds]
  const maxFrames = Math.min(Math.max(turnOrder.length * 3, 1), MAX_FRAMES_CAP)
  const currentTurnUserId = collaboratorIds[0] ?? ownerId

  const { error } = await supabase
    .from('comics')
    .update({
      turn_order: turnOrder,
      current_turn_user_id: currentTurnUserId,
      max_frames: maxFrames,
    })
    .eq('id', comicId)
    .eq('owner_id', ownerId)

  if (error) return { error: error.message }
  return {}
}

export interface AddFramePayload {
  imageFile: File
  caption: string
  overlay_x: number
  overlay_y: number
  font_size: number
  font_color: string
  website_url?: string
}

/** Insert one frame and advance turn or complete comic. */
export async function addFrameToComic(
  comicId: string,
  userId: string,
  payload: AddFramePayload,
  comic: {
    owner_id: string
    turn_order: string[]
    current_turn_user_id: string | null
    max_frames: number | null
  },
  currentFrameCount: number
): Promise<{ error?: string }> {
  const order = currentFrameCount
  const frameId = crypto.randomUUID()
  const ext = getFileExtension(payload.imageFile)
  const path = `${userId}/${comicId}/${frameId}${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, payload.imageFile, {
      contentType: payload.imageFile.type || 'image/png',
      upsert: false,
    })

  if (uploadError) return { error: uploadError.message }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const imageUrl = urlData.publicUrl

  const { error: insertError } = await supabase.from('frames').insert({
    id: frameId,
    comic_id: comicId,
    order,
    image_url: imageUrl,
    caption: payload.caption,
    overlay_x: payload.overlay_x,
    overlay_y: payload.overlay_y,
    font_size: payload.font_size,
    font_color: payload.font_color,
    website_url: payload.website_url ?? null,
  })

  if (insertError) return { error: insertError.message }

  const newCount = currentFrameCount + 1
  const maxFrames = comic.max_frames ?? MAX_FRAMES_CAP
  const turnOrder = comic.turn_order ?? [comic.owner_id]
  const ownerId = comic.owner_id

  if (newCount >= maxFrames) {
    const { error: updateErr } = await supabase
      .from('comics')
      .update({ status: 'complete', current_turn_user_id: null })
      .eq('id', comicId)
    if (updateErr) return { error: updateErr.message }
    return {}
  }

  const currentIndex = turnOrder.findIndex((id) => id === comic.current_turn_user_id)
  let nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % turnOrder.length
  while (turnOrder[nextIndex] === ownerId && nextIndex !== currentIndex) {
    nextIndex = (nextIndex + 1) % turnOrder.length
  }
  const nextTurnUserId = turnOrder[nextIndex] === ownerId ? null : turnOrder[nextIndex]

  const updatePayload: Record<string, unknown> = { current_turn_user_id: nextTurnUserId }
  if (nextTurnUserId === null) updatePayload.status = 'complete'

  const { error: updateErr } = await supabase
    .from('comics')
    .update(updatePayload)
    .eq('id', comicId)

  if (updateErr) return { error: updateErr.message }
  return {}
}

/** Set comic status to complete (owner only). */
export async function endComic(comicId: string, ownerId: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('comics')
    .update({ status: 'complete', current_turn_user_id: null })
    .eq('id', comicId)
    .eq('owner_id', ownerId)
  if (error) return { error: error.message }
  return {}
}
