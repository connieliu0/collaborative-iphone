import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { advanceRound, submitImages, getSessionImages, type SessionImageRow } from '../../lib/session'
import { ensureJpeg } from '../../lib/heic'

const REQUIRED_IMAGES = 3

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function ImagesRoundPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error } = useSession(code)

  const [allImages, setAllImages] = useState<SessionImageRow[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [convertingImages, setConvertingImages] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isHost = user && session && session.host_id === user.id

  useEffect(() => {
    if (!session) return
    if (session.round !== 'images') {
      const next = session.round === 'complete' ? 'results' : session.round
      navigate(`/session/${code}/${next}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  const loadImages = useCallback(async () => {
    if (!session) return
    const imgs = await getSessionImages(session.id)
    setAllImages(imgs)
    if (user) {
      const mine = imgs.filter((i) => i.user_id === user.id)
      if (mine.length >= REQUIRED_IMAGES) setSubmitted(true)
    }
  }, [session?.id, user?.id, session, user])

  useEffect(() => {
    loadImages()
  }, [loadImages])

  useEffect(() => {
    if (!session?.id) return
    const channel = supabase
      .channel(`session-images-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_images',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          loadImages()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, loadImages])

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const fileList = Array.from(files)
    // Clear after copying the FileList so we don't accidentally empty it.
    e.target.value = ''
    const arr = fileList.slice(0, REQUIRED_IMAGES - selectedFiles.length)
    setSubmitError(null)
    setConvertingImages(true)
    try {
      const converted = await Promise.all(arr.map((f) => ensureJpeg(f)))
      const validFiles = converted.filter((f): f is File => f !== null)
      const newFiles = [...selectedFiles, ...validFiles].slice(0, REQUIRED_IMAGES)
      setSelectedFiles(newFiles)
      setPreviews(newFiles.map((f) => URL.createObjectURL(f)))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to convert selected images')
      // If conversion fails, avoid leaving stale selection in UI.
      setSelectedFiles([])
      previews.forEach((u) => URL.revokeObjectURL(u))
      setPreviews([])
    } finally {
      setConvertingImages(false)
    }
  }

  const handleRemove = (index: number) => {
    URL.revokeObjectURL(previews[index])
    setSelectedFiles((f) => f.filter((_, i) => i !== index))
    setPreviews((p) => p.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!session || !user || selectedFiles.length !== REQUIRED_IMAGES) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitImages(session.id, user.id, selectedFiles)
    setSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      return
    }
    setSubmitted(true)
    previews.forEach(URL.revokeObjectURL)
    setPreviews([])
    setSelectedFiles([])
  }

  const handleAdvance = async () => {
    if (!session || !user) return
    setAdvancing(true)
    setAdvanceError(null)
    const result = await advanceRound(session.id, user.id, 'phrases')
    setAdvancing(false)
    if (result.error) {
      setAdvanceError(result.error)
      return
    }
  }

  const submittedUsers = new Set(allImages.map((i) => i.user_id))
  const submittedCount = [...submittedUsers].filter((uid) =>
    allImages.filter((i) => i.user_id === uid).length >= REQUIRED_IMAGES
  ).length
  const allSubmitted = submittedCount >= members.length


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-gray-600">{error ?? 'Session not found'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center px-4 pb-8 max-w-xl mx-auto relative">
      {(convertingImages || submitting) && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/90 backdrop-blur-sm border border-gray-200"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="h-10 w-10 shrink-0 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          <p className="text-sm font-medium text-gray-700">
            {convertingImages ? 'Converting images…' : 'Uploading images…'}
          </p>
        </div>
      )}
      <h1 className="text-lg font-semibold text-gray-900 mt-4 mb-1">What photos have you taken that resonate recently?</h1>
      <p className="text-sm text-gray-500 mb-4">Upload {REQUIRED_IMAGES} images</p>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-6">
        <div
          className="bg-gray-900 h-2 rounded-full transition-all"
          style={{ width: `${(submittedCount / Math.max(members.length, 1)) * 100}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mb-6">
        {submittedCount} / {members.length} players submitted
      </p>

      {!submitted ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            onChange={handleSelectFiles}
            className="hidden"
          />

          {previews.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={convertingImages || submitting}
              className="w-full min-h-[200px] border border-black border-dashed flex items-center justify-center p-[10px] bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-2"
              aria-label="Upload photos"
            >
              <p className="font-sans text-[16px] leading-normal text-black whitespace-nowrap">Upload Photos</p>
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between w-full mb-3">
                <p className="text-sm text-gray-500">
                  Selected {previews.length} / {REQUIRED_IMAGES}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    previews.forEach((u) => URL.revokeObjectURL(u))
                    setPreviews([])
                    setSelectedFiles([])
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full mb-4">
                {previews.map((url, i) => (
                  <div key={url} className="aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white relative">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80"
                      aria-label="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
              {previews.length < REQUIRED_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={convertingImages || submitting}
                  className="w-full min-h-[120px] border border-black border-dashed flex items-center justify-center p-[10px] bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-2"
                  aria-label="Upload more photos"
                >
                  <p className="font-sans text-[16px] leading-normal text-black whitespace-nowrap">Upload Photos</p>
                </button>
              )}
            </>
          )}

          {submitError && (
            <p className="text-sm text-red-600 mb-2" role="alert">{submitError}</p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selectedFiles.length !== REQUIRED_IMAGES}
            className={btnPrimary + ' w-full max-w-xs'}
          >
            {submitting ? 'Uploading…' : `Submit ${REQUIRED_IMAGES} Images`}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">Images submitted! Waiting for others…</p>
        </div>
      )}

      {isHost && allSubmitted && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing}
          className={btnPrimary + ' w-full max-w-xs mt-6'}
        >
          {advancing ? 'Advancing…' : 'Next: Phrases →'}
        </button>
      )}

      {advanceError && (
        <p className="text-sm text-red-600 mt-3" role="alert">
          {advanceError}
        </p>
      )}
    </div>
  )
}
