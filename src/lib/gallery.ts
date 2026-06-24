import { supabase } from './supabase'

export const GALLERY_BUCKET = 'gallery-images'

export type UploadQueueStatus = 'waiting' | 'active' | 'confirmed' | 'cancelled'
export type PrintJobStatus = 'pending' | 'printing' | 'done' | 'failed'

export interface GalleryImage {
  id: string
  image_url: string
  caption: string
  position: number
  inserted_after_id: string | null
  created_at: string
}

export interface DisplayState {
  id: number
  current_image_id: string | null
  updated_at: string
}

export interface UploadQueueEntry {
  id: string
  user_session_id: string
  staged_image_url: string
  insert_after_id: string | null
  status: UploadQueueStatus
  active_at: string | null
  created_at: string
}

export interface PrintJob {
  id: string
  image_ids: string[]
  status: PrintJobStatus
  created_at: string
}

const SESSION_KEY = 'gallery-print-session-id'

export function getUserSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export async function fetchGalleryImages(): Promise<GalleryImage[]> {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('*')
    .order('position', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchGalleryImage(id: string): Promise<GalleryImage | null> {
  const { data, error } = await supabase
    .from('gallery_images')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function fetchDisplayState(): Promise<DisplayState | null> {
  const { data, error } = await supabase
    .from('display_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateDisplayState(currentImageId: string | null): Promise<void> {
  const { error } = await supabase
    .from('display_state')
    .update({ current_image_id: currentImageId, updated_at: new Date().toISOString() })
    .eq('id', 1)

  if (error) throw error
}

export async function uploadStagedImage(file: File, sessionId: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `staged/${sessionId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(GALLERY_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' })

  if (uploadError) throw uploadError

  const { data } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function joinUploadQueue(
  sessionId: string,
  stagedUrl: string
): Promise<UploadQueueEntry> {
  const { data, error } = await supabase.rpc('join_upload_queue', {
    p_session_id: sessionId,
    p_staged_url: stagedUrl,
  })

  if (error) throw error
  return data as UploadQueueEntry
}

export async function confirmGalleryUpload(
  queueId: string,
  insertAfterId: string | null,
  caption: string
): Promise<GalleryImage> {
  const { data, error } = await supabase.rpc('confirm_gallery_upload', {
    p_queue_id: queueId,
    p_insert_after_id: insertAfterId,
    p_caption: caption,
  })

  if (error) throw error
  return data as GalleryImage
}

export async function cancelQueueEntry(queueId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_queue_entry', {
    p_queue_id: queueId,
  })

  if (error) throw error
}

export async function fetchActiveQueueForSession(
  sessionId: string
): Promise<UploadQueueEntry | null> {
  const { data, error } = await supabase
    .from('upload_queue')
    .select('*')
    .eq('user_session_id', sessionId)
    .in('status', ['waiting', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function countPeopleAhead(entry: UploadQueueEntry): Promise<number> {
  const { count: waitingBefore, error: waitingError } = await supabase
    .from('upload_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .lt('created_at', entry.created_at)

  if (waitingError) throw waitingError

  const { count: activeCount, error: activeError } = await supabase
    .from('upload_queue')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active')

  if (activeError) throw activeError

  return (waitingBefore ?? 0) + (activeCount ?? 0)
}

export function getNeighborImages(
  images: GalleryImage[],
  insertAfterId: string | null
): { before: GalleryImage | null; after: GalleryImage | null } {
  if (!insertAfterId) {
    return { before: null, after: images[0] ?? null }
  }

  const afterIndex = images.findIndex((img) => img.id === insertAfterId)
  if (afterIndex === -1) {
    return { before: null, after: null }
  }

  const before = images[afterIndex] ?? null
  const after = images[afterIndex + 1] ?? null
  return { before, after }
}

export async function createPrintJob(imageIds: string[]): Promise<string> {
  const { data, error } = await supabase
    .from('print_jobs')
    .insert({ image_ids: imageIds })
    .select('id')
    .single()

  if (error) throw error
  return data.id
}

export async function fetchPrintJob(id: string): Promise<PrintJob | null> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function generateCaption(params: {
  uploadedImageUrl: string
  beforeImageUrl?: string | null
  afterImageUrl?: string | null
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('generate-caption', {
    body: params,
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  if (!data?.caption) throw new Error('No caption returned')
  return data.caption as string
}
