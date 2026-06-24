import { useGalleryImages } from '../../hooks/useGalleryImages'
import { useSlideshow } from '../../hooks/useSlideshow'
import { FrameContent } from '../ComicViewerPage'

export function GalleryDisplayPage() {
  const { images, loading } = useGalleryImages()
  const { current } = useSlideshow(images, true)

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
            overlay_y: 87,
            font_size: 22,
            font_color: '#ffffff',
          }}
          variant="preview"
          showCaption={false}
        />
      </div>
    </div>
  )
}
