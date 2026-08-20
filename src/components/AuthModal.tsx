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

const btnPrimary =
  'w-full min-h-[44px] px-4 py-2.5 bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none'
const btnSecondary =
  'w-full min-h-[44px] px-4 py-2.5 border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none'
const inputClass =
  'w-full px-3 py-2.5 border border-gray-300 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-gray-500'

export function AuthModal({ isOpen, onClose, message }: AuthModalProps) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  const resetForm = useCallback(() => {
    setEmail('')
    setPassword('')
    setError(null)
    setResetSent(false)
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

    if (mode === 'reset') {
      const { error: err } = await resetPassword(email)
      setSubmitting(false)
      if (err) {
        setError(err.message)
        return
      }
      setResetSent(true)
      return
    }

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

  const handleGoogleSignIn = async () => {
    setError(null)
    setSubmitting(true)
    const { error: err } = await signInWithGoogle()
    setSubmitting(false)
    if (err) {
      setError(err.message)
    }
  }

  if (!isOpen) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="w-full max-w-sm bg-white border border-gray-300 my-auto max-h-[calc(100dvh-2rem)] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="auth-modal-title" className="text-base font-medium text-gray-900 mb-1">
          {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Reset Password'}
        </h2>
        {message && mode !== 'reset' && (
          <p className="text-sm text-gray-600 mb-4">{message}</p>
        )}

        {mode === 'reset' && resetSent ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Check your email for a link to reset your password.
            </p>
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setResetSent(false)
                setEmail('')
              }}
              className={btnPrimary}
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {mode !== 'reset' && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={submitting}
                  className={`${btnSecondary} inline-flex items-center justify-center gap-2`}
                >
                  Continue with Google
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === 'reset' && (
                <p className="text-sm text-gray-600">
                  Enter your email and we&apos;ll send a reset link.
                </p>
              )}
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
                  className={inputClass}
                  disabled={submitting}
                />
              </div>
              {mode !== 'reset' && (
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
                    className={inputClass}
                    disabled={submitting}
                  />
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" disabled={submitting} className={btnPrimary}>
                {submitting
                  ? 'Please wait…'
                  : mode === 'reset'
                    ? 'Send Reset Link'
                    : mode === 'signin'
                      ? 'Sign In'
                      : 'Sign Up'}
              </button>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('reset')
                    setError(null)
                  }}
                  className="text-sm text-gray-600 hover:text-gray-900 py-1"
                >
                  Forgot password?
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (mode === 'reset') {
                    setMode('signin')
                  } else {
                    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
                  }
                  setError(null)
                }}
                className={btnSecondary}
              >
                {mode === 'reset'
                  ? 'Back to Sign In'
                  : mode === 'signin'
                    ? 'Need an account? Sign Up'
                    : 'Already have an account? Sign In'}
              </button>
              <button type="button" onClick={handleClose} className={btnSecondary}>
                Cancel
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
