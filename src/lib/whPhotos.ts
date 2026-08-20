import { supabase } from './supabase'
import { GALLERY_BUCKET } from './gallery'

export interface WhPhoto {
  id: string
  image_url: string
  created_at: string
}

/** WordHack talk comic — montage plays on this frame only. */
export const WH_MONTAGE_COMIC_SLUG = '270203b1'
export const WH_MONTAGE_CAPTION = 'I catch myself reaching for something more'

export function isWhMontageFrame(comicSlug: string | undefined, caption: string | undefined): boolean {
  if (comicSlug !== WH_MONTAGE_COMIC_SLUG) return false
  return (caption ?? '').trim() === WH_MONTAGE_CAPTION
}

export async function fetchWhPhotos(): Promise<WhPhoto[]> {
  const { data, error } = await supabase
    .from('wh_photos')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

async function uploadWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)))
      }
    }
  }
  throw lastError
}

export async function uploadWhPhoto(file: File): Promise<WhPhoto> {
  const path = `wh/${crypto.randomUUID()}.jpg`

  await uploadWithRetry(async () => {
    const { error: uploadError } = await supabase.storage
      .from(GALLERY_BUCKET)
      .upload(path, file, { upsert: false, contentType: 'image/jpeg' })
    if (uploadError) throw uploadError
  })

  const { data: urlData } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(path)

  const data = await uploadWithRetry(async () => {
    const { data, error } = await supabase
      .from('wh_photos')
      .insert({ image_url: urlData.publicUrl })
      .select('*')
      .single()
    if (error) throw error
    return data
  })

  return data
}
