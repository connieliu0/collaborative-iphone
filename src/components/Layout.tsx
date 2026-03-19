import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDraftPersistence } from '../hooks/useDraftPersistence'
import { useAuthModal } from '../contexts/AuthModalContext'

const isComicViewerPath = (pathname: string) => /^\/comic\/[^/]+$/.test(pathname)

export function Layout({ children }: { children?: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  useDraftPersistence(user, authLoading)
  const location = useLocation()
  const hideNav = isComicViewerPath(location.pathname)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

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
      <div className="min-h-[100dvh] bg-page text-primary overflow-x-hidden">
        {children ?? <Outlet />}
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-page text-primary overflow-x-hidden">
      {!isOnline && (
        <div
          className="sticky top-0 z-20 shrink-0 bg-amber-500 text-on-primary px-4 py-2 text-center text-sm font-medium"
          role="status"
          aria-live="polite"
        >
          You&apos;re offline — some features unavailable
        </div>
      )}
      <main className="flex-1 w-full min-w-0 max-w-[640px] mx-auto px-4 py-6 box-border">
        {!authLoading && !user && (
          <div className="flex items-center justify-end mb-4">
            <button
              type="button"
              onClick={() => openAuthModal('Log in to view your profile and published comics')}
              className="min-h-[36px] px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              Log in
            </button>
          </div>
        )}
        {user && (
          <div className="flex items-center justify-end mb-4">
            <Link
              to="/profile"
              aria-label="Go to profile"
              className="w-[36px] h-[36px] rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-900 transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </Link>
          </div>
        )}
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
