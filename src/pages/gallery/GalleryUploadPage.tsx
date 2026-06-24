import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  cancelQueueEntry,
  confirmGalleryUpload,
  countPeopleAhead,
  fetchActiveQueueForSession,
  generateCaption,
  getNeighborImages,
  getUserSessionId,
  joinUploadQueue,
  uploadStagedImage,
  type GalleryImage,
  type UploadQueueEntry,
} from '../../lib/gallery'
import { FrameContent } from '../ComicViewerPage'
import { useDisplayState } from '../../hooks/useDisplayState'
import { useGalleryImages } from '../../hooks/useGalleryImages'

const ACTIVE_TIMEOUT_MS = 60_000
const btn =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm disabled:opacity-50'

type Step = 'mirror' | 'waiting' | 'confirm' | 'processing'

export function GalleryUploadPage() {
  const navigate = useNavigate()
  const sessionId = useMemo(() => getUserSessionId(), [])
  const { images } = useGalleryImages()
  const { state: displayState } = useDisplayState()

  const [step, setStep] = useState<Step>('mirror')
  const [queueEntry, setQueueEntry] = useState<UploadQueueEntry | null>(null)
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null)
  const [waitingCount, setWaitingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentDisplayImage: GalleryImage | null = useMemo(() => {
    if (!displayState?.current_image_id) return images[images.length - 1] ?? null
    return images.find((img) => img.id === displayState.current_image_id) ?? images[0] ?? null
  }, [displayState?.current_image_id, images])

  const refreshQueueEntry = useCallback(async () => {
    const entry = await fetchActiveQueueForSession(sessionId)
    if (!entry) {
      setQueueEntry(null)
      setStep('mirror')
      return
    }
    setQueueEntry(entry)
    if (entry.status === 'waiting') {
      setStep('waiting')
      const ahead = await countPeopleAhead(entry)
      setWaitingCount(ahead)
    } else if (entry.status === 'active') {
      setStep('confirm')
      setStagedPreviewUrl(entry.staged_image_url)
    }
  }, [sessionId])

  useEffect(() => {
    void refreshQueueEntry()
  }, [refreshQueueEntry])

  useEffect(() => {
    const channel = supabase
      .channel(`upload-queue-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'upload_queue' },
        () => {
          void refreshQueueEntry()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId, refreshQueueEntry])

  useEffect(() => {
    if (step !== 'confirm' || !queueEntry) return

    timeoutRef.current = window.setTimeout(() => {
      void cancelQueueEntry(queueEntry.id).then(() => {
        setError('Timed out. Please try again.')
        setStep('mirror')
        setQueueEntry(null)
        setStagedPreviewUrl(null)
      })
    }, ACTIVE_TIMEOUT_MS)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [step, queueEntry])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setUploading(true)
    try {
      const localPreview = URL.createObjectURL(file)
      setStagedPreviewUrl(localPreview)

      const stagedUrl = await uploadStagedImage(file, sessionId)
      const entry = await joinUploadQueue(sessionId, stagedUrl)
      setQueueEntry(entry)

      if (entry.status === 'active') {
        setStep('confirm')
      } else {
        setStep('waiting')
        const ahead = await countPeopleAhead(entry)
        setWaitingCount(ahead)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setStagedPreviewUrl(null)
    } finally {
      setUploading(false)
    }
  }

  const handleCancel = async () => {
    if (!queueEntry) {
      setStep('mirror')
      setStagedPreviewUrl(null)
      return
    }
    await cancelQueueEntry(queueEntry.id)
    setQueueEntry(null)
    setStagedPreviewUrl(null)
    setStep('mirror')
  }

  const handleConfirm = async () => {
    if (!queueEntry || !stagedPreviewUrl) return

    setStep('processing')
    setError(null)

    try {
      const insertAfterId = displayState?.current_image_id ?? currentDisplayImage?.id ?? null
      const { before, after } = getNeighborImages(images, insertAfterId)

      const caption = await generateCaption({
        uploadedImageUrl: queueEntry.staged_image_url,
        beforeImageUrl: before?.image_url ?? null,
        afterImageUrl: after?.image_url ?? null,
      })

      const newImage = await confirmGalleryUpload(queueEntry.id, insertAfterId, caption)
      navigate(`/gallery/result/${newImage.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm upload')
      setStep('confirm')
    }
  }

  return (
    <div className="min-h-screen max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">
      <h1 className="text-lg font-medium">Add to the sequence</h1>

      <section aria-label="Live display mirror">
        <p className="text-xs text-gray-500 mb-2">Now showing on screen</p>
        <div className="aspect-[4/3] w-full rounded overflow-hidden border border-gray-200">
          {currentDisplayImage ? (
            <FrameContent
              frame={{
                image_url: currentDisplayImage.image_url,
                caption: currentDisplayImage.caption,
                overlay_x: 50,
                overlay_y: 87,
                font_size: 16,
                font_color: '#ffffff',
              }}
              showCaption={false}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100 text-gray-500 text-sm">
              No images yet — yours will be first
            </div>
          )}
        </div>
      </section>

      {step === 'mirror' && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            className={btn + ' w-full'}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Choose image'}
          </button>
        </div>
      )}

      {step === 'waiting' && (
        <div className="text-center text-sm text-gray-600">
          <p>Waiting for {waitingCount} other {waitingCount === 1 ? 'person' : 'people'}…</p>
          <p className="text-xs text-gray-400 mt-2">The screen above keeps updating</p>
          <button type="button" className="mt-4 text-sm underline" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}

      {step === 'confirm' && stagedPreviewUrl && (
        <div className="flex flex-col gap-4">
          <p className="text-sm">Your image will appear after the one on screen.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 aspect-[4/3] rounded overflow-hidden border border-gray-200">
              {currentDisplayImage ? (
                <img src={currentDisplayImage.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="h-full bg-gray-100" />
              )}
            </div>
            <span className="text-gray-400">→</span>
            <div className="flex-1 aspect-[4/3] rounded overflow-hidden border border-gray-200">
              <img src={stagedPreviewUrl} alt="" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btn + ' flex-1'} onClick={handleConfirm}>
              Confirm
            </button>
            <button
              type="button"
              className="min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-sm flex-1"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <p className="text-sm text-gray-600 text-center">Writing caption…</p>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
