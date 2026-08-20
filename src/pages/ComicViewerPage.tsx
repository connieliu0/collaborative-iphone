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
import {
  CAPTION_OVERLAY_Y_NUDGE,
  COMIC_CAPTION_FONT_FAMILY,
  COMIC_TEXT_STROKE_SHADOW,
  DEFAULT_OVERLAY_Y,
  normalizeLegacyComicCaptionStyle,
  resolveCaptionOverlayY,
} from '../lib/comicCaptionStyle'
import { iframeSrcForWebsiteUrl, isInstagramEmbed } from '../lib/websiteLink'

const SWIPE_THRESHOLD_PX = 50

const CAPTION_FONT_FAMILY = COMIC_CAPTION_FONT_FAMILY

export interface FrameDisplay {
  image_url: string
  website_url?: string | null
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
  const { fontSize: captionFontSize, fontColor: captionFontColor } = normalizeLegacyComicCaptionStyle(
    frame.font_size,
    frame.font_color
  )

  const overlayTopPct =
    typeof frame.overlay_y === 'number'
      ? resolveCaptionOverlayY(frame.overlay_y)
      : DEFAULT_OVERLAY_Y - CAPTION_OVERLAY_Y_NUDGE

  const isIgEmbed = frame.website_url ? isInstagramEmbed(frame.website_url) : false

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
            src={iframeSrcForWebsiteUrl(frame.website_url)}
            title="Website preview"
            className={
              naturalSize
                ? 'w-full h-auto block'
                : isPreview
                  ? isIgEmbed
                    ? 'w-full max-w-[540px] h-full block'
                    : 'w-full h-full object-cover block'
                  : isIgEmbed
                    ? 'w-full max-w-[540px] h-full block'
                    : 'max-w-full max-h-full w-full h-full object-contain block'
            }
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            allow="encrypted-media; clipboard-write; picture-in-picture"
          />
        ) : frame.image_url ? (
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
            decoding="async"
          />
        ) : (
          <div
            className={
              naturalSize
                ? 'w-full min-h-[50vh] bg-black'
                : 'w-full h-full min-h-0 bg-black'
            }
            aria-hidden
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
              fontSize: `${captionFontSize}px`,
              color: captionFontColor,
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
                      textShadow: COMIC_TEXT_STROKE_SHADOW,
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
            fontSize: `${captionFontSize}px`,
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

  // Preload adjacent images for smoother navigation
  useEffect(() => {
    if (!frames.length) return
    const toPreload: string[] = []
    // Preload next 2 and previous 1 images
    for (const offset of [1, 2, -1]) {
      const idx = currentIndex + offset
      if (idx >= 0 && idx < frames.length) {
        const url = frames[idx].image_url
        if (url && !url.startsWith('blob:')) {
          toPreload.push(url)
        }
      }
    }
    const links: HTMLLinkElement[] = []
    for (const url of toPreload) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = url
      document.head.appendChild(link)
      links.push(link)
    }
    return () => {
      for (const link of links) {
        link.remove()
      }
    }
  }, [currentIndex, frames])

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
      <div className="fixed inset-0 bg-black flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex-1 flex flex-col items-center justify-center w-full h-full px-0 py-0 animate-pulse">
          <div className="w-full h-full rounded-lg bg-gray-800" />
        </div>
      </div>
    )
  }

  if (error || !comic) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
        <Link
          to={backTo}
          className="absolute top-4 left-4 z-10 p-2 text-gray-300 hover:text-white rounded-full hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Back to home"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <p className="text-gray-300 text-center px-4">{error ?? 'Comic not found'}</p>
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
      aria-label="Comic viewer"
    >
      {/* Back to nav */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <Link
          to={backTo}
          className="p-2 text-gray-300 hover:text-white rounded-full hover:bg-gray-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center pointer-events-auto"
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
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-gray-600 text-gray-200 text-sm font-medium hover:bg-gray-800 transition-colors pointer-events-auto disabled:opacity-50"
          >
            End Comic
          </button>
        )}
      </div>

      {/* One frame, full width */}
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

      {frames.length > 0 && (
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

      {frames.length > 0 && (
        <div className="shrink-0 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex items-center justify-center gap-2">
          <span className="text-sm text-gray-300 tabular-nums">
            {currentIndex + 1} / {frames.length}
          </span>
        </div>
      )}
    </div>
  )
}
