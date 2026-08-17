import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PublishSuccessModal } from '../components/PublishSuccessModal'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useAuth } from '../hooks/useAuth'
import { publishComic, updateComic } from '../lib/publish'
import { useComicStore } from '../stores/useComicStore'
import { FrameContent, type FrameDisplay } from './ComicViewerPage'

const SWIPE_THRESHOLD_PX = 50

const PUBLISH_AUTH_MESSAGE = 'Create a free account to publish your comic'

const btnPrimary = 'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function PreviewPage() {
  const { frames, comicTitle, publishedComicId, setPublishedComic } = useComicStore()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccessSlug, setPublishSuccessSlug] = useState<string | null>(null)
  const swipeStartRef = useRef<{ x: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const collabSessionCode =
    typeof window !== 'undefined' ? window.sessionStorage.getItem('collabSessionCode') : null

  const closeTo =
    collabSessionCode && collabSessionCode.trim()
      ? `/session/${collabSessionCode}/complete`
      : frames.length > 0
        ? `/edit?frame=${frames[0].id}`
        : '/create'

  useEffect(() => {
    if (frames.length > 0) containerRef.current?.focus()
  }, [frames.length])

  const displayFrames: FrameDisplay[] = frames
    .filter((frame) => frame.imageUrl || frame.websiteUrl)
    .map((frame) => ({
    image_url: frame.imageUrl,
    website_url: frame.websiteUrl,
    caption: frame.caption,
    overlay_x: frame.overlayPosition.x,
    overlay_y: frame.overlayPosition.y,
    font_size: frame.fontSize,
    font_color: frame.fontColor,
    font_family: frame.fontFamily,
  }))

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

  const handlePublish = async () => {
    if (!user) {
      openAuthModal(PUBLISH_AUTH_MESSAGE)
      return
    }
    setPublishError(null)
    setPublishing(true)
    const publishFrames = frames.filter((frame) => frame.imageUrl)
    const result = publishedComicId
      ? await updateComic(publishedComicId, user.id, publishFrames, comicTitle)
      : await publishComic(user.id, publishFrames, { mode: 'solo', title: comicTitle })
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    setPublishSuccessSlug(result.slug)
    setPublishedComic({ slug: result.slug, comicId: result.comicId })
  }

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < displayFrames.length - 1
  const currentFrame = displayFrames[currentIndex]
  const canPublish = displayFrames.length > 0

  if (frames.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
        <Link
          to="/create"
          className="absolute top-4 left-4 z-10 p-2 text-gray-300 hover:text-white rounded-full hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to create"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <p className="text-gray-300 text-center px-4 mb-4">No frames to preview</p>
        <Link to="/create" className={btnPrimary + ' inline-flex items-center justify-center'}>
          Add Photos
        </Link>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black flex flex-col text-white overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Comic preview"
    >
      {publishSuccessSlug && (
        <PublishSuccessModal
          slug={publishSuccessSlug}
          onClose={() => setPublishSuccessSlug(null)}
        />
      )}

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing || !canPublish}
          className="btn-primary shrink-0"
        >
          {publishing ? 'Publishing...' : 'Publish'}
        </button>
        <Link
          to={closeTo}
          className="p-2 text-gray-300 hover:text-white rounded-full hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Close preview"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </Link>
      </div>

      {publishError && (
        <p className="absolute top-20 left-4 right-4 z-10 text-sm text-red-400 text-right" role="alert">
          {publishError}
        </p>
      )}

      <div
        className="flex-1 flex flex-col items-center justify-center w-full h-full px-0 py-0"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {currentFrame ? (
          <div className="w-full h-full min-h-0 flex flex-col">
            <FrameContent frame={currentFrame} showCaption={false} variant="preview" />
          </div>
        ) : (
          <p className="text-gray-500">No frames</p>
        )}
      </div>

      {displayFrames.length > 0 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 disabled:opacity-30 disabled:pointer-events-none transition-all"
            aria-label="Previous frame"
          >
            <svg className="w-7 h-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/30 disabled:opacity-30 disabled:pointer-events-none transition-all"
            aria-label="Next frame"
          >
            <svg className="w-7 h-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Bottom controls removed for fullscreen preview */}
    </div>
  )
}
