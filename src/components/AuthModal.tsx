import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  /** Optional message shown above the form (e.g. "Create a free account to publish your comic") */
  message?: string
}

const focusableSelector =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
}

export function AuthModal({ isOpen, onClose, message }: AuthModalProps) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null)

  const resetForm = useCallback(() => {
    setEmail('')
    setPassword('')
    setError(null)
    setSubmitting(false)
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [onClose, resetForm])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
        return
      }

      if (e.key !== 'Tab' || !overlayRef.current) return

      const focusables = getFocusableElements(overlayRef.current)
      if (focusables.length === 0) return

      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  useEffect(() => {
    if (isOpen) {
      resetForm()
      setMode('signin')
      firstFocusableRef.current = null
      const t = requestAnimationFrame(() => {
        overlayRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus()
      })
      return () => cancelAnimationFrame(t)
    }
  }, [isOpen, resetForm])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: err } =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password)

    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    handleClose()
  }

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-sm rounded-xl bg-[#1a1a1a] border border-white/10 shadow-xl my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 id="auth-modal-title" className="text-lg font-semibold text-white mb-1">
            {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </h2>
          {message && (
            <p className="text-sm text-white/70 mb-4">{message}</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="sr-only">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
                disabled={submitting}
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="sr-only">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent"
                disabled={submitting}
              />
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                  setError(null)
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg bg-white/10 text-white font-medium text-sm hover:bg-white/20 transition-colors"
              >
                {mode === 'signin'
                  ? 'Need an account? Sign Up'
                  : 'Already have an account? Sign In'}
              </button>
            </div>
          </form>
        </div>
        <div className="px-6 pb-6">
          <button
            type="button"
            onClick={handleClose}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-white/20 text-white/90 text-sm font-medium hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
