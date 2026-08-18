import { useCallback, useEffect, useState } from 'react'
import { useGalleryImages } from '../../hooks/useGalleryImages'
import { useDisplayState } from '../../hooks/useDisplayState'
import { useSlideshow } from '../../hooks/useSlideshow'
import { supabase } from '../../lib/supabase'
import { FrameContent } from '../ComicViewerPage'

export function GalleryDisplayPage() {
  const { images, loading } = useGalleryImages()
  const { state: displayState } = useDisplayState()
  const [uploadInProgress, setUploadInProgress] = useState(false)

  const checkUploadQueue = useCallback(async () => {
    const { count, error } = await supabase
      .from('upload_queue')
      .select('*', { count: 'exact', head: true })
      .in('status', ['waiting', 'active'])

    if (error) {
      console.error('Failed to check upload queue', error)
      return
    }
    setUploadInProgress((count ?? 0) > 0)
  }, [])

  useEffect(() => {
    void checkUploadQueue()
    const channel = supabase
      .channel('display-upload-queue-pause')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'upload_queue' },
        () => {
          void checkUploadQueue()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [checkUploadQueue])

  const { current, setIndex } = useSlideshow(images, true, uploadInProgress)

  useEffect(() => {
    if (!uploadInProgress || !displayState?.current_image_id) return
    const idx = images.findIndex((img) => img.id === displayState.current_image_id)
    if (idx >= 0) setIndex(idx)
  }, [uploadInProgress, displayState?.current_image_id, images, setIndex])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <p>Loading…</p>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        <p className="text-gray-400">No images yet</p>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col text-white overflow-hidden">
      <div className="flex-1 flex flex-col items-center justify-center w-full h-full">
        <FrameContent
          frame={{
            image_url: current.image_url,
            caption: current.caption,
            overlay_x: 50,
            overlay_y: 82,
            font_size: 22,
            font_color: '#ffffff',
            font_family: 'Arial',
          }}
          variant="preview"
          showCaption={false}
          solidCaptionBackground
        />
      </div>
    </div>
  )
}
