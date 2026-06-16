import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import {
  getRandomImageForUser,
  getPhrasesForUser,
  submitPairing,
  getSessionPairings,
  type SessionImageRow,
  type SessionPhraseRow,
} from '../../lib/session'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
const narrowFont: React.CSSProperties = { fontFamily: 'Arial Narrow, Arial, sans-serif' }

export function PairRoundPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error } = useSession(code)

  const [randomImage, setRandomImage] = useState<SessionImageRow | null>(null)
  const [phraseOptions, setPhraseOptions] = useState<SessionPhraseRow[]>([])
  const [selectedPhrase, setSelectedPhrase] = useState<string | null>(null)
  const [customPhrase, setCustomPhrase] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!session) return
    if (session.round !== 'compose') {
      if (session.round === 'complete') navigate(`/session/${code}/results`, { replace: true })
      else if (session.round === 'contribute') navigate(`/session/${code}/contribute`, { replace: true })
      else if (session.round === 'present') navigate(`/session/${code}/pair`, { replace: true })
      else navigate(`/session/${code}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  const loadData = useCallback(async () => {
    if (!session || !user || initialized) return

    const existing = await getSessionPairings(session.id)
    if (existing.some((p) => p.user_id === user.id)) {
      setSubmitted(true)
      setInitialized(true)
      return
    }

    const memberUserIds = members.map((m) => m.user_id)
    if (memberUserIds.length === 0) return

    const [img, phrases] = await Promise.all([
      getRandomImageForUser(session.id, user.id),
      getPhrasesForUser(session.id, user.id, memberUserIds, 2),
    ])
    setRandomImage(img)
    setPhraseOptions(phrases)
    setInitialized(true)
  }, [session?.id, user?.id, members, initialized, session, user])

  useEffect(() => { loadData() }, [loadData])

  const handleSubmit = async () => {
    if (!session || !user || !randomImage) return
    const custom = customPhrase.trim()
    const phrase = phraseOptions.find((p) => p.id === selectedPhrase)
    const phraseText = custom.length > 0 ? custom : phrase?.text
    if (!phraseText) return

    setSubmitting(true)
    setSubmitError(null)
    const result = await submitPairing(session.id, user.id, randomImage.image_url, phraseText)
    setSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      return
    }
    setSubmitted(true)
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

  if (submitted) {
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

  if (!initialized) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center px-4 pb-8 max-w-xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mt-4 mb-1">Pair It</h1>
      <p className="text-sm text-gray-500 mb-6">Choose a phrase for this image</p>

      {randomImage ? (
        <div className="w-full max-w-[320px] aspect-square rounded-lg overflow-hidden border border-gray-200 bg-white mb-6 mx-auto">
          <img src={randomImage.image_url} alt="" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-full max-w-[320px] aspect-square rounded-lg border border-dashed border-gray-300 flex items-center justify-center mb-6 mx-auto">
          <p className="text-gray-400 text-sm">No images available</p>
        </div>
      )}

      <div className="w-full flex flex-wrap gap-2 justify-center mb-6">
        {phraseOptions.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedPhrase(selectedPhrase === p.id ? null : p.id)
              setCustomPhrase('')
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              selectedPhrase === p.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
            }`}
          >
            {p.text}
          </button>
        ))}
      </div>

      {phraseOptions.length === 0 && (
        <p className="text-sm text-gray-400 mb-4">No phrases available yet.</p>
      )}

      <div className="w-full mb-4">
        <p className="text-xs text-gray-500 mb-2 text-center">Or write your own phrase</p>
        <input
          type="text"
          value={customPhrase}
          onChange={(e) => {
            setCustomPhrase(e.target.value)
            if (e.target.value.trim().length > 0) setSelectedPhrase(null)
          }}
          placeholder="Type your own phrase..."
          maxLength={140}
          className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>

      {submitError && (
        <p className="text-sm text-red-600 mb-2" role="alert">{submitError}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !randomImage || (!selectedPhrase && customPhrase.trim().length === 0)}
        className={btnPrimary + ' w-full max-w-xs'}
      >
        {submitting ? 'Submitting…' : 'Submit Pairing'}
      </button>
    </div>
  )
}
