import { supabase } from './supabase'
import type { ComicFrame } from '../stores/useComicStore'

const BUCKET = 'comic-frames'
const MAX_FRAMES_CAP = 24

function getFileExtension(file: File): string {
  const name = file.name
  const lastDot = name.lastIndexOf('.')
  if (lastDot === -1) return '.png'
  const ext = name.slice(lastDot).toLowerCase()
  return /\.(jpe?g|png|gif|webp)$/.test(ext) ? ext : '.png'
}

export type PublishResult = { slug: string } | { error: string }

export interface PublishOptions {
  mode: 'solo' | 'collab'
  /** Collaborator user IDs (max 5). Turn order is [owner, ...collaboratorIds]. */
  collaboratorIds?: string[]
  /** For collab: total frame cap. Default turn_order.length * 3, max 24. */
  maxFrames?: number
}

export async function publishComic(
  userId: string,
  frames: ComicFrame[],
  options: PublishOptions = { mode: 'solo' }
): Promise<PublishResult> {
  if (frames.length === 0) {
    return { error: 'No frames to publish' }
  }

  const slug = crypto.randomUUID().slice(0, 8)
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
    title: 'Untitled',
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
    return { error: comicError.message }
  }

  const comicId = (comicRow as { id: string }).id

  const uploadedUrls: string[] = []

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const file = frame.imageFile
    if (!file) {
      return { error: `Frame ${i + 1} has no image file` }
    }

    const ext = getFileExtension(file)
    const path = `${userId}/${comicId}/${frame.id}${ext}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type || 'image/png',
        upsert: false,
      })

    if (uploadError) {
      return { error: uploadError.message }
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    uploadedUrls.push(urlData.publicUrl)
  }

  const framesRows = frames.map((frame, index) => ({
    comic_id: comicId,
    order: index,
    image_url: uploadedUrls[index],
    caption: frame.caption,
    overlay_text: frame.overlayText,
    overlay_x: frame.overlayPosition.x,
    overlay_y: frame.overlayPosition.y,
    font_size: frame.fontSize,
    font_color: frame.fontColor,
  }))

  const { error: framesError } = await supabase.from('frames').insert(framesRows)

  if (framesError) {
    return { error: framesError.message }
  }

  return { slug }
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
  overlayText: string
  overlay_x: number
  overlay_y: number
  font_size: number
  font_color: string
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
    overlay_text: payload.overlayText,
    overlay_x: payload.overlay_x,
    overlay_y: payload.overlay_y,
    font_size: payload.font_size,
    font_color: payload.font_color,
  })

  if (insertError) return { error: insertError.message }

  const newCount = currentFrameCount + 1
  const maxFrames = comic.max_frames ?? 24
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
