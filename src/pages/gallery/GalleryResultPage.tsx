import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toPng } from 'html-to-image'
import { supabase } from '../../lib/supabase'
import {
  createPrintJob,
  fetchGalleryImage,
  fetchGalleryImages,
  fetchPrintJob,
  getUserSessionId,
  updateGalleryCaption,
  uploadComposedImage,
  type GalleryImage,
} from '../../lib/gallery'
import { FrameContent } from '../ComicViewerPage'

const btn =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50'

const FRAME_WIDTH = 384

export function GalleryResultPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [image, setImage] = useState<GalleryImage | null>(null)
  const [caption, setCaption] = useState('')
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
      setCaption(img?.caption ?? '')
      setAllImages(imgs)
    })()
  }, [id])

  const saveCaptionIfChanged = useCallback(async () => {
    if (!image || caption === image.caption) return
    await updateGalleryCaption(image.id, caption)
    setImage({ ...image, caption })
    setAllImages((prev) =>
      prev.map((img) => (img.id === image.id ? { ...img, caption } : img))
    )
  }, [image, caption])

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

  const renderFrameToBlob = async (
    galleryImage: GalleryImage,
    options?: { caption?: string }
  ): Promise<Blob> => {
    const captionText = options?.caption ?? galleryImage.caption
    const container = renderContainerRef.current
    if (!container) throw new Error('Render container not found')

    container.innerHTML = ''

    const frameWrapper = document.createElement('div')
    frameWrapper.style.width = `${FRAME_WIDTH}px`
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

    if (captionText.trim()) {
      const captionEl = document.createElement('div')
      captionEl.textContent = captionText
      captionEl.style.position = 'absolute'
      captionEl.style.left = '50%'
      captionEl.style.bottom = '8%'
      captionEl.style.transform = 'translateX(-50%)'
      captionEl.style.color = '#ffffff'
      captionEl.style.backgroundColor = '#000000'
      captionEl.style.fontSize = '18px'
      captionEl.style.fontWeight = 'bold'
      captionEl.style.fontFamily = 'Arial, sans-serif'
      captionEl.style.textAlign = 'center'
      captionEl.style.padding = '6px 10px'
      captionEl.style.lineHeight = '1.2'
      captionEl.style.boxSizing = 'border-box'
      captionEl.style.maxWidth = '90%'
      captionEl.style.wordWrap = 'break-word'
      frameWrapper.appendChild(captionEl)
    }

    container.appendChild(frameWrapper)

    const dataUrl = await toPng(frameWrapper, {
      width: FRAME_WIDTH,
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
      await saveCaptionIfChanged()
      const sequence = getPrintSequence()
      const sessionId = getUserSessionId()
      const composedUrls: string[] = []

      for (let i = 0; i < sequence.length; i++) {
        setPrintProgress(`Rendering ${i + 1} of ${sequence.length}…`)
        const blob = await renderFrameToBlob(sequence[i], {
          caption: sequence[i].id === image.id ? caption : undefined,
        })
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

  const handleAddAnother = async () => {
    setError(null)
    try {
      await saveCaptionIfChanged()
      navigate('/gallery/upload')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save caption')
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
      <div className="w-full rounded overflow-hidden border border-gray-200">
        <FrameContent
          frame={{
            image_url: image.image_url,
            caption,
            overlay_x: 50,
            overlay_y: 87,
            font_size: 18,
            font_color: '#ffffff',
            font_family: 'Arial',
          }}
          showCaption={false}
          imageFit="natural"
          solidCaptionBackground
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">Caption</span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/20"
          placeholder="Edit caption…"
        />
      </label>

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

      <button
        type="button"
        className="text-sm text-center text-gray-600 underline"
        onClick={() => void handleAddAnother()}
      >
        Add another
      </button>

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
