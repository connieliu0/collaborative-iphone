import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PREVIEW_RETURN_PATH_KEY } from '../components/ComicFlowHeader'
import { PublishSuccessModal } from '../components/PublishSuccessModal'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useAuth } from '../hooks/useAuth'
import { publishComic, updateComic } from '../lib/publish'
import { createPagePath, fetchComicForEditor, readPublishedMetaFromSession } from '../lib/comicEditor'
import { useComicStore } from '../stores/useComicStore'
import { FrameContent, type FrameDisplay } from './ComicViewerPage'

const SWIPE_THRESHOLD_PX = 50

const PUBLISH_AUTH_MESSAGE = 'Create a free account to publish your comic'

const btnPrimary = 'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

function isPreviewableFrame(frame: { imageUrl: string; websiteUrl?: string; caption: string }) {
  return Boolean(frame.imageUrl || frame.websiteUrl || frame.caption.trim())
}

function resolvePreviewReturnPath(
  location: ReturnType<typeof useLocation>,
  collabSessionCode: string | null,
  publishedSlug: string | null
): string {
  const fromState = (location.state as { from?: string } | null)?.from
  if (fromState) return fromState

  if (typeof window !== 'undefined') {
    const stored = window.sessionStorage.getItem(PREVIEW_RETURN_PATH_KEY)
    if (stored) return stored
  }

  if (collabSessionCode?.trim()) {
    return `/session/${collabSessionCode.trim()}/complete`
  }

  return createPagePath(publishedSlug)
}

