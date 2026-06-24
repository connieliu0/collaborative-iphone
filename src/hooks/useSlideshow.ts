import { useEffect, useRef, useState } from 'react'
import { updateDisplayState, type GalleryImage } from '../lib/gallery'

const SLIDE_INTERVAL_MS = 5000

export function useSlideshow(images: GalleryImage[], broadcast = false) {
  const [index, setIndex] = useState(0)
  const lastBroadcastRef = useRef<string | null>(null)

  useEffect(() => {
    if (images.length === 0) {
      setIndex(0)
      return
    }
    if (index >= images.length) {
      setIndex(0)
    }
  }, [images.length, index])

  useEffect(() => {
    if (images.length <= 1) return

    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % images.length)
    }, SLIDE_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [images.length])

  const current = images[index] ?? null

  useEffect(() => {
    if (!broadcast) return
    const imageId = current?.id ?? null
    if (lastBroadcastRef.current === imageId) return
    lastBroadcastRef.current = imageId

    void updateDisplayState(imageId).catch((err) => {
      console.error('Failed to update display state', err)
    })
  }, [broadcast, current?.id])

  return { current, index }
}
