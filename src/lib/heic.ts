const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']
const HEIC_EXT = /\.heic$/i
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i

export function isHeic(file: File): boolean {
  if (HEIC_TYPES.includes(file.type)) return true
  return HEIC_EXT.test(file.name)
}

/** True if file looks like an image (by type or extension). Accepts unknown type (empty string) so mobile/camera picks work. */
export function isImageFile(file: File): boolean {
  if (file.type === '' || file.type.startsWith('image/')) return true
  if (isHeic(file)) return true
  return IMAGE_EXT.test(file.name)
}

/**
 * Convert a HEIC/HEIF file to a JPEG File for upload.
 * Quality 0.82 for faster encode with minimal visual difference for comics.
 * Non-HEIC files are returned unchanged.
 */
export async function ensureJpeg(file: File): Promise<File> {
  if (!isHeic(file)) return file

  const heic2any = (await import('heic2any')).default
  const result = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.82,
  })
  const blob = Array.isArray(result) ? result[0] : result
  if (!blob || !(blob instanceof Blob)) {
    throw new Error('HEIC conversion failed')
  }
  const baseName = file.name.replace(HEIC_EXT, '') || 'image'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}