export function PreviewPage() {
  const { frames, comicTitle, publishedComicId, publishedSlug, setPublishedComic, updateFrameUrls } = useComicStore()
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const location = useLocation()
  const startIndexFromState = (location.state as { startIndex?: number } | null)?.startIndex
  const [currentIndex, setCurrentIndex] = useState(startIndexFromState && startIndexFromState >= 0 ? startIndexFromState : 0)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccessSlug, setPublishSuccessSlug] = useState<string | null>(null)
  const [showTitleModal, setShowTitleModal] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [headerVisible, setHeaderVisible] = useState(true)
  const swipeStartRef = useRef<{ x: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const lastScrollYRef = useRef(0)
  const collabSessionCode =
    typeof window !== 'undefined' ? window.sessionStorage.getItem('collabSessionCode') : null

  const closeTo = resolvePreviewReturnPath(location, collabSessionCode, publishedSlug)

  useEffect(() => {
    if (frames.length > 0) containerRef.current?.focus()
  }, [frames.length])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const deltaY = e.deltaY
      
      // Scrolling up even slightly (negative deltaY means scrolling up)
      if (deltaY < 0 && !headerVisible) {
        setHeaderVisible(true)
      }
      // Scrolling down (positive deltaY means scrolling down)
      else if (deltaY > 0 && headerVisible) {
        setHeaderVisible(false)
      }
    }

    const handleTouchStart = (e: TouchEvent) => {
      lastScrollYRef.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      const currentY = e.touches[0].clientY
      const previousY = lastScrollYRef.current
      const deltaY = previousY - currentY
      
      // Scrolling up even slightly (negative deltaY means finger moving down = scroll up)
      if (deltaY < 0 && !headerVisible) {
        setHeaderVisible(true)
      }
      // Scrolling down (positive deltaY means finger moving up = scroll down)
      else if (deltaY > 0 && headerVisible) {
        setHeaderVisible(false)
      }
      
      lastScrollYRef.current = currentY
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: true })
      container.addEventListener('touchstart', handleTouchStart, { passive: true })
      container.addEventListener('touchmove', handleTouchMove, { passive: true })
    }

    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel)
        container.removeEventListener('touchstart', handleTouchStart)
        container.removeEventListener('touchmove', handleTouchMove)
      }
    }
  }, [headerVisible])

  const displayFrames: FrameDisplay[] = frames.filter(isPreviewableFrame).map((frame) => ({
    image_url: frame.imageUrl,
    website_url: frame.websiteUrl,
    caption: frame.caption,
    overlay_x: frame.overlayPosition.x,
    overlay_y: frame.overlayPosition.y,
    font_size: frame.fontSize,
    font_color: frame.fontColor,
    font_family: frame.fontFamily,
  }))

  // Adjust startIndex to account for filtered frames
  useEffect(() => {
    if (startIndexFromState !== undefined && startIndexFromState >= 0 && frames.length > 0) {
      let displayIndex = 0
      for (let i = 0; i < Math.min(startIndexFromState, frames.length); i++) {
        if (isPreviewableFrame(frames[i])) {
          displayIndex++
        }
      }
      if (startIndexFromState < frames.length && isPreviewableFrame(frames[startIndexFromState])) {
        setCurrentIndex(Math.min(displayIndex, displayFrames.length - 1))
      } else {
        setCurrentIndex(Math.min(displayIndex, Math.max(0, displayFrames.length - 1)))
      }
    }
  }, [startIndexFromState, frames, displayFrames.length])

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

  const handlePublishClick = () => {
    if (!user) {
      openAuthModal(PUBLISH_AUTH_MESSAGE)
      return
    }
    setTitleInput(comicTitle || '')
    setShowTitleModal(true)
  }

  const handlePublish = async () => {
    setShowTitleModal(false)
    setPublishError(null)
    setPublishing(true)
    const publishFrames = frames.filter((frame) => frame.imageUrl || frame.websiteUrl || frame.caption.trim())
    const finalTitle = titleInput.trim() || 'Comic Title'

    let comicId = publishedComicId
    if (!comicId) {
      const sessionMeta = readPublishedMetaFromSession()
      comicId = sessionMeta.publishedComicId
    }
    if (!comicId) {
      const slug = publishedSlug ?? readPublishedMetaFromSession().publishedSlug
      if (slug) {
        const lookup = await fetchComicForEditor(slug)
        if ('error' in lookup) {
          // Comic doesn't exist - treat as new comic instead of failing
          console.warn('Comic not found in database, creating new comic instead', { slug, error: lookup.error })
          comicId = undefined
        } else if (lookup.ownerId !== user!.id) {
          setPublishing(false)
          setPublishError('You can only edit your own comics')
          return
        } else {
          comicId = lookup.comicId
        }
      }
    }

    const result = comicId
      ? await updateComic(comicId, user!.id, publishFrames, finalTitle)
      : await publishComic(user!.id, publishFrames, { mode: 'solo', title: finalTitle })
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    setPublishSuccessSlug(result.slug)
    setPublishedComic({ slug: result.slug, comicId: result.comicId })
    updateFrameUrls(result.uploadedUrls)
  }

  useEffect(() => {
    if (showTitleModal && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [showTitleModal])

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < displayFrames.length - 1
  const currentFrame = displayFrames[currentIndex]
  const canPublish = displayFrames.length > 0

  if (frames.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
        <Link
          to={createPagePath(publishedSlug)}
          className="absolute top-4 left-4 z-10 p-2 text-gray-300 hover:text-white rounded-full hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to create"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <p className="text-gray-300 text-center px-4 mb-4">No frames to preview</p>
        <Link to={createPagePath(publishedSlug)} className={btnPrimary + ' inline-flex items-center justify-center'}>
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

      {showTitleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowTitleModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">What do you want to title your comic?</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handlePublish()
              }}
            >
              <input
                ref={titleInputRef}
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Comic Title"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowTitleModal(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className={`absolute top-4 right-4 z-10 flex items-center gap-2 transition-transform duration-300 ${headerVisible ? 'translate-y-0' : '-translate-y-24'}`}>
        <button
          type="button"
          onClick={handlePublishClick}
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
        <p className={`absolute top-20 left-4 right-4 z-10 text-sm text-red-400 text-right transition-transform duration-300 ${headerVisible ? 'translate-y-0' : '-translate-y-24'}`} role="alert">
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
