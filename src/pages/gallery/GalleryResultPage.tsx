import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { CaptionOverlay, CAPTION_GALLERY_MOBILE, CAPTION_MAIN } from '../../components/SequenceInsertCarousel'

const btn =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50'

const FRAME_WIDTH = 384
const MOBILE_PANEL_H = 'h-[48dvh]'
const MOBILE_PANEL_W = 'w-[72vw] shrink-0 snap-center'

function galleryFrame(image: GalleryImage, caption: string) {
  return {
    image_url: image.image_url,
    caption,
    overlay_x: 50,
    overlay_y: 87,
    font_size: 18,
    font_color: '#ffffff',
    font_family: 'Arial',
  }
}

function SequencePreviewPanel({
  image,
  className = '',
  captionFontSize = CAPTION_MAIN,
}: {
  image: GalleryImage
  className?: string
  captionFontSize?: string
}) {
  return (
    <div
      className={[
        'bg-[#d9d9d9] overflow-hidden relative',
        className || 'flex-1 min-h-0 w-full',
      ].join(' ')}
    >
      <img
        src={image.image_url}
        alt=""
        className="w-full h-full object-cover block"
        draggable={false}
      />
      <CaptionOverlay caption={image.caption} fontSize={captionFontSize} />
    </div>
  )
}

function MainPreviewPanel({
  image,
  caption,
  className = '',
  panelRef,
  mobileCaptionFontSize = CAPTION_GALLERY_MOBILE,
}: {
  image: GalleryImage
  caption: string
  className?: string
  panelRef?: RefObject<HTMLDivElement | null>
  mobileCaptionFontSize?: string
}) {
  return (
    <div
      ref={panelRef}
      className={[
        'bg-white overflow-hidden',
        className || 'w-full border-y border-black',
      ].join(' ')}
    >
      <div className="md:hidden relative w-full h-full flex items-center justify-center">
        <img
          src={image.image_url}
          alt=""
          className="max-w-full max-h-full w-full h-full object-contain block"
          draggable={false}
        />
        <CaptionOverlay caption={caption} fontSize={mobileCaptionFontSize} />
      </div>
      <div className="hidden md:flex w-full h-full items-center justify-center">
        <FrameContent
          frame={galleryFrame(image, caption)}
          showCaption={false}
          imageFit="natural"
          solidCaptionBackground
        />
      </div>
    </div>
  )
}

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
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const mainPanelRef = useRef<HTMLDivElement>(null)

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

  const { beforeImage, afterImage } = useMemo(() => {
    if (!image) return { beforeImage: null, afterImage: null }
    const sorted = [...allImages].sort((a, b) => a.position - b.position)
    const idx = sorted.findIndex((img) => img.id === image.id)
    if (idx === -1) return { beforeImage: null, afterImage: null }
    return {
      beforeImage: idx > 0 ? sorted[idx - 1] : null,
      afterImage: idx < sorted.length - 1 ? sorted[idx + 1] : null,
    }
  }, [image, allImages])

  useEffect(() => {
    const container = mobileScrollRef.current
    const main = mainPanelRef.current
    if (!container || !main) return

    const centerMain = () => {
      container.scrollLeft = main.offsetLeft - (container.clientWidth - main.clientWidth) / 2
    }

    centerMain()
    const frame = window.requestAnimationFrame(centerMain)
    return () => window.cancelAnimationFrame(frame)
  }, [image, beforeImage, afterImage])

  const renderFrameToBlob = async (
    galleryImage: GalleryImage,
    options?: { caption?: string }
  ): Promise<Blob> => {
    const captionText = options?.caption ?? galleryImage.caption

    const res = await fetch(galleryImage.image_url)
    if (!res.ok) throw new Error('Failed to load image')
    const imageBlob = await res.blob()
    const bitmap = await createImageBitmap(imageBlob)

    const frameHeight = Math.max(1, Math.round((bitmap.height * FRAME_WIDTH) / bitmap.width))
    const canvas = document.createElement('canvas')
    canvas.width = FRAME_WIDTH
    canvas.height = frameHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      throw new Error('Canvas not supported')
    }

    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, FRAME_WIDTH, frameHeight)
    ctx.drawImage(bitmap, 0, 0, FRAME_WIDTH, frameHeight)
    bitmap.close()

    if (captionText.trim()) {
      const fontSize = 18
      const paddingX = 10
      const paddingY = 6
      const maxTextWidth = FRAME_WIDTH * 0.9 - paddingX * 2
      ctx.font = `bold ${fontSize}px Arial, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const lines = wrapCaptionLines(ctx, captionText.trim(), maxTextWidth)
      const lineHeight = fontSize * 1.2
      const textBlockHeight = lines.length * lineHeight
      const blockWidth = Math.min(
        maxTextWidth + paddingX * 2,
        Math.max(...lines.map((line) => ctx.measureText(line).width)) + paddingX * 2
      )
      const blockX = (FRAME_WIDTH - blockWidth) / 2
      const blockY = frameHeight * 0.92 - textBlockHeight / 2 - paddingY

      ctx.fillStyle = '#000000'
      ctx.fillRect(blockX, blockY, blockWidth, textBlockHeight + paddingY * 2)

      ctx.fillStyle = '#ffffff'
      lines.forEach((line, index) => {
        const y = blockY + paddingY + lineHeight * (index + 0.5)
        ctx.fillText(line, FRAME_WIDTH / 2, y)
      })
    }

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Failed to render frame'))),
        'image/png'
      )
    })
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
    <div className="min-h-[100dvh] flex flex-col">
      <div
        ref={mobileScrollRef}
        className="md:hidden relative left-1/2 -translate-x-1/2 w-screen overflow-x-auto overflow-y-hidden snap-x snap-mandatory touch-pan-x"
      >
        <div className={`flex flex-row items-stretch ${MOBILE_PANEL_H} px-[14vw]`}>
          {beforeImage && (
            <SequencePreviewPanel
              image={beforeImage}
              className={`${MOBILE_PANEL_W} ${MOBILE_PANEL_H}`}
              captionFontSize={CAPTION_GALLERY_MOBILE}
            />
          )}
          <MainPreviewPanel
            image={image}
            caption={caption}
            panelRef={mainPanelRef}
            className={`${MOBILE_PANEL_W} ${MOBILE_PANEL_H} border border-black`}
            mobileCaptionFontSize={CAPTION_GALLERY_MOBILE}
          />
          {afterImage && (
            <SequencePreviewPanel
              image={afterImage}
              className={`${MOBILE_PANEL_W} ${MOBILE_PANEL_H}`}
              captionFontSize={CAPTION_GALLERY_MOBILE}
            />
          )}
        </div>
      </div>

      <div className="hidden md:flex flex-1 min-h-0 flex-col relative left-1/2 -translate-x-1/2 w-screen max-h-[min(75dvh,720px)]">
        {beforeImage && <SequencePreviewPanel image={beforeImage} />}
        <MainPreviewPanel
          image={image}
          caption={caption}
          className={beforeImage || afterImage ? 'shrink-0 min-h-[28dvh]' : 'flex-1 min-h-0'}
        />
        {afterImage && <SequencePreviewPanel image={afterImage} />}
      </div>

      <div className="shrink-0 max-w-xl mx-auto w-full px-4 py-4 flex flex-col gap-4">
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
      </div>
    </div>
  )
}

function wrapCaptionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current) lines.push(current)
  return lines.length > 0 ? lines : [text]
}
