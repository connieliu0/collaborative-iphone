import { useCallback, useEffect, useRef, useState } from 'react'
import { PreviewNavArrows } from './PreviewNavArrows'
import {
  COMIC_CAPTION_FONT_FAMILY,
  COMIC_TEXT_STROKE_SHADOW,
  DEFAULT_COMIC_FONT_COLOR,
  DEFAULT_OVERLAY_Y,
  resolveCaptionOverlayY,
} from '../lib/comicCaptionStyle'
import createSamples from '../data/createSamples.json'

const SWIPE_THRESHOLD_PX = 50

export interface CreateSample {
  src: string
  caption: string
}

const samples = createSamples as CreateSample[]

export function SampleGallery() {
  const [index, setIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  )
  const swipeStartRef = useRef<{ x: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const count = samples.length

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const sync = () => setIsMobile(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const goPrev = useCallback(() => {
    if (count === 0) return
    setIndex((i) => (i - 1 + count) % count)
  }, [count])

  const goNext = useCallback(() => {
    if (count === 0) return
    setIndex((i) => (i + 1) % count)
  }, [count])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

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

  if (count === 0) return null

  const sample = samples[index]
  const caption = sample.caption.trim()
  // Compact captions for the short empty-state gallery bar
  const displayFontSize = isMobile ? 11 : 16
  const overlayTopPct = resolveCaptionOverlayY(DEFAULT_OVERLAY_Y)

  return (
    <div
      ref={containerRef}
      className="relative h-[180px] sm:h-[250px] self-stretch shrink-0 bg-[#DDDDDD] overflow-hidden focus:outline-none"
      tabIndex={0}
      role="region"
      aria-label="Sample comic gallery"
      aria-roledescription="carousel"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="absolute inset-0">
        <img
          src={sample.src}
          alt=""
          className="w-full h-full object-cover pointer-events-none select-none"
          draggable={false}
          decoding="async"
        />
      </div>

      {caption ? (
        <div
          role="img"
          aria-label="Overlay text"
          className="absolute select-none pointer-events-none flex items-center justify-center"
          style={{
            left: '50%',
            top: `${overlayTopPct}%`,
            transform: 'translate(-50%, -50%)',
            fontSize: `${displayFontSize}px`,
            color: DEFAULT_COMIC_FONT_COLOR,
            fontWeight: 'bold',
          }}
        >
          <span
            className="whitespace-pre-wrap break-words text-center"
            style={{
              fontFamily: COMIC_CAPTION_FONT_FAMILY,
              fontWeight: 'bold',
              maxWidth: isMobile ? '97vw' : undefined,
              textShadow: COMIC_TEXT_STROKE_SHADOW,
            }}
          >
            {caption}
          </span>
        </div>
      ) : null}

      {count > 1 && <PreviewNavArrows onPrev={goPrev} onNext={goNext} wrap />}
    </div>
  )
}
