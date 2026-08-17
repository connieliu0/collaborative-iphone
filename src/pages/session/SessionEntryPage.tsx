import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useAuthModal } from '../../contexts/AuthModalContext'
import { createSession, joinSession } from '../../lib/session'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export type SessionEntryMode = 'host' | 'performance' | 'join'

const COPY: Record<SessionEntryMode, { title: string; description: string }> = {
  host: {
    title: 'Host Session',
    description: 'Start a collaborative session. Players contribute images and words, then combine them.',
  },
  performance: {
    title: 'Host Performance',
    description: 'Start a live performance session with an admin console and audience contributions.',
  },
  join: {
    title: 'Join Session',
    description: 'Enter a session code to join a collaborative or performance session.',
  },
}

export function SessionEntryPage({ mode }: { mode: SessionEntryMode }) {
  const navigate = useNavigate()
  const { user, signInAnonymously } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const copy = COPY[mode]

  const ensureUser = async (loginMessage: string) => {
    if (user) return user
    const result = await signInAnonymously()
    if (result.error || !result.user) {
      openAuthModal(loginMessage)
      return null
    }
    return result.user
  }

  const handleHost = async (sessionType: 'collab' | 'performance') => {
    const hostUser = await ensureUser('Log in to host a session')
    if (!hostUser) return

    setBusy(true)
    setError(null)
    const result = await createSession(hostUser.id, sessionType)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    if (sessionType === 'performance') {
      navigate(`/session/${result.code}/admin`)
    } else {
      navigate(`/session/${result.code}`)
    }
  }

  const handleJoin = async () => {
    const joinUser = await ensureUser('Log in to join a session')
    if (!joinUser) return

    const code = joinCode.trim().toUpperCase()
    if (code.length < 4) {
      setError('Enter a valid session code')
      return
    }
    setBusy(true)
    setError(null)
    const result = await joinSession(code, joinUser.id)
    setBusy(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    navigate(`/session/${code}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{copy.title}</h1>
        <p className="text-gray-600 mt-1">{copy.description}</p>
      </div>

      {mode === 'host' && (
        <button type="button" onClick={() => handleHost('collab')} disabled={busy} className={btnPrimary}>
          {busy ? 'Creating…' : 'Host Session'}
        </button>
      )}

      {mode === 'performance' && (
        <button type="button" onClick={() => handleHost('performance')} disabled={busy} className={btnPrimary}>
          {busy ? 'Creating…' : 'Host Performance'}
        </button>
      )}

      {mode === 'join' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="CODE"
            maxLength={6}
            className="flex-1 min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-center text-lg font-mono tracking-widest uppercase placeholder-gray-400"
            aria-label="Session code"
            autoFocus
          />
          <button type="button" onClick={handleJoin} disabled={busy} className={btnPrimary}>
            {busy ? 'Joining…' : 'Join'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
