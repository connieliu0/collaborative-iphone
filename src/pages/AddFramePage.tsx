import { useCallback, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useComic } from '../hooks/useComic'
import { FrameContent } from './ComicViewerPage'
import type { FrameRow } from '../hooks/useComic'
import { addFrameToComic, type AddFramePayload } from '../lib/publish'
import { isHeic } from '../lib/heic'
import { prepareImage } from '../lib/prepareImage'
import type { OverlayPosition } from '../stores/useComicStore'

const FONT_SIZE_PRESETS = [14, 18, 24] as const
const FONT_COLOR_SWATCHES = [
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Red', value: '#ef4444' },
] as const

const defaultOverlay: OverlayPosition = { x: 50, y: 50 }

export function AddFramePage() {
  const { id: comicIdOrSlug } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { comic, frames, loading, error, refetch } = useComic(comicIdOrSlug)

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [overlayPosition, setOverlayPosition] = useState<OverlayPosition>({ ...defaultOverlay })
  const [fontSize, setFontSize] = useState(18)
  const [fontColor, setFontColor] = useState('#ffffff')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [convertingHeic, setConvertingHeic] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const overlayBoxRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      const needsConversion = isHeic(file)
      if (needsConversion) setConvertingHeic(true)
      setSubmitError(null)
      try {
        const prepared = await prepareImage(file)
        setImageFile(prepared)
        setImageUrl(URL.createObjectURL(prepared))
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to process image')
      } finally {
        if (needsConversion) setConvertingHeic(false)
      }
    },
    [imageUrl]
  )

  const clampPosition = useCallback(
    (x: number, y: number, containerRect: DOMRect, boxRect: DOMRect): OverlayPosition => {
      const boxW = boxRect.width
      const boxH = boxRect.height
      const minX = (boxW / 2 / containerRect.width) * 100
      const maxX = 100 - minX
      const minY = (boxH / 2 / containerRect.height) * 100
      const maxY = 100 - minY
      return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
      }
    },
    []
  )

  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!previewContainerRef.current || !overlayBoxRef.current) return
      e.preventDefault()
      const container = previewContainerRef.current
      const box = overlayBoxRef.current
      const rect = container.getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      const boxCenterX = (boxRect.left - rect.left + boxRect.width / 2) / rect.width
      const boxCenterY = (boxRect.top - rect.top + boxRect.height / 2) / rect.height
      dragStartRef.current = {
        x: boxCenterX * 100,
        y: boxCenterY * 100,
        startX: e.clientX,
        startY: e.clientY,
      }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    []
  )

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStartRef.current || !previewContainerRef.current || !overlayBoxRef.current) return
      const container = previewContainerRef.current
      const box = overlayBoxRef.current
      const rect = container.getBoundingClientRect()
      const deltaX = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100
      const deltaY = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100
      const newX = dragStartRef.current.x + deltaX
      const newY = dragStartRef.current.y + deltaY
      const boxRect = box.getBoundingClientRect()
      const clamped = clampPosition(newX, newY, rect, boxRect)
      setOverlayPosition(clamped)
      dragStartRef.current = {
        ...dragStartRef.current,
        x: clamped.x,
        y: clamped.y,
        startX: e.clientX,
        startY: e.clientY,
      }
    },
    [clampPosition]
  )

  const handleOverlayPointerUp = useCallback(() => {
    dragStartRef.current = null
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!user || !comic || !imageFile) {
      setSubmitError('Please select an image.')
      return
    }
    if (comic.current_turn_user_id !== user.id) {
      setSubmitError("It's not your turn.")
      return
    }
    setSubmitError(null)
    setSubmitting(true)
    const payload: AddFramePayload = {
      imageFile,
      caption,
      overlay_x: overlayPosition.x,
      overlay_y: overlayPosition.y,
      font_size: fontSize,
      font_color: fontColor,
    }
    const result = await addFrameToComic(
      comic.id,
      user.id,
      payload,
      {
        owner_id: comic.owner_id,
        turn_order: comic.turn_order ?? [comic.owner_id],
        current_turn_user_id: comic.current_turn_user_id ?? undefined,
        max_frames: comic.max_frames ?? 24,
      },
      frames.length
    )
    setSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      return
    }
    refetch()
    navigate(`/comic/${comic.slug}`)
  }, [
    user,
    comic,
    imageFile,
    caption,
    overlayPosition,
    fontSize,
    fontColor,
    frames.length,
    refetch,
    navigate,
  ])

  const btnPrimary = 'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
  const tabSelected = 'bg-gray-900 text-white'
  const tabDefault = 'text-gray-600 hover:bg-gray-100'

  if (loading || !comicIdOrSlug) {
    return (
      <div className="flex flex-col w-full max-w-xl mx-auto px-4 animate-pulse">
        <div className="h-5 w-24 bg-gray-200 rounded mb-4" />
        <div className="shrink-0 max-h-[280px] rounded-lg bg-gray-200 p-2 mb-4 space-y-3">
          <div className="h-32 rounded-lg bg-gray-100" />
          <div className="h-32 rounded-lg bg-gray-100" />
        </div>
        <div className="h-4 w-40 bg-gray-200 rounded mb-3" />
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-4">
          <div className="w-full aspect-[4/3] max-h-[240px] rounded-lg bg-gray-200" />
          <div className="h-12 w-full rounded-lg bg-gray-200" />
          <div className="h-12 w-full rounded-lg bg-gray-200" />
        </div>
      </div>
    )
  }

  if (error || !comic) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
        <p className="text-gray-600 mb-4">{error ?? 'Comic not found'}</p>
        <Link to="/" className={btnPrimary + ' inline-flex items-center justify-center'}>
          Back to home
        </Link>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
        <p className="text-gray-600 mb-4">Sign in to add a frame.</p>
        <Link to="/" className={btnPrimary + ' inline-flex items-center justify-center'}>
          Back to home
        </Link>
      </div>
    )
  }

  if (comic.current_turn_user_id !== user.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
        <p className="text-gray-600 mb-4">It&apos;s not your turn yet.</p>
        <Link to={`/comic/${comicIdOrSlug}`} className={btnPrimary + ' inline-flex items-center justify-center'}>
          View comic
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-0 w-full max-w-xl mx-auto pb-8 overflow-x-hidden min-w-0">
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          to={`/comic/${comic.slug}`}
          className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
        >
          ← Back to comic
        </Link>
      </div>

      <section
        className="shrink-0 max-h-[280px] overflow-y-auto rounded-lg bg-gray-100 border border-gray-200 p-2 mb-4"
        aria-label="Existing frames"
      >
        <div className="flex flex-col gap-3">
          {frames.map((frame: FrameRow) => (
            <div key={frame.id} className="shrink-0 rounded-lg overflow-hidden border border-gray-200">
              <FrameContent frame={frame} showCaption={false} />
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm font-medium text-gray-900 mb-3">Your turn — add 1 frame below</p>

      <div className="flex flex-col gap-4 border border-gray-200 rounded-xl p-4 bg-white">
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={handleFileChange}
            className="hidden"
            aria-label="Choose image"
          />
          {!imageUrl ? (
            <button
              type="button"
              disabled={convertingHeic}
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[160px] rounded-lg border-2 border-dashed border-gray-300 hover:border-gray-400 flex flex-col items-center justify-center gap-2 text-gray-500 text-sm disabled:opacity-60"
            >
              {convertingHeic ? (
                <>
                  <div
                    className="h-8 w-8 shrink-0 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin"
                    aria-hidden
                  />
                  <span>Converting HEIC…</span>
                </>
              ) : (
                'Pick image'
              )}
            </button>
          ) : (
            <div
              ref={previewContainerRef}
              className="relative w-full aspect-[4/3] max-h-[240px] rounded-lg overflow-hidden bg-gray-200 border border-gray-200"
            >
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover block"
                draggable={false}
              />
              {caption.trim() ? (
                <div
                  ref={overlayBoxRef}
                  role="img"
                  aria-label="Caption overlay"
                  className="absolute cursor-grab active:cursor-grabbing select-none touch-none border-2 border-gray-400 rounded-lg p-2 min-w-[60px] min-h-[32px] flex items-center justify-center shadow-lg bg-black/30"
                  style={{
                    left: `${overlayPosition.x}%`,
                    top: `${overlayPosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontSize: `${fontSize}px`,
                    color: fontColor,
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    fontWeight: 'bold',
                  }}
                  onPointerDown={handleOverlayPointerDown}
                  onPointerMove={handleOverlayPointerMove}
                  onPointerUp={handleOverlayPointerUp}
                  onPointerLeave={handleOverlayPointerUp}
                  onPointerCancel={handleOverlayPointerUp}
                >
                  <span className="pointer-events-none whitespace-pre-wrap break-words text-center">
                    {caption}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div>
          <label htmlFor="add-caption" className="block text-xs text-gray-500 mb-1">
            Caption (drag to position on image)
          </label>
          <textarea
            id="add-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption..."
            rows={2}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
        </div>

        <div className="flex gap-4 flex-wrap">
          <div>
            <span className="text-xs text-gray-500 block mb-1">Font size</span>
            <div className="flex gap-2">
              {FONT_SIZE_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFontSize(value)}
                  className={`min-h-[36px] px-3 rounded-lg text-sm font-medium transition-colors ${
                    fontSize === value ? tabSelected : tabDefault
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-1">Font color</span>
            <div className="flex gap-2">
              {FONT_COLOR_SWATCHES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFontColor(value)}
                  className={`min-h-[36px] min-w-[40px] rounded-lg border-2 transition-colors ${
                    fontColor === value ? 'border-gray-900 ring-2 ring-gray-400' : 'border-gray-300 hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: value }}
                  title={label}
                  aria-label={label}
                />
              ))}
            </div>
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-red-600" role="alert">
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !imageFile}
          className={btnPrimary + ' inline-flex items-center justify-center'}
        >
          {submitting ? 'Submitting…' : 'Submit Frame'}
        </button>
      </div>
    </div>
  )
}
