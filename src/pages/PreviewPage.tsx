import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useComicStore } from '../stores/useComicStore'
import { useAuth } from '../hooks/useAuth'
import { useAuthModal } from '../contexts/AuthModalContext'
import { publishComic, type PublishOptions } from '../lib/publish'
import { FrameContent, type FrameDisplay } from './ComicViewerPage'

const SWIPE_THRESHOLD_PX = 50
const PREVIEW_AUTH_MESSAGE = 'Create a free account to save your comic as a permanent link'

export function PreviewPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const { frames } = useComicStore()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishMode, setPublishMode] = useState<'solo' | 'collab'>('solo')
  const [maxFramesInput, setMaxFramesInput] = useState<string>('')
  const swipeStartRef = useRef<{ x: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (frames.length > 0) containerRef.current?.focus()
  }, [frames.length])

  const displayFrames: FrameDisplay[] = frames.map((frame) => ({
    image_url: frame.imageUrl,
    caption: frame.caption,
    overlay_text: frame.overlayText,
    overlay_x: frame.overlayPosition.x,
    overlay_y: frame.overlayPosition.y,
    font_size: frame.fontSize,
    font_color: frame.fontColor,
  }))

  const handlePublish = useCallback(async () => {
    if (!user) {
      openAuthModal(PREVIEW_AUTH_MESSAGE)
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
  }, [user, frames, publishMode, maxFramesInput, openAuthModal, navigate])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i < displayFrames.length - 1 ? i + 1 : i))
  }, [displayFrames.length])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartRef.current = { x: e.clientX }
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = swipeStartRef.current
      swipeStartRef.current = null
      if (!start) return
      const delta = e.clientX - start.x
      if (delta > SWIPE_THRESHOLD_PX) goPrev()
      else if (delta < -SWIPE_THRESHOLD_PX) goNext()
    },
    [goPrev, goNext]
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goNext()
      }
    },
    [goPrev, goNext]
  )

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < displayFrames.length - 1
  const currentFrame = displayFrames[currentIndex]

  if (frames.length === 0) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center">
        <Link
          to="/create"
          className="absolute top-4 left-4 z-10 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to create"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <p className="text-white/80 text-center px-4 mb-4">No frames to preview</p>
        <Link
          to="/create"
          className="min-h-[44px] inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90"
        >
          Add Photos
        </Link>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#0a0a0a] flex flex-col text-white overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Comic preview"
    >
      {/* Back button */}
      <div className="absolute top-4 left-4 z-10">
        <Link
          to={frames.length > 0 ? `/edit?frame=${frames[0].id}` : '/create'}
          className="p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to edit"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
      </div>

      {/* One frame, centered, max 640px; max height so caption stays visible */}
      <div
        className="flex-1 flex flex-col items-center justify-center w-full max-w-[640px] mx-auto px-4 py-4 min-h-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {currentFrame ? (
          <div className="w-full max-h-[70vh] min-h-0 flex flex-col rounded-lg overflow-hidden">
            <FrameContent frame={currentFrame} />
          </div>
        ) : (
          <p className="text-white/60">No frames</p>
        )}
      </div>

      {/* Nav arrows */}
      {displayFrames.length > 0 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-30 disabled:pointer-events-none text-white transition-colors"
            aria-label="Previous frame"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 disabled:opacity-30 disabled:pointer-events-none text-white transition-colors"
            aria-label="Next frame"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Frame indicator and CTA bar */}
      <div className="shrink-0 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col items-center justify-center gap-3">
        {displayFrames.length > 0 && (
          <span className="text-sm text-white/70 tabular-nums">
            {currentIndex + 1} / {displayFrames.length}
          </span>
        )}

        {/* Publish controls */}
        <div className="flex flex-col items-center gap-3 px-4 w-full max-w-md">
          {user ? (
            <>
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
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {publishing ? 'Publishing...' : 'Save as Permalink'}
              </button>
              {publishError && (
                <p className="text-sm text-red-400" role="alert">
                  {publishError}
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal(PREVIEW_AUTH_MESSAGE)}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors"
            >
              Create Account to Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
