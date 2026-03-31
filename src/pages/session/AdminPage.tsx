import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  advancePerformanceRound,
  getContributionCountForRound,
  getSessionPairings,
  togglePairingFeatured,
  type SessionPairingRow,
} from '../../lib/session'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

const ROUND_NAMES: Record<number, string> = { 1: 'Image', 2: 'Phrase', 3: 'Pair' }

function roundLabel(round: string, roundNumber: number): string {
  switch (round) {
    case 'lobby': return 'Lobby'
    case 'contribute': return `Round ${roundNumber} of 3 — ${ROUND_NAMES[roundNumber] ?? ''}`
    case 'present': return 'Present'
    case 'complete': return 'Complete'
    default: return round
  }
}

function nextRoundLabel(round: string, roundNumber: number): string {
  switch (round) {
    case 'lobby': return 'Start → Round 1 (Image)'
    case 'contribute':
      if (roundNumber === 1) return 'Next → Round 2 (Phrase)'
      if (roundNumber === 2) return 'Next → Round 3 (Pair)'
      return 'Next → Present'
    case 'present': return 'End Session'
    default: return 'Advance'
  }
}

export function AdminPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error } = useSession(code)

  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [imageCount, setImageCount] = useState(0)
  const [phraseCount, setPhraseCount] = useState(0)
  const [pairingsSubmittedCount, setPairingsSubmittedCount] = useState(0)
  const [pairings, setPairings] = useState<SessionPairingRow[]>([])
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const isHost = user && session && session.host_id === user.id

  useEffect(() => {
    if (!loading && session && user && !isHost) {
      navigate(`/session/${code}`, { replace: true })
    }
  }, [loading, session, user, isHost, code, navigate])

  const loadContributeProgress = useCallback(async () => {
    if (!session || session.round !== 'contribute') return
    const { imageUsers, phraseUsers } = await getContributionCountForRound(session.id, session.round_number)
    setImageCount(imageUsers.size)
    setPhraseCount(phraseUsers.size)
  }, [session?.id, session?.round, session?.round_number])

  const loadPairings = useCallback(async () => {
    if (!session) return
    const p = await getSessionPairings(session.id)
    setPairings(p)
    const uniqueUsers = new Set(p.map((x) => x.user_id))
    setPairingsSubmittedCount(uniqueUsers.size)
  }, [session?.id])

  useEffect(() => {
    loadContributeProgress()
    loadPairings()
  }, [loadContributeProgress, loadPairings])

  useEffect(() => {
    if (!session?.id) return
    const channel = supabase
      .channel(`admin-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_images', filter: `session_id=eq.${session.id}` },
        () => loadContributeProgress()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_phrases', filter: `session_id=eq.${session.id}` },
        () => loadContributeProgress()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_pairings', filter: `session_id=eq.${session.id}` },
        () => loadPairings()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_pairings', filter: `session_id=eq.${session.id}` },
        () => loadPairings()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, loadContributeProgress, loadPairings])

  const handleAdvance = async () => {
    if (!session || !user) return
    setAdvancing(true)
    setAdvanceError(null)
    const result = await advancePerformanceRound(session.id, user.id, session.round, session.round_number, session.sub_step)
    setAdvancing(false)
    if (result.error) {
      setAdvanceError(result.error)
    }
  }

  const handleToggleFeatured = async (pairing: SessionPairingRow) => {
    setTogglingId(pairing.id)
    await togglePairingFeatured(pairing.id, !pairing.featured)
    await loadPairings()
    setTogglingId(null)
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

  const canAdvance = session.round !== 'complete'

  return (
    <div className="flex flex-col px-4 pb-8 max-w-xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mt-4 mb-1 text-center">
        Admin — {session.code}
      </h1>

      <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4">
        <p className="text-sm text-gray-500 mb-1">Current Round</p>
        <p className="text-base font-medium text-gray-900">
          {roundLabel(session.round, session.round_number)}
        </p>
        <p className="text-xs text-gray-400 mt-1">{members.length} players in session</p>
      </div>

      {session.round === 'contribute' && session.round_number <= 2 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4">
          <p className="text-sm text-gray-500 mb-1">
            {session.round_number === 1 ? 'Images Uploaded' : 'Phrases Submitted'}
          </p>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-gray-900 h-2 rounded-full transition-all"
              style={{ width: `${((session.round_number === 1 ? imageCount : phraseCount) / Math.max(members.length, 1)) * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-700">
            {session.round_number === 1 ? imageCount : phraseCount} / {members.length} players
          </p>
        </div>
      )}

      {session.round === 'contribute' && session.round_number === 3 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 mb-4">
          <p className="text-sm text-gray-500 mb-1">Pairing Progress</p>
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div
              className="bg-gray-900 h-2 rounded-full transition-all"
              style={{ width: `${(pairingsSubmittedCount / Math.max(members.length, 1)) * 100}%` }}
            />
          </div>
          <p className="text-sm text-gray-700">
            {pairingsSubmittedCount} / {members.length} players paired
          </p>
        </div>
      )}

      {session.round === 'present' && (
        <div className="mb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Pairings ({pairings.length}) — tap to show on visualizer
          </p>
          <div className="flex flex-col gap-3">
            {pairings.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleToggleFeatured(p)}
                disabled={togglingId === p.id}
                className={`flex gap-3 items-center rounded-lg border p-3 transition-colors text-left ${
                  p.featured
                    ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-300'
                    : 'border-gray-200 bg-white hover:border-gray-400'
                }`}
              >
                <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                  <img src={p.image_url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 font-medium truncate">{p.phrase_text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {p.featured ? 'Showing on visualizer' : 'Tap to show'}
                  </p>
                </div>
              </button>
            ))}
            {pairings.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No pairings submitted yet.</p>
            )}
          </div>
        </div>
      )}

      {canAdvance && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing}
          className={btnPrimary + ' w-full mt-2'}
        >
          {advancing ? 'Advancing…' : nextRoundLabel(session.round, session.round_number)}
        </button>
      )}

      {session.round === 'complete' && (
        <p className="text-sm text-gray-500 text-center py-4">Session complete.</p>
      )}

      {advanceError && (
        <p className="text-sm text-red-600 mt-3 text-center" role="alert">
          {advanceError}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <a
          href={`/session/${code}/visualizer`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 text-center"
        >
          Open Visualizer in new tab
        </a>
      </div>
    </div>
  )
}
