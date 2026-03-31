import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  submitImages,
  submitPhrases,
  getContributionCountForRound,
  getRandomImageForUser,
  getRandomPhrases,
  submitPairing,
  getSessionPairings,
  type SessionImageRow,
  type SessionPhraseRow,
} from '../../lib/session'
import { ensureJpeg } from '../../lib/heic'

const narrowFont: React.CSSProperties = { fontFamily: 'Arial Narrow, Arial, sans-serif' }

export function ContributeRoundPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, loading, error } = useSession(code)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)
  const [imageSubmitted, setImageSubmitted] = useState(false)

  const [phrase, setPhrase] = useState('')
  const [phraseSubmitted, setPhraseSubmitted] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [pairingImage, setPairingImage] = useState<SessionImageRow | null>(null)
  const [pairingPhrases, setPairingPhrases] = useState<SessionPhraseRow[]>([])
  const [selectedPhraseId, setSelectedPhraseId] = useState<string>('')
  const [pairingSubmitted, setPairingSubmitted] = useState(false)
  const [pairingLoaded, setPairingLoaded] = useState(false)

  const roundNumber = session?.round_number ?? 1

  useEffect(() => {
    if (!session) return
    if (session.round !== 'contribute') {
      if (session.round === 'complete') navigate(`/session/${code}/results`, { replace: true })
      else if (session.round === 'present') navigate(`/session/${code}/pair`, { replace: true })
      else navigate(`/session/${code}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  const loadProgress = useCallback(async () => {
    if (!session || !user) return

    if (roundNumber === 3) {
      const pairings = await getSessionPairings(session.id)
      if (pairings.some((p) => p.user_id === user.id)) {
        setPairingSubmitted(true)
      }
    } else if (roundNumber === 1) {
      const { imageUsers } = await getContributionCountForRound(session.id, roundNumber)
      if (imageUsers.has(user.id)) setImageSubmitted(true)
    } else if (roundNumber === 2) {
      const { phraseUsers } = await getContributionCountForRound(session.id, roundNumber)
      if (phraseUsers.has(user.id)) setPhraseSubmitted(true)
    }
  }, [session?.id, roundNumber, user?.id, session, user])

  useEffect(() => { loadProgress() }, [loadProgress])

  useEffect(() => {
    if (!session?.id || !user?.id) return
    setSelectedFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setPhrase('')
    setSubmitError(null)
    setImageSubmitted(false)
    setPhraseSubmitted(false)
    setPairingLoaded(false)
    setPairingSubmitted(false)
    setSelectedPhraseId('')

    loadProgress()
  }, [session?.id, user?.id, roundNumber]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (roundNumber !== 3 || !session?.id || !user?.id || pairingLoaded) return
    Promise.all([
      getRandomImageForUser(session.id, user.id),
      getRandomPhrases(session.id, 20),
    ]).then(([img, phrases]) => {
      setPairingImage(img)
      setPairingPhrases(phrases)
      if (phrases.length > 0) setSelectedPhraseId(phrases[0].id)
      setPairingLoaded(true)
    })
  }, [roundNumber, session?.id, user?.id, pairingLoaded])

  useEffect(() => {
    if (!session?.id) return
    const channel = supabase
      .channel(`contribute-${session.id}-${roundNumber}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_images', filter: `session_id=eq.${session.id}` }, () => loadProgress())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_phrases', filter: `session_id=eq.${session.id}` }, () => loadProgress())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_pairings', filter: `session_id=eq.${session.id}` }, () => loadProgress())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, roundNumber, loadProgress])

  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const file = files[0]
    e.target.value = ''
    setSubmitError(null)
    setConverting(true)
    try {
      const converted = await ensureJpeg(file)
      if (!converted) throw new Error('Could not process image')
      setSelectedFile(converted)
      setPreview(URL.createObjectURL(converted))
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to convert image')
      setSelectedFile(null)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(null)
    } finally {
      setConverting(false)
    }
  }

  const handleImageSubmit = async () => {
    if (!session || !user || !selectedFile) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitImages(session.id, user.id, [selectedFile], roundNumber)
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    setImageSubmitted(true)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setSelectedFile(null)
  }

  const handlePhraseSubmit = async () => {
    if (!session || !user || !phrase.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitPhrases(session.id, user.id, [phrase.trim()], roundNumber)
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    setPhraseSubmitted(true)
  }

  const handlePairingSubmit = async () => {
    if (!session || !user || !pairingImage) return
    const selectedPhrase = pairingPhrases.find((p) => p.id === selectedPhraseId)
    if (!selectedPhrase) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitPairing(session.id, user.id, pairingImage.image_url, selectedPhrase.text)
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    setPairingSubmitted(true)
  }

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

  // ── Submitted states ──────────────────────────────────────────────────────

  if (roundNumber === 3 && pairingSubmitted) {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3"
        style={{ background: 'radial-gradient(ellipse at center, #c88cff 0%, #e3c6ff 50%, #ffffff 100%)' }}
      >
        <p className="text-[40px] text-black" style={narrowFont}>Paired!</p>
        <p className="text-[18px] text-[#808080] mt-2" style={narrowFont}>Waiting for the host…</p>
      </div>
    )
  }

  if (roundNumber === 1 && imageSubmitted) {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3"
        style={{ background: 'radial-gradient(ellipse at center, #f7ff8c 0%, #fbffc6 50%, #ffffff 100%)' }}
      >
        <p className="text-[40px] text-black" style={narrowFont}>Image uploaded!</p>
        <p className="text-[18px] text-[#808080] mt-2" style={narrowFont}>Waiting for the host…</p>
      </div>
    )
  }

  if (roundNumber === 2 && phraseSubmitted) {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3"
        style={{ background: 'radial-gradient(ellipse at center, #f7ff8c 0%, #fbffc6 50%, #ffffff 100%)' }}
      >
        <p className="text-[40px] text-black" style={narrowFont}>Phrase submitted!</p>
        <p className="text-[18px] text-[#808080] mt-2" style={narrowFont}>Waiting for the host…</p>
      </div>
    )
  }

  // ── Round 3: WORD + IMAGE (pairing) ────────────────────────────────────────
  if (roundNumber === 3) {
    if (!pairingLoaded) {
      return (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
        </div>
      )
    }

    return (
      <div
        className="fixed inset-0 z-10 flex flex-col px-7 pt-10 pb-8 gap-4"
        style={{ background: 'radial-gradient(ellipse at center, #c88cff 0%, #e3c6ff 50%, #ffffff 100%)' }}
      >
        {submitting && (
          <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3" aria-live="polite">
            <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
            <p className="text-sm font-medium text-gray-700">Submitting…</p>
          </div>
        )}

        <div className="flex flex-col gap-6 items-center">
          <p className="text-2xl text-center text-[#808080] w-full" style={narrowFont}>
            PART 3: WORD + IMAGE
          </p>
          <p className="text-justify w-full leading-9" style={narrowFont}>
            <span className="text-[40px]">What do you want to </span>
            <span className="italic text-[56px]">express</span>
            <span className="text-[40px]">?</span>
          </p>
        </div>

        <div className="flex-1 border-2 border-[#808080] bg-white overflow-hidden min-h-0">
          {pairingImage ? (
            <img src={pairingImage.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-[#808080] text-sm" style={narrowFont}>No image available</p>
            </div>
          )}
        </div>

        <select
          value={selectedPhraseId}
          onChange={(e) => setSelectedPhraseId(e.target.value)}
          disabled={pairingPhrases.length === 0}
          className="w-full bg-white/50 border-2 border-[#808080] p-[10px] text-[22px] text-black appearance-none"
          style={{
            ...narrowFont,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 10px center',
            backgroundSize: '24px',
            paddingRight: '40px',
          }}
        >
          {pairingPhrases.length === 0 && (
            <option value="">No phrases yet…</option>
          )}
          {pairingPhrases.map((p) => (
            <option key={p.id} value={p.id}>{p.text}</option>
          ))}
        </select>

        {submitError && (
          <p className="text-sm text-red-600 text-center" role="alert">{submitError}</p>
        )}

        <button
          type="button"
          onClick={handlePairingSubmit}
          disabled={submitting || !pairingImage || pairingPhrases.length === 0}
          className="w-full bg-[#808080] border-2 border-black flex items-center justify-center p-[10px] disabled:opacity-40"
        >
          <span className="text-[40px] text-white leading-none" style={narrowFont}>Submit</span>
        </button>
      </div>
    )
  }

  // ── Round 1: IMAGE ─────────────────────────────────────────────────────────
  if (roundNumber === 1) {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col px-7 pt-10 pb-8"
        style={{ background: 'radial-gradient(ellipse at center, #ff8c8c 0%, #ffc6c6 50%, #ffffff 100%)' }}
      >
        {(converting || submitting) && (
          <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3" aria-live="polite">
            <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
            <p className="text-sm font-medium text-gray-700">
              {converting ? 'Converting image…' : 'Uploading…'}
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          onChange={handleSelectFile}
          className="hidden"
        />

        <div className="flex flex-col gap-6 items-center">
          <p className="text-2xl text-center text-[#808080] w-full" style={narrowFont}>
            PART 1: IMAGE
          </p>
          <p className="text-justify w-full leading-9" style={narrowFont}>
            <span className="text-[40px]">Upload an </span>
            <span className="italic text-[56px]">image</span>
            <span className="text-[40px]"> that resonated this week</span>
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center">
          {!preview ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={converting}
              className="bg-white border-2 border-black flex items-center justify-center p-[10px] hover:bg-gray-50 transition-colors"
              aria-label="Upload photo"
            >
              <span className="text-[72px] text-[#808080] leading-none" style={narrowFont}>Upload</span>
            </button>
          ) : (
            <div className="relative w-full max-w-xs aspect-square border-2 border-black overflow-hidden bg-white">
              <img src={preview} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  if (preview) URL.revokeObjectURL(preview)
                  setPreview(null)
                  setSelectedFile(null)
                }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-sm hover:bg-black/80"
                aria-label="Remove"
              >
                &times;
              </button>
            </div>
          )}
        </div>

        {submitError && (
          <p className="text-sm text-red-600 mb-2 text-center" role="alert">{submitError}</p>
        )}

        <button
          type="button"
          onClick={handleImageSubmit}
          disabled={!selectedFile || converting || submitting}
          className="w-full bg-[#808080] border-2 border-black flex items-center justify-center p-[10px] disabled:opacity-40"
        >
          <span className="text-[40px] text-white leading-none" style={narrowFont}>Submit</span>
        </button>
      </div>
    )
  }

  // ── Round 2: WORD ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-10 flex flex-col px-7 pt-10 pb-8 gap-4"
      style={{ background: 'radial-gradient(ellipse at center, #8ce8ff 0%, #c6f4ff 50%, #ffffff 100%)' }}
    >
      {submitting && (
        <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3" aria-live="polite">
          <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          <p className="text-sm font-medium text-gray-700">Submitting…</p>
        </div>
      )}

      <div className="flex flex-col gap-6 items-center">
        <p className="text-2xl text-center text-[#808080] w-full" style={narrowFont}>
          PART 2: WORD
        </p>
        <p className="text-justify w-full leading-9" style={narrowFont}>
          <span className="text-[40px]">Upload a </span>
          <span className="italic text-[56px]">phrase</span>
          <span className="text-[40px]"> that slipped through your mind this week</span>
        </p>
      </div>

      <div className="flex-1 relative">
        <textarea
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          maxLength={200}
          className="w-full h-full resize-none border-2 border-[#808080] bg-white/50 p-[10px] text-black focus:outline-none text-[24px]"
          style={narrowFont}
          aria-label="Your phrase"
        />
        {!phrase && (
          <span
            className="absolute top-[10px] left-[10px] text-[#808080] text-[72px] leading-none pointer-events-none"
            style={narrowFont}
          >
            Type here..
          </span>
        )}
      </div>

      {submitError && (
        <p className="text-sm text-red-600 text-center" role="alert">{submitError}</p>
      )}

      <button
        type="button"
        onClick={handlePhraseSubmit}
        disabled={submitting || !phrase.trim()}
        className="w-full bg-[#808080] border-2 border-black flex items-center justify-center p-[10px] disabled:opacity-40"
      >
        <span className="text-[40px] text-white leading-none" style={narrowFont}>Submit</span>
      </button>
    </div>
  )
}
