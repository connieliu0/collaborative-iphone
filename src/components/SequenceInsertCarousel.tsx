import { useCallback, useRef } from 'react'
import type { GalleryImage } from '../lib/gallery'

const SWIPE_THRESHOLD_PX = 40
const SLOT_H = 'h-[100dvh] max-h-[100dvh]'

const CAPTION_MAIN = 'clamp(0.625rem, 2.8vw, 1.125rem)'
const CAPTION_EDGE = 'clamp(0.5rem, 2.2vw, 0.875rem)'
const PLACEHOLDER_LABEL = 'clamp(0.875rem, 4vw, 1.125rem)'

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

function MobileNeighborPanel({
  image,
  placeholder,
  onClick,
  disabled,
}: {
  image: GalleryImage | null
  placeholder: string
  onClick?: () => void
  disabled?: boolean
}) {
  if (image) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || !onClick}
        className="flex-1 min-h-0 w-full bg-[#d9d9d9] overflow-hidden disabled:cursor-default"
      >
        <div className="relative w-full h-full">
          <img
            src={image.image_url}
            alt=""
            className="w-full h-full object-cover block"
            draggable={false}
          />
          <CaptionOverlay caption={image.caption} fontSize={CAPTION_EDGE} />
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className="flex-1 min-h-0 w-full bg-[#d9d9d9] flex items-center justify-center disabled:cursor-default"
    >
      <span className="text-black text-center px-4" style={{ fontSize: PLACEHOLDER_LABEL }}>
        {placeholder}
      </span>
    </button>
  )
}

function MobileAddSlot({
  addSlot,
  onAddClick,
  disabled,
}: {
  addSlot: React.ReactNode
  onAddClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onAddClick}
      disabled={disabled || !onAddClick}
      className="shrink-0 h-[22dvh] min-h-[5.5rem] w-full bg-white border border-black flex items-center justify-center overflow-hidden disabled:cursor-default"
    >
      {addSlot}
    </button>
  )
}

type MobileStackSlot =
  | { kind: 'add' }
  | {
      kind: 'neighbor'
      image: GalleryImage | null
      placeholder: string
      onClick?: () => void
    }

function buildMobileStackSlots(
  images: GalleryImage[],
  focusedIndex: number,
  goPrev: () => void,
  goNext: () => void,
  onFocusedIndexChange: (index: number) => void
): MobileStackSlot[] {
  const atBeginning = focusedIndex < 0
  const atEnd = images.length > 0 && focusedIndex >= images.length - 1

  if (atBeginning) {
    return [
      { kind: 'add' },
      {
        kind: 'neighbor',
        image: images[0] ?? null,
        placeholder: 'Picture after',
        onClick: images[0] ? () => onFocusedIndexChange(0) : undefined,
      },
      {
        kind: 'neighbor',
        image: images[1] ?? null,
        placeholder: 'Picture after',
        onClick: images[1] ? () => onFocusedIndexChange(1) : goNext,
      },
    ]
  }

  if (atEnd) {
    const last = images.length - 1
    return [
      {
        kind: 'neighbor',
        image: images[last - 1] ?? null,
        placeholder: 'Picture before',
        onClick: last >= 1 ? () => onFocusedIndexChange(last - 2) : goPrev,
      },
      {
        kind: 'neighbor',
        image: images[last] ?? null,
        placeholder: 'Picture before',
        onClick: last >= 1 ? () => onFocusedIndexChange(last - 1) : undefined,
      },
      { kind: 'add' },
    ]
  }

  return [
    {
      kind: 'neighbor',
      image: images[focusedIndex] ?? null,
      placeholder: 'Picture before',
      onClick: goPrev,
    },
    { kind: 'add' },
    {
      kind: 'neighbor',
      image: images[focusedIndex + 1] ?? null,
      placeholder: 'Picture after',
      onClick: goNext,
    },
  ]
}

function MobileInsertCarousel({
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
  const swipeStartRef = useRef<{ y: number } | null>(null)

  const goPrev = useCallback(() => {
    onFocusedIndexChange(Math.max(-1, focusedIndex - 1))
  }, [focusedIndex, onFocusedIndexChange])

  const goNext = useCallback(() => {
    onFocusedIndexChange(Math.min(images.length - 1, focusedIndex + 1))
  }, [focusedIndex, images.length, onFocusedIndexChange])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    swipeStartRef.current = { y: e.clientY }
  }, [])

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = swipeStartRef.current
      swipeStartRef.current = null
      if (!start || disabled) return
      const delta = e.clientY - start.y
      if (delta > SWIPE_THRESHOLD_PX) goPrev()
      else if (delta < -SWIPE_THRESHOLD_PX) goNext()
    },
    [disabled, goPrev, goNext]
  )

  const stackSlots = buildMobileStackSlots(
    images,
    focusedIndex,
    goPrev,
    goNext,
    onFocusedIndexChange
  )

  return (
    <div
      className="md:hidden w-screen h-[100dvh] max-h-[100dvh] overflow-hidden touch-pan-x select-none flex flex-col"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipeStartRef.current = null
      }}
    >
      {stackSlots.map((slot, index) =>
        slot.kind === 'add' ? (
          <MobileAddSlot
            key={`add-${index}`}
            addSlot={addSlot}
            onAddClick={onAddClick}
            disabled={disabled}
          />
        ) : (
          <MobileNeighborPanel
            key={`neighbor-${index}`}
            image={slot.image}
            placeholder={slot.placeholder}
            onClick={slot.onClick}
            disabled={disabled}
          />
        )
      )}
    </div>
  )
}

function DesktopInsertCarousel({
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
      className={`hidden md:block w-screen ${SLOT_H} overflow-hidden touch-pan-y select-none`}
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
  return (
    <>
      <MobileInsertCarousel
        images={images}
        focusedIndex={focusedIndex}
        onFocusedIndexChange={onFocusedIndexChange}
        addSlot={addSlot}
        onAddClick={onAddClick}
        disabled={disabled}
      />
      <DesktopInsertCarousel
        images={images}
        focusedIndex={focusedIndex}
        onFocusedIndexChange={onFocusedIndexChange}
        addSlot={addSlot}
        onAddClick={onAddClick}
        disabled={disabled}
      />
    </>
  )
}

export function AddPictureLabel() {
  return (
    <span className="text-black text-center px-[0.5em] leading-snug" style={{ fontSize: CAPTION_MAIN }}>
      Add a picture
    </span>
  )
}
