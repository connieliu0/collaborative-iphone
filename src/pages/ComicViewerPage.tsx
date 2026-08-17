/**
 * Public comic reader at /comic/:id (no auth).
 *
 * Expected Supabase schema (document only — do not run migrations):
 *
 * comics:
 *   id                   uuid primary key
 *   slug                 text unique
 *   title                text
 *   owner_id             uuid
 *   status               text
 *   created_at           timestamptz
 *   TODO: mode           'solo' | 'collab'
 *   TODO: current_turn_user_id  uuid
 *   TODO: turn_order     uuid[]  -- ordered list of collaborator user ids
 *   TODO: max_frames    int     -- total frame cap for the comic
 *
 * frames:
 *   id           uuid primary key
 *   comic_id     uuid references comics(id)
 *   order        integer
 *   image_url    text
 *   caption      text
 *   overlay_text text
 *   overlay_x    numeric (0–100, percentage)
 *   overlay_y    numeric (0–100, percentage)
 *   font_size    integer
 *   font_color   text (e.g. hex)
 *
 * profiles (create if not exists):
 *   TODO: id       uuid primary key (matches auth.users.id)
 *   TODO: username text unique
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { endComic } from '../lib/publish'
import { useComic } from '../hooks/useComic'
import { useAuth } from '../hooks/useAuth'

const SWIPE_THRESHOLD_PX = 50

const CAPTION_FONT_FAMILY = 'Arial, Helvetica, sans-serif'

export interface FrameDisplay {
  image_url: string
  website_url?: string
  caption: string
  overlay_x: number
  overlay_y: number
  font_size: number
  font_color: string
  font_family?: string
}

export function FrameContent({
  frame,
  showCaption = true,
  variant = 'default',
  overlayCaption = true,
  imageFit = 'contain',
  solidCaptionBackground = false,
}: {
  frame: FrameDisplay
  showCaption?: boolean
  variant?: 'default' | 'preview'
  /** When false, caption appears only in the bottom strip (if showCaption), not overlaid on the image. */
  overlayCaption?: boolean
  /** 'natural' keeps the image's original aspect ratio without cropping to a fixed box. */
  imageFit?: 'contain' | 'natural'
  /** White text on solid black background (better for thermal print dithering). */
  solidCaptionBackground?: boolean
}) {
  const isPreview = variant === 'preview'
  const naturalSize = imageFit === 'natural'

  // When we render the frame text as an "overlay on the image", bias the position
  // toward the lower half by default (many existing frames default to overlay_y=50).
  const overlayTopPct =
    typeof frame.overlay_y === 'number'
      ? Math.min(92, Math.max(87, frame.overlay_y))
      : 87

  return (
    <div
      className={[
        'relative w-full flex flex-col rounded-lg overflow-hidden',
        naturalSize ? '' : 'flex-1 min-h-0',
        isPreview ? 'bg-black border border-black' : 'bg-gray-200 border border-gray-200',
      ].join(' ')}
    >
      <div
        className={
          naturalSize
            ? 'relative w-full'
            : 'relative w-full flex-1 min-h-0 flex items-center justify-center'
        }
      >
        {frame.website_url ? (
          <iframe
            src={frame.website_url}
            title="Website preview"
            className={
              naturalSize
                ? 'w-full h-auto block'
                : isPreview
                  ? 'w-full h-full object-cover block'
                  : 'max-w-full max-h-full w-full h-full object-contain block'
            }
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <img
            src={frame.image_url}
            alt=""
            className={
              naturalSize
                ? 'w-full h-auto block'
                : isPreview
                  ? 'w-full h-full object-cover block'
                  : 'max-w-full max-h-full w-full h-full object-contain block'
            }
            draggable={false}
          />
        )}
        {/* Render caption as an overlay on the image (we removed the dedicated overlay_text column). */}
        {overlayCaption && frame.caption.trim() ? (
          <div
            role="img"
            aria-label="Overlay text"
            className="absolute select-none pointer-events-none flex items-center justify-center"
            style={{
              left: `${frame.overlay_x}%`,
              top: `${overlayTopPct}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${frame.font_size}px`,
              color: frame.font_color,
              fontWeight: 'bold',
            }}
          >
            <span
              className="whitespace-pre-wrap break-words text-center"
              style={{
                fontFamily: CAPTION_FONT_FAMILY,
                fontWeight: 'bold',
                ...(solidCaptionBackground || frame.website_url
                  ? {
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      padding: '6px 10px',
                      lineHeight: 1.2,
                    }
                  : {
                      // Mimics an "outside stroke" outline (CSS text-stroke can’t be outside-only).
                      textShadow:
                        '-1px -1px 0 rgba(0, 0, 0, 0.85), -1px 0 0 rgba(0, 0, 0, 0.85), -1px 1px 0 rgba(0, 0, 0, 0.85), ' +
                        '0 -1px 0 rgba(0, 0, 0, 0.85), 0 1px 0 rgba(0, 0, 0, 0.85), ' +
                        '1px -1px 0 rgba(0, 0, 0, 0.85), 1px 0 0 rgba(0, 0, 0, 0.85), 1px 1px 0 rgba(0, 0, 0, 0.85)',
                    }),
              }}
            >
              {frame.caption}
            </span>
          </div>
        ) : null}
      </div>
      {showCaption && frame.caption.trim() ? (
        <div
          className="w-full bg-gray-800 text-white px-3 py-2 shrink-0 text-center text-sm"
          style={{
            fontSize: `${frame.font_size}px`,
            fontFamily: CAPTION_FONT_FAMILY,
            fontWeight: 'bold',
          }}
        >
          {frame.caption}
        </div>
      ) : null}
    </div>
  )
}

