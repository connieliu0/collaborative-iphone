import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchWhPhotos, type WhPhoto } from '../lib/whPhotos'

export function useWhPhotos(enabled = true) {
  const [photos, setPhotos] = useState<WhPhoto[]>([])
  const [loading, setLoading] = useState(enabled)

  const reload = useCallback(async () => {
    if (!enabled) return
    const data = await fetchWhPhotos()
    setPhotos(data)
    setLoading(false)
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setPhotos([])
      setLoading(false)
      return
    }
    setLoading(true)
    void reload()
  }, [enabled, reload])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel('wh-photos-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wh_photos' },
        () => {
          void reload()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, reload])

  return { photos, loading, reload }
}
