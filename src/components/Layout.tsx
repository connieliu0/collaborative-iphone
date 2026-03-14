import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useAuth } from '../hooks/useAuth'
import { useMyTurnComics } from '../hooks/useMyTurnComics'

const isComicViewerPath = (pathname: string) => /^\/comic\/[^/]+$/.test(pathname)

function emailInitial(email: string | undefined): string {
  if (!email?.trim()) return '?'
  const first = email.trim()[0].toUpperCase()
  return /[A-Z0-9]/i.test(first) ? first : '?'
}

export function Layout({ children }: { children?: React.ReactNode }) {
  const { user, loading, signOut } = useAuth()
  const { openAuthModal } = useAuthModal()
  const location = useLocation()
  const hideNav = isComicViewerPath(location.pathname)
  const { comics: myTurnComics } = useMyTurnComics(user?.id)
  const [dismissedTurnBanner, setDismissedTurnBanner] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const firstTurnComic = myTurnComics[0]
  const showTurnBanner =
    user &&
    firstTurnComic &&
    dismissedTurnBanner !== firstTurnComic.id &&
    !hideNav

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (hideNav) {
    return (
      <div className="min-h-[100dvh] bg-black text-white font-sans overflow-x-hidden">
        {children ?? <Outlet />}
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-black text-white font-sans overflow-x-hidden">
      {!isOnline && (
        <div
          className="sticky top-0 z-20 shrink-0 bg-amber-600/90 text-black px-4 py-2 text-center text-sm font-medium"
          role="status"
          aria-live="polite"
        >
          You&apos;re offline — some features unavailable
        </div>
      )}
      {showTurnBanner && (
        <div className="shrink-0 bg-amber-500/20 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between gap-2">
          <p className="text-sm text-amber-200 truncate">
            It&apos;s your turn in {firstTurnComic.title || 'Untitled'}! →
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/comic/${firstTurnComic.slug}/add`}
              className="min-h-[36px] px-3 rounded-lg bg-amber-500 text-black font-medium text-sm hover:bg-amber-400 transition-colors"
            >
              Add your frame
            </Link>
            <button
              type="button"
              onClick={() => setDismissedTurnBanner(firstTurnComic.id)}
              className="min-h-[36px] px-2 text-amber-200/80 hover:text-amber-200 text-sm"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <header className="shrink-0 border-b border-white/10 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto w-full max-w-[640px] px-4 flex items-center justify-between h-14">
          <Link to="/" className="font-semibold text-lg tracking-tight">
            Panelz
          </Link>
          {loading ? (
            <span className="text-sm text-white/50">…</span>
          ) : user ? (
            <div className="flex items-center gap-2">
              <span
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-medium text-white"
                aria-hidden
              >
                {emailInitial(user.email)}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="px-3 py-1.5 text-sm font-medium rounded-md bg-white/10 hover:bg-white/20 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 w-full min-w-0 max-w-[640px] mx-auto px-4 py-6 box-border">
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
