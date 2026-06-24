import { ensureJpeg } from './heic'

const MAX_DIMENSION = 800
const JPEG_QUALITY = 0.8

/** Resize and compress for gallery upload. HEIC → JPEG, max 800px on longest side. */
export async function prepareGalleryUpload(file: File): Promise<File> {
  const jpeg = await ensureJpeg(file)
  return resizeToJpeg(jpeg, MAX_DIMENSION, JPEG_QUALITY)
}

async function resizeToJpeg(
  file: File,
  maxDimension: number,
  quality: number
): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const scale = Math.min(1, maxDimension / Math.max(width, height))
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
