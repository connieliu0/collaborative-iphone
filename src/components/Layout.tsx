import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDraftPersistence } from '../hooks/useDraftPersistence'
import { useAuthModal } from '../contexts/AuthModalContext'

const isFullscreenPath = (pathname: string) =>
  /^\/comic\/[^/]+$/.test(pathname) || /^\/session\/[^/]+\/visualizer$/.test(pathname)

const isGalleryPath = (pathname: string) => /^\/gallery(?:\/|$)/.test(pathname)

export function Layout({ children }: { children?: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { openAuthModal } = useAuthModal()
  useDraftPersistence(user, authLoading)
  const location = useLocation()
  const hideNav = isFullscreenPath(location.pathname)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    // Used by PreviewPage "back" behavior in collab mode.
    // Whenever we're on a collab session route, remember the session code.
    if (typeof window === 'undefined') return
    const match = location.pathname.match(/^\/session\/([^/]+)(?:\/|$)/)
    const code = match?.[1]
    if (code) window.sessionStorage.setItem('collabSessionCode', code)
  }, [location.pathname])

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
        {!authLoading && !user && !isGalleryPath(location.pathname) && (
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
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
