import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAuthModal } from '../contexts/AuthModalContext'
import { createSession, joinSession } from '../lib/session'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
const btnSecondary =
  'min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50'

export function HomePage() {
  const navigate = useNavigate()
  const { user, signInAnonymously } = useAuth()
  const { openAuthModal } = useAuthModal()
  const [joinCode, setJoinCode] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleHost = async (sessionType: 'collab' | 'performance' = 'collab') => {
    let hostUser = user
    if (!hostUser) {
      const result = await signInAnonymously()
      if (result.error || !result.user) {
        openAuthModal('Log in to host a session')
        return
      }
      hostUser = result.user
    }
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
    let joinUser = user
    if (!joinUser) {
      const result = await signInAnonymously()
      if (result.error || !result.user) {
        openAuthModal('Log in to join a session')
        return
      }
      joinUser = result.user
    }
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
        <h1 className="text-xl font-semibold text-gray-900">Sequence</h1>
        <p className="text-gray-600 mt-1">Simple storytelling through word and image</p>
      </div>

      <div className="flex flex-col gap-3">
        <Link to="/create" className={btnPrimary + ' text-center'}>
          Create Comic
        </Link>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Collaborative mode</h2>
        <p className="text-sm text-gray-500 mb-4">
          Contribute images, words, and combine them together.
        </p>

        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => handleHost('collab')} disabled={busy} className={btnPrimary}>
            {busy ? 'Creating…' : 'Host Session'}
          </button>
          <button type="button" onClick={() => handleHost('performance')} disabled={busy} className={btnSecondary}>
            {busy ? 'Creating…' : 'Host Performance'}
          </button>

          {!showJoin ? (
            <button type="button" onClick={() => setShowJoin(true)} className={btnSecondary}>
              Join Session
            </button>
          ) : (
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
        </div>

        {error && (
          <p className="text-sm text-red-600 mt-2" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
