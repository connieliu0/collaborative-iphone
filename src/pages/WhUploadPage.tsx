import { useRef, useState } from 'react'
import { prepareGalleryUpload } from '../lib/prepareImage'
import { uploadWhPhoto } from '../lib/whPhotos'

type Step = 'pick' | 'uploading' | 'done'

export function WhUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [step, setStep] = useState<Step>('pick')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const setPreview = (url: string | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = url
    setPreviewUrl(url)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setStep('uploading')
    setPreview(URL.createObjectURL(file))

    try {
      const prepared = await prepareGalleryUpload(file)
      await uploadWhPhoto(prepared)
      setPreview(null)
      setStep('done')
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStep('pick')
    }
  }

  const handleReset = () => {
    setPreview(null)
    setError(null)
    setStep('pick')
  }

  return (
    <div className="relative left-1/2 -translate-x-1/2 w-screen h-[100dvh] max-h-[100dvh] -my-6 overflow-hidden flex flex-col bg-white p-4 box-border">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFileChange(e)}
      />

      {step === 'pick' && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 w-full min-h-0 flex flex-col items-center justify-center gap-3 bg-white border border-black text-black"
        >
          <span className="text-3xl leading-none select-none" aria-hidden>
            +
          </span>
          <span className="text-base leading-snug">Add a photo</span>
        </button>
      )}

      {step === 'uploading' && (
        <div className="relative flex-1 w-full min-h-0 flex items-center justify-center bg-white border border-black overflow-hidden">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="max-h-full max-w-full object-contain" />
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center bg-white/40">
            <span className="block w-8 h-8 rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
          </div>
        </div>
      )}

      {step === 'done' && (
        <button
          type="button"
          onClick={handleReset}
          className="flex-1 w-full min-h-0 flex flex-col items-center justify-center bg-white border border-black text-black text-base leading-snug"
        >
          Thank you
        </button>
      )}

      {error && (
        <p className="absolute bottom-8 left-4 right-4 text-sm text-red-600 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
