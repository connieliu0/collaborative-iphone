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

interface ContributeRoundPageProps {
  mockRoundNumber?: 1 | 2 | 3
}

const MOCK_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1080' height='1080' viewBox='0 0 1080 1080'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23e2e8f0'/%3E%3Cstop offset='100%25' stop-color='%23cbd5e1'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1080' height='1080' fill='url(%23g)'/%3E%3Ctext x='540' y='520' text-anchor='middle' font-size='72' fill='%23475569' font-family='Arial'%3EUI Preview Image%3C/text%3E%3C/svg%3E"

export function ContributeRoundPage({ mockRoundNumber }: ContributeRoundPageProps = {}) {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, loading, error } = useSession(code)
  const isUiTest = mockRoundNumber !== undefined

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

  const roundNumber = mockRoundNumber ?? session?.round_number ?? 1

  useEffect(() => {
    if (isUiTest) return
    if (!session) return
    if (session.round !== 'contribute') {
      if (session.round === 'complete') navigate(`/session/${code}/results`, { replace: true })
      else if (session.round === 'present') navigate(`/session/${code}/pair`, { replace: true })
      else navigate(`/session/${code}`, { replace: true })
    }
  }, [session?.round, code, navigate, session, isUiTest])

  const loadProgress = useCallback(async () => {
    if (isUiTest) return
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
  }, [session?.id, roundNumber, user?.id, session, user, isUiTest])

  useEffect(() => { loadProgress() }, [loadProgress])

  useEffect(() => {
    if (isUiTest) return
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
  }, [session?.id, user?.id, roundNumber, isUiTest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (roundNumber !== 3 || pairingLoaded) return
    if (isUiTest) {
      setPairingImage({
        id: 'ui-test-image',
        session_id: 'ui-test-session',
        user_id: 'ui-test-user',
        image_url: MOCK_IMAGE_URL,
        round_number: 3,
        created_at: new Date().toISOString(),
      })
      const mockPhrases: SessionPhraseRow[] = [
        { id: 'ui-test-p1', session_id: 'ui-test-session', user_id: 'ui-test-user', text: 'A spark in stillness', used_by: null, round_number: 3, created_at: new Date().toISOString() },
        { id: 'ui-test-p2', session_id: 'ui-test-session', user_id: 'ui-test-user', text: 'Between noise and breath', used_by: null, round_number: 3, created_at: new Date().toISOString() },
      ]
      setPairingPhrases(mockPhrases)
      setSelectedPhraseId(mockPhrases[0].id)
      setPairingLoaded(true)
      return
    }
    if (!session?.id || !user?.id) return
    Promise.all([
      getRandomImageForUser(session.id, user.id),
      getRandomPhrases(session.id, 20),
    ]).then(([img, phrases]) => {
      setPairingImage(img)
      setPairingPhrases(phrases)
      if (phrases.length > 0) setSelectedPhraseId(phrases[0].id)
      setPairingLoaded(true)
    })
  }, [roundNumber, session?.id, user?.id, pairingLoaded, isUiTest])

  useEffect(() => {
    if (isUiTest) return
    if (!session?.id) return
    const channel = supabase
      .channel(`contribute-${session.id}-${roundNumber}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_images', filter: `session_id=eq.${session.id}` }, () => loadProgress())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_phrases', filter: `session_id=eq.${session.id}` }, () => loadProgress())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_pairings', filter: `session_id=eq.${session.id}` }, () => loadProgress())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, roundNumber, loadProgress, isUiTest])

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
    if (isUiTest) {
      setImageSubmitted(true)
      return
    }
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
    if (isUiTest) {
      setPhraseSubmitted(true)
      return
    }
    if (!session || !user || !phrase.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitPhrases(session.id, user.id, [phrase.trim()], roundNumber)
    setSubmitting(false)
    if (result.error) { setSubmitError(result.error); return }
    setPhraseSubmitted(true)
  }

  const handlePairingSubmit = async () => {
    if (isUiTest) {
      setPairingSubmitted(true)
      return
    }
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

  if (!isUiTest && loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    )
  }

  if (!isUiTest && (error || !session)) {
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
        className="fixed inset-0 z-10 flex flex-col px-5 sm:px-7 pt-8 sm:pt-10 pb-8 gap-4 overflow-y-auto"
        style={{ background: 'radial-gradient(ellipse at center, #c88cff 0%, #e3c6ff 50%, #ffffff 100%)' }}
      >
        {submitting && (
          <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3" aria-live="polite">
            <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
            <p className="text-sm font-medium text-gray-700">Submitting…</p>
          </div>
        )}

        <div className="flex flex-col gap-6 items-center">
          <p className="text-xl sm:text-2xl text-center text-[#808080] w-full" style={narrowFont}>
            PART 3: WORD + IMAGE
          </p>
          <p className="text-justify w-full leading-tight sm:leading-9" style={narrowFont}>
            <span className="text-[24] sm:text-[40px]">What do you want to </span>
            <span className="italic text-[44px] sm:text-[56px]">express</span>
            <span className="text-[24] sm:text-[40px]">?</span>
          </p>
        </div>

        <div className="flex-1 border-2 border-[#808080] bg-white overflow-hidden min-h-[220px] sm:min-h-0 flex items-center justify-center p-2">
          {pairingImage ? (
            <img src={pairingImage.image_url} alt="" className="max-w-full max-h-full object-contain" />
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
          className="w-full bg-white/50 border-2 border-[#808080] p-[10px] text-[20px] sm:text-[22px] text-black appearance-none"
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
          <span className="text-[34px] sm:text-[40px] text-white leading-none" style={narrowFont}>Submit</span>
        </button>
      </div>
    )
  }

  // ── Round 1: IMAGE ─────────────────────────────────────────────────────────
  if (roundNumber === 1) {
    return (
      <div
        className="fixed inset-0 z-10 flex flex-col px-5 sm:px-7 pt-8 sm:pt-10 pb-8 overflow-y-auto"
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
          <p className="text-xl sm:text-2xl text-center text-[#808080] w-full" style={narrowFont}>
            PART 1: IMAGE
          </p>
          <p className="text-justify w-full leading-tight sm:leading-9" style={narrowFont}>
            <span className="text-[24] sm:text-[40px]">Upload an </span>
            <span className="italic text-[44px] sm:text-[56px]">image</span>
            <span className="text-[24] sm:text-[40px]"> that resonated this week</span>
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
            <div className="relative w-fit max-w-full border-2 border-black overflow-hidden bg-white mx-auto">
              <img src={preview} alt="" className="block max-w-full max-h-[52vh] object-contain" />
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
          <span className="text-[34px] sm:text-[40px] text-white leading-none" style={narrowFont}>Submit</span>
        </button>
      </div>
    )
  }

  // ── Round 2: WORD ──────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-10 flex flex-col px-5 sm:px-7 pt-8 sm:pt-10 pb-8 gap-4 overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse at center, #8ce8ff 0%, #c6f4ff 50%, #ffffff 100%)' }}
    >
      {submitting && (
        <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3" aria-live="polite">
          <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
          <p className="text-sm font-medium text-gray-700">Submitting…</p>
        </div>
      )}

      <div className="flex flex-col gap-6 items-center">
        <p className="text-xl sm:text-2xl text-center text-[#808080] w-full" style={narrowFont}>
          PART 2: WORD
        </p>
        <p className="text-justify w-full leading-tight sm:leading-9" style={narrowFont}>
          <span className="text-[24] sm:text-[40px]">Upload a </span>
          <span className="italic text-[44px] sm:text-[56px]">phrase</span>
          <span className="text-[24] sm:text-[40px]"> that slipped through your mind this week</span>
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
            className="absolute top-[10px] left-[10px] text-[#808080] text-[54px] sm:text-[72px] leading-none pointer-events-none"
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
        <span className="text-[34px] sm:text-[40px] text-white leading-none" style={narrowFont}>Submit</span>
      </button>
    </div>
  )
}
