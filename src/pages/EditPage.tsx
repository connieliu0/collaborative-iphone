import { useCallback, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useAuth } from '../hooks/useAuth'
import { publishComic, type PublishOptions } from '../lib/publish'
import type { ComicFrame, OverlayPosition } from '../stores/useComicStore'
import { useComicStore } from '../stores/useComicStore'

const FONT_SIZE_PRESETS = [
  { label: 'Small', value: 14 },
  { label: 'Medium', value: 18 },
  { label: 'Large', value: 24 },
] as const

const FONT_COLOR_SWATCHES = [
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'Yellow', value: '#facc15' },
  { label: 'Red', value: '#ef4444' },
] as const

type EditorTab = 'caption' | 'overlay'

const PUBLISH_AUTH_MESSAGE = 'Create a free account to publish your comic'

export function EditPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const frameId = searchParams.get('frame') ?? ''
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishMode, setPublishMode] = useState<'solo' | 'collab'>('solo')
  const [maxFramesInput, setMaxFramesInput] = useState<string>('')

  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const { frames, updateFrame } = useComicStore()

  const currentIndex = frames.findIndex((f) => f.id === frameId)
  const frame: ComicFrame | undefined = frames[currentIndex]
  const [activeTab, setActiveTab] = useState<EditorTab>('caption')
  const captionRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLTextAreaElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const overlayBoxRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)

  const handleTabClick = useCallback(
    (tab: EditorTab) => {
      setActiveTab(tab)
      if (tab === 'caption') captionRef.current?.focus()
      else overlayRef.current?.focus()
    },
    []
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
      if (!frame || !previewContainerRef.current || !overlayBoxRef.current) return
      e.preventDefault()
      const container = previewContainerRef.current
      const box = overlayBoxRef.current
      const rect = container.getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      const boxCenterX = (boxRect.left - rect.left + boxRect.width / 2) / rect.width
      const boxCenterY = (boxRect.top - rect.top + boxRect.height / 2) / rect.height
      const startXPercent = boxCenterX * 100
      const startYPercent = boxCenterY * 100
      dragStartRef.current = {
        x: startXPercent,
        y: startYPercent,
        startX: e.clientX,
        startY: e.clientY,
      }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [frame]
  )

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!frame || !dragStartRef.current || !previewContainerRef.current || !overlayBoxRef.current)
        return
      const container = previewContainerRef.current
      const box = overlayBoxRef.current
      const rect = container.getBoundingClientRect()
      const deltaX = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100
      const deltaY = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100
      const newX = dragStartRef.current.x + deltaX
      const newY = dragStartRef.current.y + deltaY
      const boxRect = box.getBoundingClientRect()
      const clamped = clampPosition(newX, newY, rect, boxRect)
      updateFrame(frame.id, { overlayPosition: { ...clamped } })
      dragStartRef.current = {
        ...dragStartRef.current,
        x: clamped.x,
        y: clamped.y,
        startX: e.clientX,
        startY: e.clientY,
      }
    },
    [frame, clampPosition, updateFrame]
  )

  const handleOverlayPointerUp = useCallback(() => {
    dragStartRef.current = null
  }, [])

  const goToFrame = useCallback(
    (index: number) => {
      const target = frames[index]
      if (target) setSearchParams({ frame: target.id })
    },
    [frames, setSearchParams]
  )

  const handlePublish = async () => {
    if (!user) {
      openAuthModal(PUBLISH_AUTH_MESSAGE)
      return
    }
    setPublishError(null)
    setPublishing(true)
    const opts: PublishOptions = {
      mode: publishMode,
      maxFrames: publishMode === 'collab' && maxFramesInput.trim() !== ''
        ? Math.min(24, Math.max(1, parseInt(maxFramesInput, 10) || 3))
        : undefined,
    }
    const result = await publishComic(user.id, frames, opts)
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    navigate(`/publish?slug=${result.slug}`)
  }

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-white/80 mb-4">No frames yet. Add photos on the create page.</p>
        <Link
          to="/create"
          className="min-h-[44px] inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90"
        >
          ← Back to Create
        </Link>
      </div>
    )
  }

  if (!frame && frames.length > 0) {
    return <Navigate replace to={`/edit?frame=${frames[0].id}`} />
  }
  if (!frame) return null

  const prevIndex = currentIndex > 0 ? currentIndex - 1 : null
  const nextIndex = currentIndex < frames.length - 1 && currentIndex >= 0 ? currentIndex + 1 : null

  return (
    <div className="flex flex-col min-h-0 w-full max-w-xl mx-auto overflow-x-hidden">
      {/* Header: Back + Publish */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <Link
          to="/create"
          className="text-sm text-white/80 hover:text-white underline underline-offset-2"
        >
          ← Back to all frames
        </Link>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/70">Publish as:</span>
            <div className="flex rounded-lg bg-white/5 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => setPublishMode('solo')}
                className={`min-h-[36px] px-3 rounded-md text-sm font-medium transition-colors ${
                  publishMode === 'solo' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Solo
              </button>
              <button
                type="button"
                onClick={() => setPublishMode('collab')}
                className={`min-h-[36px] px-3 rounded-md text-sm font-medium transition-colors ${
                  publishMode === 'collab' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                Collab
              </button>
            </div>
            {publishMode === 'collab' && (
              <label className="flex items-center gap-2 text-sm text-white/70">
                Max frames
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={maxFramesInput}
                  onChange={(e) => setMaxFramesInput(e.target.value)}
                  placeholder="24"
                  className="w-14 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm"
                />
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
          {publishError && (
            <p className="text-sm text-red-400" role="alert">
              {publishError}
            </p>
          )}
        </div>
      </div>
      {/* Top: Frame Preview — responsive height so panel fits in viewport */}
      <section
        className="shrink-0 w-full h-[40vh] min-h-[180px] max-h-[50dvh] sm:h-[50vh] sm:max-h-[60dvh] relative bg-black/40"
        aria-label="Frame preview"
      >
        <div
          ref={previewContainerRef}
          className="absolute inset-0 w-full h-full flex flex-col"
        >
          <div className="relative w-full flex-1 min-h-0 overflow-hidden">
            <img
              src={frame.imageUrl}
              alt=""
              className="w-full h-full object-cover block"
              draggable={false}
            />
            {frame.overlayText.trim() && (
              <div
                ref={overlayBoxRef}
                role="img"
                aria-label="Overlay text"
                className="absolute cursor-grab active:cursor-grabbing select-none touch-none border-2 border-white/50 rounded-lg p-2 min-w-[60px] min-h-[32px] flex items-center justify-center shadow-lg bg-black/30"
                style={{
                  left: `${frame.overlayPosition.x}%`,
                  top: `${frame.overlayPosition.y}%`,
                  transform: 'translate(-50%, -50%)',
                  fontSize: `${frame.fontSize}px`,
                  color: frame.fontColor,
                  fontWeight: 'bold',
                  textShadow:
                    '0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6), 1px 1px 3px rgba(0,0,0,0.8)',
                }}
                onPointerDown={handleOverlayPointerDown}
                onPointerMove={handleOverlayPointerMove}
                onPointerUp={handleOverlayPointerUp}
                onPointerLeave={handleOverlayPointerUp}
                onPointerCancel={handleOverlayPointerUp}
              >
                <span className="pointer-events-none whitespace-pre-wrap break-words text-center">
                  {frame.overlayText}
                </span>
                <svg
                  className="absolute bottom-0 right-0 w-4 h-4 text-white/70 pointer-events-none"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zM8 16h2v2H8v-2zm6 0h2v2h-2v-2z" />
                </svg>
              </div>
            )}
          </div>
          <div
            className="w-full bg-black/60 text-white px-3 py-2 shrink-0"
            style={{ fontSize: `${frame.fontSize}px` }}
          >
            {frame.caption.trim() || '\u00A0'}
          </div>
        </div>
      </section>

      {/* Bottom: Editor Panel — scrollable */}
      <div className="flex-1 min-h-0 flex flex-col bg-[#0d0d0d] rounded-t-2xl overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-white/5 p-1 gap-1">
            <button
              type="button"
              onClick={() => handleTabClick('caption')}
              className={`flex-1 min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                activeTab === 'caption'
                  ? 'bg-white text-black'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Caption
            </button>
            <button
              type="button"
              onClick={() => handleTabClick('overlay')}
              className={`flex-1 min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                activeTab === 'overlay'
                  ? 'bg-white text-black'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Overlay
            </button>
          </div>

          {/* Caption field */}
          <div>
            <label htmlFor="edit-caption" className="sr-only">
              Caption
            </label>
            <textarea
              id="edit-caption"
              ref={captionRef}
              value={frame.caption}
              onChange={(e) => updateFrame(frame.id, { caption: e.target.value })}
              onFocus={() => setActiveTab('caption')}
              placeholder="Add a caption..."
              rows={2}
              className="w-full min-h-[80px] px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
            />
          </div>

          {/* Overlay field */}
          <div>
            <label htmlFor="edit-overlay" className="sr-only">
              Overlay text
            </label>
            <textarea
              id="edit-overlay"
              ref={overlayRef}
              value={frame.overlayText}
              onChange={(e) => updateFrame(frame.id, { overlayText: e.target.value })}
              onFocus={() => setActiveTab('overlay')}
              placeholder="Add overlay text..."
              rows={2}
              className="w-full min-h-[80px] px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
            />
          </div>

          {/* Style controls */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-white/90">
              Style {activeTab === 'caption' ? '(caption)' : '(overlay)'}
            </p>
            <div>
              <span className="text-xs text-white/60 block mb-1.5">Font size</span>
              <div className="flex gap-2">
                {FONT_SIZE_PRESETS.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateFrame(frame.id, { fontSize: value })}
                    className={`min-h-[40px] px-3 rounded-lg text-sm font-medium transition-colors ${
                      frame.fontSize === value
                        ? 'bg-white text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-white/60 block mb-1.5">Font color</span>
              <div className="flex gap-2 flex-wrap">
                {FONT_COLOR_SWATCHES.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateFrame(frame.id, { fontColor: value })}
                    className={`min-h-[40px] min-w-[44px] rounded-lg border-2 transition-colors ${
                      frame.fontColor === value
                        ? 'border-white ring-2 ring-white/50'
                        : 'border-white/20 hover:border-white/40'
                    }`}
                    style={{ backgroundColor: value }}
                    title={label}
                    aria-label={`Color ${label}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Frame navigation */}
        <div className="shrink-0 px-4 py-4 pt-0 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 border-t border-white/10">
          <p className="text-center text-sm text-white/70">
            Frame {currentIndex + 1} of {frames.length}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => prevIndex !== null && goToFrame(prevIndex)}
              disabled={prevIndex === null}
              className="min-h-[44px] px-4 rounded-lg bg-white/10 text-white font-medium text-sm hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => nextIndex !== null && goToFrame(nextIndex)}
              disabled={nextIndex === null}
              className="min-h-[44px] px-4 rounded-lg bg-white/10 text-white font-medium text-sm hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next →
            </button>
          </div>
          <div className="text-center">
            <Link
              to="/create"
              className="text-sm text-white/80 hover:text-white underline underline-offset-2"
            >
              ← Back to all frames
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