export function ComicViewerPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const location = useLocation()
  const { comic, frames, loading, error, refetch } = useComic(id ?? undefined)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [ending, setEnding] = useState(false)
  const swipeStartRef = useRef<{ x: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const sessionCodeFromState = (location.state as { sessionCode?: string } | null)?.sessionCode
  const [backTo, setBackTo] = useState(sessionCodeFromState ? `/session/${sessionCodeFromState}/complete` : '/')

  useEffect(() => {
    // If we weren't given state (e.g. refresh/bookmark), try to resolve the session code from DB.
    // Note: This requires the viewer to be an authenticated session member due to RLS on `sessions`.
    if (sessionCodeFromState) return
    if (!user) return
    if (!comic?.id) return

    void (async () => {
      const { data: comicRow, error: comicRowError } = await supabase
        .from('comics')
        .select('session_id')
        .eq('id', comic.id)
        .maybeSingle()

      if (comicRowError || !comicRow?.session_id) return

      const { data: sessionRow, error: sessionRowError } = await supabase
        .from('sessions')
        .select('code')
        .eq('id', comicRow.session_id)
        .maybeSingle()

      if (sessionRowError || !sessionRow?.code) return

      setBackTo(`/session/${sessionRow.code}/complete`)
    })()
  }, [sessionCodeFromState, user, comic?.id])

  useEffect(() => {
    if (!loading && comic) containerRef.current?.focus()
  }, [loading, comic])

  useEffect(() => {
    if (!comic?.id || !refetch) return
    const channel = supabase
      .channel(`frames:${comic.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'frames',
          filter: `comic_id=eq.${comic.id}`,
        },
        () => {
          refetch()
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [comic?.id, refetch])

  const handleEndComic = useCallback(async () => {
    if (!comic || !user || comic.owner_id !== user.id) return
    setEnding(true)
    await endComic(comic.id, user.id)
    refetch()
    setEnding(false)
  }, [comic, user, refetch])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i < frames.length - 1 ? i + 1 : i))
  }, [frames.length])

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
  const canGoNext = currentIndex < frames.length - 1
  const currentFrame = frames[currentIndex]

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[640px] mx-auto px-4 py-4 animate-pulse">
          <div className="w-full aspect-[4/3] max-h-[60vh] rounded-lg bg-gray-200" />
          <div className="h-4 w-16 bg-gray-200 rounded mt-4 self-center" />
        </div>
      </div>
    )
  }

  if (error || !comic) {
    return (
      <div className="fixed inset-0 bg-gray-50 flex flex-col items-center justify-center text-gray-900">
        <Link
          to={backTo}
          className="absolute top-4 left-4 z-10 p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to home"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <p className="text-gray-600 text-center px-4">{error ?? 'Comic not found'}</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-gray-50 flex flex-col text-gray-900 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="application"
      aria-label="Comic viewer"
    >
      {/* Back to nav */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <Link
          to={backTo}
          className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center pointer-events-auto"
          aria-label="Back to home"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        {user &&
          comic.owner_id === user.id &&
          comic.status === 'in_progress' &&
          comic.mode === 'collab' && (
          <button
            type="button"
            onClick={handleEndComic}
            disabled={ending}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors pointer-events-auto disabled:opacity-50"
          >
            End Comic
          </button>
        )}
      </div>

      {/* One frame, centered, max 640px */}
      <div
        className="flex-1 flex flex-col items-center justify-center w-full max-w-[640px] mx-auto px-4 py-4"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {currentFrame ? (
          <FrameContent frame={currentFrame} showCaption={false} />
        ) : (
          <p className="text-gray-500">No frames</p>
        )}
      </div>

      {frames.length > 0 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            disabled={!canGoPrev}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-gray-900 hover:bg-black/30 disabled:opacity-30 disabled:pointer-events-none transition-all"
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
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-gray-900 hover:bg-black/30 disabled:opacity-30 disabled:pointer-events-none transition-all"
            aria-label="Next frame"
          >
            <svg className="w-7 h-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {frames.length > 0 && (
        <div className="shrink-0 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex items-center justify-center gap-2">
          <span className="text-sm text-gray-600 tabular-nums">
            {currentIndex + 1} / {frames.length}
          </span>
        </div>
      )}
    </div>
  )
}
