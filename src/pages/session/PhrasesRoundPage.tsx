import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { advanceRound, submitPhrases, getSessionPhrases, type SessionPhraseRow } from '../../lib/session'

const REQUIRED_PHRASES = 4
const TIMER_SECONDS = 60

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function PhrasesRoundPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error } = useSession(code)

  const [allPhrases, setAllPhrases] = useState<SessionPhraseRow[]>([])
  const [inputs, setInputs] = useState<string[]>(Array(REQUIRED_PHRASES).fill(''))
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS)

  const isHost = user && session && session.host_id === user.id

  useEffect(() => {
    if (!session) return
    if (session.round !== 'phrases') {
      const next = session.round === 'complete' ? 'results' : session.round
      navigate(`/session/${code}/${next}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  useEffect(() => {
    if (submitted) return
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [submitted])

  const loadPhrases = useCallback(async () => {
    if (!session) return
    const phrases = await getSessionPhrases(session.id)
    setAllPhrases(phrases)
    if (user) {
      const mine = phrases.filter((p) => p.user_id === user.id)
      if (mine.length >= REQUIRED_PHRASES) setSubmitted(true)
    }
  }, [session?.id, user?.id, session, user])

  useEffect(() => {
    loadPhrases()
  }, [loadPhrases])

  useEffect(() => {
    if (!session?.id) return
    const channel = supabase
      .channel(`session-phrases-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_phrases',
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          loadPhrases()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, loadPhrases])

  const handleInputChange = (index: number, value: string) => {
    setInputs((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleSubmit = async () => {
    if (!session || !user) return
    const phrases = inputs.map((s) => s.trim()).filter(Boolean)
    if (phrases.length < REQUIRED_PHRASES) {
      setSubmitError(`Enter all ${REQUIRED_PHRASES} phrases`)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const result = await submitPhrases(session.id, user.id, phrases)
    setSubmitting(false)
    if (result.error) {
      setSubmitError(result.error)
      return
    }
    setSubmitted(true)
  }

  const handleAdvance = async () => {
    if (!session || !user) return
    setAdvanceError(null)
    setAdvancing(true)
    const result = await advanceRound(session.id, user.id, 'compose')
    setAdvancing(false)
    if (result && 'error' in result && result.error) {
      setAdvanceError(result.error)
      return
    }
    // Optimistically navigate so host transition does not depend on realtime timing.
    navigate(`/session/${code}/compose`, { replace: true })
  }

  const submittedUsers = new Set<string>()
  for (const p of allPhrases) {
    const count = allPhrases.filter((x) => x.user_id === p.user_id).length
    if (count >= REQUIRED_PHRASES) submittedUsers.add(p.user_id)
  }
  const submittedCount = submittedUsers.size
  const allSubmitted = submittedCount >= members.length

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

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
    <div className="flex flex-col items-center px-4 pb-8 max-w-xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mt-4 mb-1">Round 2: Phrases</h1>
      <p className="text-sm text-gray-500 mb-2">Write {REQUIRED_PHRASES} short captions</p>

      <div
        className={`text-2xl font-mono font-bold tabular-nums mb-4 ${timeLeft <= 10 ? 'text-red-600' : 'text-gray-900'}`}
      >
        {minutes}:{seconds.toString().padStart(2, '0')}
      </div>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
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
          <div className="w-full flex flex-col gap-3 mb-4">
            {inputs.map((val, i) => (
              <input
                key={i}
                type="text"
                value={val}
                onChange={(e) => handleInputChange(i, e.target.value)}
                placeholder={`Phrase ${i + 1}`}
                maxLength={100}
                className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
              />
            ))}
          </div>

          {submitError && (
            <p className="text-sm text-red-600 mb-2" role="alert">{submitError}</p>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || inputs.some((s) => !s.trim())}
            className={btnPrimary + ' w-full max-w-xs'}
          >
            {submitting ? 'Submitting…' : 'Submit Phrases'}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">Phrases submitted! Waiting for others…</p>
        </div>
      )}

      {isHost && allSubmitted && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing}
          className={btnPrimary + ' w-full max-w-xs mt-6'}
        >
          {advancing ? 'Advancing…' : 'Next: Compose →'}
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
