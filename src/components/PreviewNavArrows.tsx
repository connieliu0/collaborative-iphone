export interface PreviewNavArrowsProps {
  onPrev: () => void
  onNext: () => void
  canGoPrev?: boolean
  canGoNext?: boolean
  /** When true, arrows stay enabled even at the ends (for wrap-around carousels). */
  wrap?: boolean
  /** `dark` = frosted white on dark surfaces (preview). `light` = darker chrome for gray/light bars. */
  tone?: 'dark' | 'light'
}

const toneClass: Record<'dark' | 'light', string> = {
  dark: 'bg-white/20 text-white hover:bg-white/30',
  light: 'bg-black/15 text-black hover:bg-black/25',
}

const arrowButtonClass =
  'absolute top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full backdrop-blur-sm disabled:opacity-30 disabled:pointer-events-none transition-all'

export function PreviewNavArrows({
  onPrev,
  onNext,
  canGoPrev = true,
  canGoNext = true,
  wrap = false,
  tone = 'dark',
}: PreviewNavArrowsProps) {
  const prevEnabled = wrap || canGoPrev
  const nextEnabled = wrap || canGoNext

  return (
    <>
      <button
        type="button"
        onClick={onPrev}
        disabled={!prevEnabled}
        className={`${arrowButtonClass} ${toneClass[tone]} left-2 sm:left-4`}
        aria-label="Previous frame"
      >
        <svg className="w-7 h-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!nextEnabled}
        className={`${arrowButtonClass} ${toneClass[tone]} right-2 sm:right-4`}
        aria-label="Next frame"
      >
        <svg className="w-7 h-7 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </>
  )
}
