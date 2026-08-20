export const DEFAULT_COMIC_FONT_SIZE = 28
export const DEFAULT_COMIC_FONT_COLOR = '#FFE135'
export const DEFAULT_OVERLAY_Y = 85

const LEGACY_COMIC_FONT_SIZE = 18
const LEGACY_COMIC_FONT_COLOR = '#ffffff'
const LEGACY_DEFAULT_OVERLAY_Y = 90

/** Percentage points to shift bottom-anchored captions upward. */
export const CAPTION_OVERLAY_Y_NUDGE = 5

/** Smaller captions on narrow viewports in preview / live. */
export const MOBILE_CAPTION_FONT_SCALE = 0.7

export const COMIC_CAPTION_FONT_FAMILY = 'Arial, Helvetica, sans-serif'

/** Mimics an outside stroke outline (CSS text-stroke can't be outside-only). */
export const COMIC_TEXT_STROKE_SHADOW =
  '-2px -2px 0 rgba(0, 0, 0, 0.95), -2px 0 0 rgba(0, 0, 0, 0.95), -2px 2px 0 rgba(0, 0, 0, 0.95), ' +
  '0 -2px 0 rgba(0, 0, 0, 0.95), 0 2px 0 rgba(0, 0, 0, 0.95), ' +
  '2px -2px 0 rgba(0, 0, 0, 0.95), 2px 0 0 rgba(0, 0, 0, 0.95), 2px 2px 0 rgba(0, 0, 0, 0.95)'

/** Upgrade frames that still use the old default white 18px caption styling. */
export function normalizeLegacyComicCaptionStyle(
  fontSize: number,
  fontColor: string
): { fontSize: number; fontColor: string } {
  if (
    fontSize === LEGACY_COMIC_FONT_SIZE &&
    fontColor.toLowerCase() === LEGACY_COMIC_FONT_COLOR
  ) {
    return { fontSize: DEFAULT_COMIC_FONT_SIZE, fontColor: DEFAULT_COMIC_FONT_COLOR }
  }
  return { fontSize, fontColor }
}

/** Scale caption size down a bit on mobile for preview / live readability. */
export function resolveDisplayCaptionFontSize(fontSize: number, isMobile: boolean): number {
  if (!isMobile) return fontSize
  return Math.max(12, Math.round(fontSize * MOBILE_CAPTION_FONT_SCALE))
}

/** Shift captions that sit near the bottom upward without moving custom mid-frame positions. */
export function resolveCaptionOverlayY(overlayY: number): number {
  if (overlayY >= 82) {
    return Math.min(87, overlayY - CAPTION_OVERLAY_Y_NUDGE)
  }
  return overlayY
}

export function normalizeLegacyOverlayY(overlayY: number): number {
  if (overlayY === LEGACY_DEFAULT_OVERLAY_Y) {
    return DEFAULT_OVERLAY_Y
  }
  return overlayY
}
