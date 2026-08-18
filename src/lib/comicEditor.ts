import { supabase } from './supabase'
import type { LoadedFrame } from '../stores/useComicStore'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function createPagePath(comicSlug?: string | null, view?: string): string {
  const params = new URLSearchParams()
  if (comicSlug) params.set('comic', comicSlug)
  if (view && view !== 'grid') params.set('view', view)
  const qs = params.toString()
  return qs ? `/create?${qs}` : '/create'
}

export function editPagePath(frameId: string, comicSlug?: string | null): string {
  const params = new URLSearchParams({ frame: frameId })
  if (comicSlug) params.set('comic', comicSlug)
  return `/edit?${params.toString()}`
}

export type FetchComicForEditorResult =
  | { comicId: string; slug: string; title: string; frames: LoadedFrame[] }
  | { error: string }

export async function fetchComicForEditor(
  slugOrId: string
): Promise<FetchComicForEditorResult> {
  const id = slugOrId.trim()
  if (!id) return { error: 'Comic not found' }

  let query = supabase
    .from('comics')
    .select('id, slug, title')

  if (UUID_RE.test(id)) {
    query = query.or(`id.eq.${id},slug.eq.${id}`)
  } else {
    query = query.eq('slug', id)
  }

  const { data: comic, error: comicError } = await query.maybeSingle()
  if (comicError) return { error: comicError.message }
  if (!comic) return { error: 'Comic not found' }

  const { data: frames, error: framesError } = await supabase
    .from('frames')
    .select('id, image_url, caption, overlay_x, overlay_y, font_size, font_color')
    .eq('comic_id', comic.id)
    .order('order', { ascending: true })

  if (framesError) return { error: framesError.message }
  if (!frames || frames.length === 0) return { error: 'This comic has no frames to edit' }

  return {
    comicId: comic.id,
    slug: comic.slug,
    title: comic.title || 'Comic Title',
    frames: frames as LoadedFrame[],
  }
}
