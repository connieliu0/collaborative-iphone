import { useCallback, useRef } from 'react'
import type { GalleryImage } from '../lib/gallery'

const SWIPE_THRESHOLD_PX = 40
const SLOT_H = 'h-[100dvh] max-h-[100dvh]'

const CAPTION_MAIN = 'clamp(0.625rem, 2.8vw, 1.125rem)'
const CAPTION_EDGE = 'clamp(0.5rem, 2.2vw, 0.875rem)'

function CaptionOverlay({ caption, fontSize }: { caption: string; fontSize: string }) {
  if (!caption.trim()) return null

  return (
    <div
      className="absolute left-1/2 bottom-[8%] -translate-x-1/2 max-w-[92%] select-none pointer-events-none flex justify-center"
      style={{ fontSize }}
    >
      <span
        className="whitespace-pre-wrap break-words text-center font-bold text-white bg-black px-[0.4em] py-[0.25em] leading-tight"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        {caption}
      </span>
    </div>
  )
}

function CarouselImageFrame({
  image,
  captionSize,
}: {
  image: GalleryImage
  captionSize: string
}) {
  return (
    <div className={`relative shrink-0 ${SLOT_H}`}>
      <img
        src={image.image_url}
        alt=""
        className={`${SLOT_H} w-auto object-contain block`}
        draggable={false}
      />
      <CaptionOverlay caption={image.caption} fontSize={captionSize} />
    </div>
  )
}

function ImageSlot({
  image,
  variant,
  onClick,
}: {
  image: GalleryImage | null
  variant: 'edge' | 'main'
  onClick?: () => void
}) {
  if (!image) return null

  const captionSize = variant === 'edge' ? CAPTION_EDGE : CAPTION_MAIN
  const edgeClip =
    variant === 'edge'
      ? 'w-[11vw] max-w-[52px] sm:max-w-[72px] overflow-hidden flex justify-center'
      : ''

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`shrink-0 ${SLOT_H} disabled:cursor-default ${edgeClip} ${
        variant === 'edge' ? 'opacity-70' : ''
      }`}
    >
      <CarouselImageFrame image={image} captionSize={captionSize} />
    </button>
  )
}

export function SequenceInsertCarousel({
  images,
  focusedIndex,
  onFocusedIndexChange,
  addSlot,
  onAddClick,
  disabled,
}: {
  images: GalleryImage[]
  focusedIndex: number
  onFocusedIndexChange: (index: number) => void
  addSlot: React.ReactNode
  onAddClick?: () => void
  disabled?: boolean
}) {
  const swipeStartRef = useRef<{ x: number } | null>(null)

  const goPrev = useCallback(() => {
    onFocusedIndexChange(Math.max(-1, focusedIndex - 1))
  }, [focusedIndex, onFocusedIndexChange])

  const goNext = useCallback(() => {
    onFocusedIndexChange(Math.min(images.length - 1, focusedIndex + 1))
  }, [focusedIndex, images.length, onFocusedIndexChange])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartRef.current = { x: e.clientX }
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = swipeStartRef.current
      swipeStartRef.current = null
      if (!start || disabled) return
      const delta = e.clientX - start.x
      if (delta > SWIPE_THRESHOLD_PX) goPrev()
      else if (delta < -SWIPE_THRESHOLD_PX) goNext()
    },
    [disabled, goPrev, goNext]
  )

  const farBefore = focusedIndex >= 1 ? images[focusedIndex - 1] : null
  const before = focusedIndex >= 0 ? images[focusedIndex] : null
  const after = images[focusedIndex + 1] ?? null
  const farAfter = images[focusedIndex + 2] ?? null

  return (
    <div
      className={`w-screen ${SLOT_H} overflow-hidden touch-pan-y select-none`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStartRef.current = null
      }}
    >
      <div className={`flex items-center justify-center gap-0.5 sm:gap-1.5 ${SLOT_H}`}>
        <ImageSlot
          image={farBefore}
          variant="edge"
          onClick={disabled ? undefined : () => onFocusedIndexChange(Math.max(-1, focusedIndex - 2))}
        />
        <ImageSlot image={before} variant="main" onClick={disabled ? undefined : goPrev} />
        <button
          type="button"
          onClick={onAddClick}
          disabled={disabled || !onAddClick}
          className={`shrink-0 ${SLOT_H} w-auto min-w-[22vw] sm:min-w-[28vw] bg-white border border-black flex items-center justify-center disabled:cursor-default overflow-hidden`}
        >
          {addSlot}
        </button>
        <ImageSlot image={after} variant="main" onClick={disabled ? undefined : goNext} />
        <ImageSlot
          image={farAfter}
          variant="edge"
          onClick={disabled ? undefined : () => onFocusedIndexChange(Math.min(images.length - 1, focusedIndex + 2))}
        />
      </div>
    </div>
  )
}

export function AddPictureLabel() {
  return (
    <span className="text-black text-center px-[0.5em] leading-snug" style={{ fontSize: CAPTION_MAIN }}>
      Add picture
    </span>
  )
}
