import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface ComicRow {
  id: string
  slug: string
  title: string
  owner_id: string
  status: string
  created_at: string
  mode?: 'solo' | 'collab'
  current_turn_user_id?: string | null
  turn_order?: string[]
  max_frames?: number | null
}

export interface FrameRow {
  id: string
  comic_id: string
  order: number
  image_url: string
  caption: string
  overlay_x: number
  overlay_y: number
  font_size: number
  font_color: string
}

export interface UseComicResult {
  comic: ComicRow | null
  frames: FrameRow[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useComic(id: string | undefined): UseComicResult {
  const [comic, setComic] = useState<ComicRow | null>(null)
  const [frames, setFrames] = useState<FrameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchComicAndFrames = useCallback(async (comicId: string) => {
    setLoading(true)
    setError(null)

    try {
      let query = supabase
        .from('comics')
        .select('id, slug, title, owner_id, status, created_at, mode, current_turn_user_id, turn_order, max_frames')

      if (UUID_RE.test(comicId)) {
        query = query.or(`id.eq.${comicId},slug.eq.${comicId}`)
      } else {
        query = query.eq('slug', comicId)
      }

      const { data: comicData, error: comicError } = await query.maybeSingle()

      if (comicError) {
        setError(comicError.message)
        setComic(null)
        setFrames([])
        return
      }

      if (!comicData) {
        setError('Comic not found')
        setComic(null)
        setFrames([])
        return
      }

      setComic(comicData as ComicRow)

      const { data: framesData, error: framesError } = await supabase
        .from('frames')
        .select('id, comic_id, order, image_url, caption, overlay_x, overlay_y, font_size, font_color')
        .eq('comic_id', comicData.id)
        .order('order', { ascending: true })

      if (framesError) {
        setError(framesError.message)
        setFrames([])
        return
      }

      setFrames((framesData ?? []) as FrameRow[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!id?.trim()) {
      setLoading(false)
      setError('Comic not found')
      setComic(null)
      setFrames([])
      return
    }
    fetchComicAndFrames(id.trim())
  }, [id, fetchComicAndFrames])

  const refetch = useCallback(async () => {
    if (id?.trim()) await fetchComicAndFrames(id.trim())
  }, [id, fetchComicAndFrames])

  return { comic, frames, loading, error, refetch }
}
