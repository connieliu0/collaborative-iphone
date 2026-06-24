import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchGalleryImages, type GalleryImage } from '../lib/gallery'

export function useGalleryImages() {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const data = await fetchGalleryImages()
    setImages(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const channel = supabase
      .channel('gallery-images-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gallery_images' },
        () => {
          void reload()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [reload])

  return { images, loading, reload }
}
