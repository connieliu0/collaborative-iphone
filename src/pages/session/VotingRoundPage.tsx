import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  advanceRound,
  generateMatchups,
  getMatchupsWithVotes,
  submitVote,
  tallyMatchup,
  buildFinalComic,
  type SessionMatchupRow,
  type SessionVoteRow,
} from '../../lib/session'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function VotingRoundPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error } = useSession(code)

  const [matchups, setMatchups] = useState<SessionMatchupRow[]>([])
  const [votes, setVotes] = useState<SessionVoteRow[]>([])
  const [voting, setVoting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)

  const isHost = user && session && session.host_id === user.id

  useEffect(() => {
    if (!session) return
    if (session.round !== 'voting') {
      const next = session.round === 'complete' ? 'results' : session.round
      navigate(`/session/${code}/${next}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  const loadMatchups = useCallback(async () => {
    if (!session) return
    const data = await getMatchupsWithVotes(session.id)
    setMatchups(data.matchups)
    setVotes(data.votes)
    if (data.matchups.length > 0) setGenerated(true)
  }, [session?.id, session])

  useEffect(() => {
    loadMatchups()
  }, [loadMatchups])

  useEffect(() => {
    if (!session?.id) return
    const channel = supabase
      .channel(`voting-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_votes' },
        () => loadMatchups()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_matchups', filter: `session_id=eq.${session.id}` },
        () => loadMatchups()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_matchups', filter: `session_id=eq.${session.id}` },
        () => loadMatchups()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, loadMatchups])

  const handleGenerate = async () => {
    if (!session) return
    setGenerating(true)
    await generateMatchups(session.id, members.length)
    setGenerating(false)
    loadMatchups()
  }

  // Sync "current matchup" for everyone by deriving it from realtime matchup winners.
  // We show the first untallied matchup (winner == null). When the host tallies,
  // everyone advances automatically as `matchups` updates via Realtime.
  const activeMatchupIdx = useMemo(() => {
    if (matchups.length === 0) return 0
    const idx = matchups.findIndex((m) => m.winner === null)
    return idx === -1 ? matchups.length - 1 : idx
  }, [matchups])

  const currentMatchup = matchups[activeMatchupIdx]

  const myVoteForCurrent = useMemo(() => {
    if (!currentMatchup || !user) return null
    return votes.find((v) => v.matchup_id === currentMatchup.id && v.user_id === user.id) ?? null
  }, [currentMatchup, votes, user])

  const currentVoteCounts = useMemo(() => {
    if (!currentMatchup) return { a: 0, b: 0 }
    const matchVotes = votes.filter((v) => v.matchup_id === currentMatchup.id)
    return {
      a: matchVotes.filter((v) => v.choice === 'a').length,
      b: matchVotes.filter((v) => v.choice === 'b').length,
    }
  }, [currentMatchup, votes])

  const allVotedOnCurrent = useMemo(() => {
    if (!currentMatchup) return false
    const matchVotes = votes.filter((v) => v.matchup_id === currentMatchup.id)
    return matchVotes.length >= members.length
  }, [currentMatchup, votes, members.length])

  const handleVote = async (choice: 'a' | 'b') => {
    if (!currentMatchup || !user) return
    setVoting(true)
    await submitVote(currentMatchup.id, user.id, choice)
    setVoting(false)
    loadMatchups()
  }

  const handleNextMatchup = async () => {
    if (!currentMatchup || !session || !user) return
    if (!currentMatchup.winner && isHost) {
      await tallyMatchup(currentMatchup.id, session.id)
      await loadMatchups()
    }
  }

  const allMatchupsDone = matchups.length > 0 && matchups.every((m) => m.winner !== null)

  const handleFinish = async () => {
    if (!session || !user) return
    setAdvancing(true)
    const result = await buildFinalComic(session.id, user.id)
    if ('error' in result) {
      setAdvancing(false)
      return
    }
    await advanceRound(session.id, user.id, 'complete')
    setAdvancing(false)
  }

  const previousWinner = useMemo(() => {
    if (activeMatchupIdx === 0) return null
    const prev = matchups[activeMatchupIdx - 1]
    if (!prev || !prev.winner) return null
    return {
      image_url: prev.winner === 'b' ? prev.option_b_image_url : prev.option_a_image_url,
      caption: prev.winner === 'b' ? prev.option_b_caption : prev.option_a_caption,
    }
  }, [matchups, activeMatchupIdx])

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

  if (!generated && isHost) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">Round 4: Voting</h1>
        <p className="text-sm text-gray-500 mb-6">Generate matchups to start voting</p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className={btnPrimary}
        >
          {generating ? 'Generating…' : 'Generate Matchups'}
        </button>
      </div>
    )
  }

  if (!generated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <h1 className="text-lg font-semibold text-gray-900 mb-4">Round 4: Voting</h1>
        <p className="text-sm text-gray-500">Waiting for the host to generate matchups…</p>
      </div>
    )
  }

  if (!currentMatchup) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center px-4">
        <p className="text-gray-500">No matchups available</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center px-4 pb-8 max-w-xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mt-4 mb-1">Round 4: Voting</h1>
      <p className="text-sm text-gray-500 mb-4">
        Matchup {activeMatchupIdx + 1} of {matchups.length}
      </p>

      {previousWinner && (
        <div className="w-full mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
          <p className="text-xs text-gray-500 mb-2">Previous winning frame (for cohesion):</p>
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-200">
              <img src={previousWinner.image_url} alt="" className="w-full h-full object-cover" />
            </div>
            <p className="text-sm text-gray-700 italic">"{previousWinner.caption}"</p>
          </div>
        </div>
      )}

      <div className="w-full grid grid-cols-2 gap-4 mb-6">
        <button
          type="button"
          onClick={() => handleVote('a')}
          disabled={voting || myVoteForCurrent !== null}
          className={`flex flex-col rounded-lg border-2 overflow-hidden transition-colors ${
            myVoteForCurrent?.choice === 'a'
              ? 'border-gray-900 ring-2 ring-gray-400'
              : 'border-gray-200 hover:border-gray-400'
          }`}
        >
          <div className="aspect-square bg-gray-100">
            <img
              src={currentMatchup.option_a_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-2 text-left">
            <p className="text-xs text-gray-900 line-clamp-2">{currentMatchup.option_a_caption || '(no caption)'}</p>
            {allVotedOnCurrent && (
              <p className="text-xs font-bold text-gray-600 mt-1">{currentVoteCounts.a} votes</p>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleVote('b')}
          disabled={voting || myVoteForCurrent !== null}
          className={`flex flex-col rounded-lg border-2 overflow-hidden transition-colors ${
            myVoteForCurrent?.choice === 'b'
              ? 'border-gray-900 ring-2 ring-gray-400'
              : 'border-gray-200 hover:border-gray-400'
          }`}
        >
          <div className="aspect-square bg-gray-100">
            <img
              src={currentMatchup.option_b_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-2 text-left">
            <p className="text-xs text-gray-900 line-clamp-2">{currentMatchup.option_b_caption || '(no caption)'}</p>
            {allVotedOnCurrent && (
              <p className="text-xs font-bold text-gray-600 mt-1">{currentVoteCounts.b} votes</p>
            )}
          </div>
        </button>
      </div>

      {myVoteForCurrent && !allVotedOnCurrent && (
        <p className="text-sm text-gray-500 mb-4">
          Voted! Waiting for others… ({currentVoteCounts.a + currentVoteCounts.b}/{members.length})
        </p>
      )}

      {isHost && allVotedOnCurrent && activeMatchupIdx < matchups.length - 1 && (
        <button type="button" onClick={handleNextMatchup} className={btnPrimary + ' w-full max-w-xs'}>
          Next Matchup →
        </button>
      )}

      {isHost && allVotedOnCurrent && activeMatchupIdx === matchups.length - 1 && !allMatchupsDone && (
        <button type="button" onClick={handleNextMatchup} className={btnPrimary + ' w-full max-w-xs'}>
          Tally Final Matchup
        </button>
      )}

      {isHost && allMatchupsDone && (
        <button
          type="button"
          onClick={handleFinish}
          disabled={advancing}
          className={btnPrimary + ' w-full max-w-xs mt-4'}
        >
          {advancing ? 'Building Comic…' : 'See Results →'}
        </button>
      )}
    </div>
  )
}
