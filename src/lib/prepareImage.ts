import { ensureJpeg, isImageFile } from './heic'

export interface PrepareImageOptions {
  maxDimension?: number
  quality?: number
}

const DEFAULT_MAX_DIMENSION = 1600
const DEFAULT_QUALITY = 0.82
const GALLERY_MAX_DIMENSION = 800
const GALLERY_QUALITY = 0.8
const WH_MAX_DIMENSION = 500
const WH_QUALITY = 0.65

/**
 * Unified image preparation: HEIC → JPEG, resize to max dimension, compress.
 * Default: 1600px max dimension, 0.82 quality (good balance of size/quality for comics).
 */
export async function prepareImage(
  file: File,
  options: PrepareImageOptions = {}
): Promise<File> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION
  const quality = options.quality ?? DEFAULT_QUALITY

  const jpeg = await ensureJpeg(file)
  return resizeToJpeg(jpeg, maxDimension, quality)
}

/** Resize and compress for gallery upload. HEIC → JPEG, max 800px on longest side. */
export async function prepareGalleryUpload(file: File): Promise<File> {
  return prepareImage(file, {
    maxDimension: GALLERY_MAX_DIMENSION,
    quality: GALLERY_QUALITY,
  })
}

/** Resize and compress for WordHack upload. HEIC → JPEG, max 500px, aggressive compression for slow connections. */
export async function prepareWhUpload(file: File): Promise<File> {
  return prepareImage(file, {
    maxDimension: WH_MAX_DIMENSION,
    quality: WH_QUALITY,
  })
}

/**
 * Extract image files from clipboard data (paste event).
 * Returns array of image Files found in the clipboard.
 */
export function getImagesFromClipboard(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData) return []

  const files: File[] = []
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file && isImageFile(file)) {
        files.push(file)
      }
    }
  }
  return files
}

async function resizeToJpeg(
  file: File,
  maxDimension: number,
  quality: number
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  // Always re-encode through canvas to guarantee real JPEG bytes.
  // iOS Safari can report HEIC files as 'image/jpeg' — those render locally
  // but fail when served from remote storage. Canvas.toBlob('image/jpeg')
  // produces universally compatible JPEG regardless of the source format.
  const longestSide = Math.max(width, height)
  const scale = Math.min(1, maxDimension / longestSide)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas not supported')
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to compress image'))),
      'image/jpeg',
      quality
    )
  })

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}
