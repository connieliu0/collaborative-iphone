import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { advanceRound } from '../../lib/session'
import { updateMyUsername } from '../../lib/profiles'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
const btnSecondary =
  'min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function LobbyPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error, refetch } = useSession(code)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameBusy, setNameBusy] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const isHost = user && session && session.host_id === user.id
  const me = user ? members.find((m) => m.user_id === user.id) ?? null : null

  useEffect(() => {
    if (!user) return
    if (!me?.username) return
    if (me.username.startsWith('user_')) {
      setNameDraft(me.username)
      setEditingName(true)
    }
  }, [user?.id, me?.username])

  useEffect(() => {
    if (!session) return
    if (session.round !== 'lobby') {
      const next = session.round === 'complete' ? 'results' : session.round
      navigate(`/session/${code}/${next}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  // Refetch profiles once when members change (Realtime handles the member list).
  useEffect(() => {
    if (!session || session.round !== 'lobby') return
    void refetch()
  }, [members.length])

  const handleStart = async () => {
    if (!session || !user) return
    setStartError(null)
    setStarting(true)
    const result = await advanceRound(session.id, user.id, 'images')
    setStarting(false)
    if ('error' in result && result.error) {
      setStartError(result.error)
      return
    }
    navigate(`/session/${code}/images`, { replace: true })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] animate-pulse">
        <div className="h-16 w-48 bg-gray-200 rounded-lg mb-4" />
        <div className="h-4 w-32 bg-gray-200 rounded" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-gray-600 mb-4">{error ?? 'Session not found'}</p>
        <button type="button" onClick={() => navigate('/')} className={btnPrimary}>
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center min-h-[60vh] text-center px-4">
      {starting && (
        <div
          className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center px-6"
          aria-live="polite"
        >
          <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-800 animate-spin mb-4" />
          <p className="text-sm font-medium text-gray-800">Starting the game…</p>
          <p className="text-xs text-gray-500 mt-1">Preparing round 1 for all players.</p>
        </div>
      )}
      <p className="text-sm text-gray-500 mb-2 mt-4">Join Code</p>
      <div className="text-6xl font-bold tracking-[0.3em] text-gray-900 font-mono mb-2 select-all">
        {session.code}
      </div>
      <p className="text-xs text-gray-400 mb-8">Share this code or project this screen</p>

      {user && me && !editingName && (
        <button
          type="button"
          onClick={() => {
            setNameDraft(me.username ?? '')
            setEditingName(true)
          }}
          className={btnSecondary + ' w-full max-w-sm mb-5'}
        >
          Your name: @{me.username} (change)
        </button>
      )}

      {user && me && editingName && (
        <div className="w-full max-w-sm mb-5 border border-gray-200 bg-white rounded-xl p-4 text-left">
          <p className="text-sm font-medium text-gray-900 mb-2">Choose a display name</p>
          <label htmlFor="display-name" className="sr-only">
            Display name
          </label>
          <input
            id="display-name"
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value.toUpperCase())}
            placeholder="USERNAME"
            maxLength={24}
            className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-center text-lg font-mono tracking-widest uppercase placeholder-gray-400 mb-3"
          />
          {nameError && (
            <p className="text-sm text-red-600 mb-2" role="alert">
              {nameError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setNameError(null)
                setEditingName(false)
              }}
              disabled={nameBusy}
              className={btnSecondary + ' flex-1'}
            >
              Skip
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!user) return
                setNameBusy(true)
                setNameError(null)
                const normalized = nameDraft.trim().replace(/\s+/g, '_')
                const result = await updateMyUsername(user.id, normalized)
                setNameBusy(false)
                if ('error' in result) {
                  setNameError(result.error)
                  return
                }
                setEditingName(false)
                await refetch()
              }}
              disabled={nameBusy || nameDraft.trim().length === 0}
              className={btnPrimary + ' flex-1'}
            >
              {nameBusy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-sm">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
          Players ({members.length})
        </h2>
        <ul className="space-y-2 mb-8">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-4 py-3 text-sm text-gray-900"
            >
              <span>{m.username ?? `Player ${m.user_id.slice(0, 4)}`}</span>
              {m.user_id === session.host_id && (
                <span className="text-xs bg-gray-900 text-white px-2 py-0.5 rounded-full">
                  Host
                </span>
              )}
            </li>
          ))}
        </ul>

        {isHost && (
          <button
            type="button"
            onClick={handleStart}
            disabled={starting || members.length < 2}
            className={btnPrimary + ' w-full'}
          >
            {starting ? 'Starting…' : members.length < 2 ? 'Need at least 2 players' : 'Start Game'}
          </button>
        )}

        {!isHost && (
          <p className="text-sm text-gray-500">Waiting for the host to start…</p>
        )}

        {startError && (
          <p className="text-sm text-red-600 mt-3" role="alert">
            {startError}
          </p>
        )}
      </div>
    </div>
  )
}
