import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  AddPictureLabel,
  SequenceInsertCarousel,
} from '../../components/SequenceInsertCarousel'
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
  type UploadQueueEntry,
} from '../../lib/gallery'
import { prepareGalleryUpload } from '../../lib/prepareImage'
import { useDisplayState } from '../../hooks/useDisplayState'
import { useGalleryImages } from '../../hooks/useGalleryImages'

const ACTIVE_TIMEOUT_MS = 60_000

type Step = 'mirror' | 'waiting' | 'confirm' | 'processing'

function displayIndexFromState(
  images: { id: string }[],
  currentImageId: string | null | undefined
): number {
  if (currentImageId) {
    const idx = images.findIndex((img) => img.id === currentImageId)
    if (idx >= 0) return idx
  }
  return images.length > 0 ? images.length - 1 : -1
}

export function GalleryUploadPage() {
  const navigate = useNavigate()
  const sessionId = useMemo(() => getUserSessionId(), [])
  const { images } = useGalleryImages()
  const { state: displayState } = useDisplayState()

  const [step, setStep] = useState<Step>('mirror')
  const [queueEntry, setQueueEntry] = useState<UploadQueueEntry | null>(null)
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null)
  const [, setWaitingCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const timeoutRef = useRef<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const syncedIndex = useMemo(
    () => displayIndexFromState(images, displayState?.current_image_id),
    [displayState?.current_image_id, images]
  )

  useEffect(() => {
    setFocusedIndex(syncedIndex)
  }, [syncedIndex])

  const insertAfterId = useMemo(() => {
    if (focusedIndex < 0) return null
    return images[focusedIndex]?.id ?? null
  }, [focusedIndex, images])

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
      const prepared = await prepareGalleryUpload(file)
      const localPreview = URL.createObjectURL(prepared)
      setStagedPreviewUrl(localPreview)

      const stagedUrl = await uploadStagedImage(prepared, sessionId)
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
      const { before, after } =
        images.length > 0 ? getNeighborImages(images, insertAfterId) : { before: null, after: null }

      const caption = await generateCaption({
        uploadedImageUrl: queueEntry.staged_image_url,
        beforeCaption: before?.caption ?? null,
        afterCaption: after?.caption ?? null,
      })

      const newImage = await confirmGalleryUpload(queueEntry.id, insertAfterId, caption)
      navigate(`/gallery/result/${newImage.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm upload')
      setStep('confirm')
    }
  }

  const handleAddClick = () => {
    if (step === 'mirror' && !uploading) {
      fileInputRef.current?.click()
    } else if (step === 'confirm') {
      void handleConfirm()
    }
  }

  const carouselDisabled = step === 'processing' || uploading
  const addSlotContent = (() => {
    if (uploading || step === 'waiting') {
      return (
        <span className="block w-[clamp(1.75rem,8vw,2.5rem)] h-[clamp(1.75rem,8vw,2.5rem)] rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
      )
    }
    if ((step === 'confirm' || step === 'processing') && stagedPreviewUrl) {
      return (
        <img
          src={stagedPreviewUrl}
          alt=""
          className="h-[100dvh] max-h-[100dvh] w-auto object-contain block"
          draggable={false}
        />
      )
    }
    return <AddPictureLabel />
  })()

  return (
    <div className="relative left-1/2 -translate-x-1/2 w-screen h-[100dvh] max-h-[100dvh] -my-6 overflow-hidden flex flex-col items-center justify-center">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <SequenceInsertCarousel
        images={images}
        focusedIndex={focusedIndex}
        onFocusedIndexChange={setFocusedIndex}
        addSlot={addSlotContent}
        onAddClick={step === 'mirror' || step === 'confirm' ? handleAddClick : undefined}
        disabled={carouselDisabled}
      />

      {(step === 'waiting' || step === 'confirm') && (
        <button
          type="button"
          onClick={() => void handleCancel()}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-700"
          aria-label="Cancel"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {error && (
        <p className="absolute bottom-6 left-4 right-4 text-sm text-red-600 text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
