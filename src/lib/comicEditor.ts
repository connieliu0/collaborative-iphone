import { supabase } from './supabase'
import type { LoadedFrame } from '../stores/useComicStore'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PUBLISHED_COMIC_ID_KEY = 'publishedComicId'
export const PUBLISHED_SLUG_KEY = 'publishedSlug'

export function readPublishedMetaFromSession(): {
  publishedComicId: string | null
  publishedSlug: string | null
} {
  if (typeof window === 'undefined') {
    return { publishedComicId: null, publishedSlug: null }
  }
  return {
    publishedComicId: window.sessionStorage.getItem(PUBLISHED_COMIC_ID_KEY),
    publishedSlug: window.sessionStorage.getItem(PUBLISHED_SLUG_KEY),
  }
}

export function writePublishedMetaToSession(comicId: string, slug: string): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(PUBLISHED_COMIC_ID_KEY, comicId)
  window.sessionStorage.setItem(PUBLISHED_SLUG_KEY, slug)
}

export function clearPublishedMetaFromSession(): void {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PUBLISHED_COMIC_ID_KEY)
  window.sessionStorage.removeItem(PUBLISHED_SLUG_KEY)
}

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
  | { comicId: string; slug: string; title: string; ownerId: string; frames: LoadedFrame[] }
  | { error: string }

export async function fetchComicForEditor(
  slugOrId: string
): Promise<FetchComicForEditorResult> {
  const id = slugOrId.trim()
  if (!id) return { error: 'Comic not found' }

  let query = supabase
    .from('comics')
    .select('id, slug, title, owner_id')

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
    .select('id, image_url, website_url, caption, overlay_x, overlay_y, font_size, font_color')
    .eq('comic_id', comic.id)
    .order('order', { ascending: true })

  if (framesError) return { error: framesError.message }
  if (!frames || frames.length === 0) return { error: 'This comic has no frames to edit' }

  return {
    comicId: comic.id,
    slug: comic.slug,
    title: comic.title || 'Comic Title',
    ownerId: comic.owner_id as string,
    frames: frames as LoadedFrame[],
  }
}
