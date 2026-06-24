import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { supabase } from '../../lib/supabase'
import {
  createPrintJob,
  fetchGalleryImage,
  fetchGalleryImages,
  fetchPrintJob,
  getUserSessionId,
  uploadComposedImage,
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
  const [printProgress, setPrintProgress] = useState('')
  const renderContainerRef = useRef<HTMLDivElement>(null)

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

  const getPrintSequence = useCallback((): GalleryImage[] => {
    if (!image) return []
    const sorted = [...allImages].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((img) => img.id === image.id)
    if (idx === -1) return [image]

    const before = sorted[idx - 1]
    const after = sorted[idx + 1]
    const sequence: GalleryImage[] = []
    if (before) sequence.push(before)
    sequence.push(image)
    if (after) sequence.push(after)
    return sequence
  }, [image, allImages])

  const renderFrameToBlob = async (galleryImage: GalleryImage): Promise<Blob> => {
    const container = renderContainerRef.current
    if (!container) throw new Error('Render container not found')

    container.innerHTML = ''

    const frameWrapper = document.createElement('div')
    frameWrapper.style.width = '384px'
    frameWrapper.style.position = 'relative'
    frameWrapper.style.backgroundColor = '#000'

    const img = document.createElement('img')
    img.crossOrigin = 'anonymous'
    img.src = galleryImage.image_url
    img.style.width = '100%'
    img.style.height = 'auto'
    img.style.display = 'block'

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
    })

    frameWrapper.appendChild(img)

    if (galleryImage.caption.trim()) {
      const caption = document.createElement('div')
      caption.textContent = galleryImage.caption
      caption.style.position = 'absolute'
      caption.style.left = '50%'
      caption.style.bottom = '8%'
      caption.style.transform = 'translateX(-50%)'
      caption.style.color = '#ffffff'
      caption.style.fontSize = '18px'
      caption.style.fontWeight = 'bold'
      caption.style.fontFamily = '"News Cycle", Arial, sans-serif'
      caption.style.textAlign = 'center'
      caption.style.textShadow =
        '-1px -1px 0 rgba(0,0,0,0.85), -1px 0 0 rgba(0,0,0,0.85), -1px 1px 0 rgba(0,0,0,0.85), ' +
        '0 -1px 0 rgba(0,0,0,0.85), 0 1px 0 rgba(0,0,0,0.85), ' +
        '1px -1px 0 rgba(0,0,0,0.85), 1px 0 0 rgba(0,0,0,0.85), 1px 1px 0 rgba(0,0,0,0.85)'
      caption.style.maxWidth = '90%'
      caption.style.wordWrap = 'break-word'
      frameWrapper.appendChild(caption)
    }

    container.appendChild(frameWrapper)

    const dataUrl = await toPng(frameWrapper, {
      width: 384,
      pixelRatio: 1,
      backgroundColor: '#000',
    })

    const res = await fetch(dataUrl)
    return res.blob()
  }

  const handlePrint = async () => {
    if (!image) return
    setPrinting(true)
    setError(null)
    setPrintProgress('Preparing images…')

    try {
      const sequence = getPrintSequence()
      const sessionId = getUserSessionId()
      const composedUrls: string[] = []

      for (let i = 0; i < sequence.length; i++) {
        setPrintProgress(`Rendering ${i + 1} of ${sequence.length}…`)
        const blob = await renderFrameToBlob(sequence[i])
        setPrintProgress(`Uploading ${i + 1} of ${sequence.length}…`)
        const url = await uploadComposedImage(blob, sessionId)
        composedUrls.push(url)
      }

      setPrintProgress('Sending to printer…')
      const jobId = await createPrintJob(composedUrls)
      setPrintJobId(jobId)
      setPrintStatus('pending')
      setPrintProgress('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue print')
      setPrintProgress('')
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
              ? printProgress || 'Preparing…'
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

      {/* Hidden container for rendering frames to PNG */}
      <div
        ref={renderContainerRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '384px',
          overflow: 'hidden',
        }}
        aria-hidden
      />
    </div>
  )
}
