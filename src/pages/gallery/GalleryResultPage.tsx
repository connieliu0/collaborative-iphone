import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  createPrintJob,
  fetchGalleryImage,
  fetchGalleryImages,
  fetchPrintJob,
  type GalleryImage,
} from '../../lib/gallery'
import { FrameContent } from '../ComicViewerPage'

const btn =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50'

export function GalleryResultPage() {
  const { id } = useParams<{ id: string }>()
  const [image, setImage] = useState<GalleryImage | null>(null)
  const [allImages, setAllImages] = useState<GalleryImage[]>([])
  const [printJobId, setPrintJobId] = useState<string | null>(null)
  const [printStatus, setPrintStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    if (!id) return
    void (async () => {
      const [img, imgs] = await Promise.all([fetchGalleryImage(id), fetchGalleryImages()])
      setImage(img)
      setAllImages(imgs)
    })()
  }, [id])

  useEffect(() => {
    if (!printJobId) return

    const poll = async () => {
      const job = await fetchPrintJob(printJobId)
      if (!job) return
      setPrintStatus(job.status)
    }

    void poll()
    const interval = setInterval(poll, 2000)

    const channel = supabase
      .channel(`print-job-${printJobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'print_jobs',
          filter: `id=eq.${printJobId}`,
        },
        (payload) => {
          const status = (payload.new as { status: string }).status
          setPrintStatus(status)
        }
      )
      .subscribe()

    return () => {
      clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [printJobId])

  const getPrintSequence = useCallback((): string[] => {
    if (!image) return []
    const sorted = [...allImages].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((img) => img.id === image.id)
    if (idx === -1) return [image.id]

    const before = sorted[idx - 1]
    const after = sorted[idx + 1]
    const ids: string[] = []
    if (before) ids.push(before.id)
    ids.push(image.id)
    if (after) ids.push(after.id)
    return ids
  }, [image, allImages])

  const handlePrint = async () => {
    if (!image) return
    setPrinting(true)
    setError(null)
    try {
      const imageIds = getPrintSequence()
      const jobId = await createPrintJob(imageIds)
      setPrintJobId(jobId)
      setPrintStatus('pending')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue print')
    } finally {
      setPrinting(false)
    }
  }

  if (!image) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">
      <div className="aspect-[4/3] w-full rounded overflow-hidden border border-gray-200">
        <FrameContent
          frame={{
            image_url: image.image_url,
            caption: image.caption,
            overlay_x: 50,
            overlay_y: 87,
            font_size: 18,
            font_color: '#ffffff',
          }}
          showCaption={false}
        />
      </div>

      <button
        type="button"
        className={btn + ' w-full'}
        disabled={printing || printStatus === 'pending' || printStatus === 'printing'}
        onClick={handlePrint}
      >
        {printStatus === 'done'
          ? 'Printed'
          : printStatus === 'pending' || printStatus === 'printing'
            ? 'Printing…'
            : printing
              ? 'Queuing…'
              : 'Print'}
      </button>

      {printStatus === 'done' && (
        <p className="text-sm text-green-700 text-center">Done!</p>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Link to="/gallery/upload" className="text-sm text-center text-gray-600 underline">
        Add another
      </Link>
    </div>
  )
}
