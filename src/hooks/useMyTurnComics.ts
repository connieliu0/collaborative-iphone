import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface MyTurnComic {
  id: string
  slug: string
  title: string
}

export function useMyTurnComics(userId: string | undefined): {
  comics: MyTurnComic[]
  loading: boolean
  refetch: () => Promise<void>
} {
  const [comics, setComics] = useState<MyTurnComic[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!userId) {
      setComics([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('comics')
      .select('id, slug, title')
      .eq('current_turn_user_id', userId)
      .eq('status', 'in_progress')
    setLoading(false)
    if (error) {
      setComics([])
      return
    }
    setComics((data ?? []) as MyTurnComic[])
  }, [userId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { comics, loading, refetch }
}
