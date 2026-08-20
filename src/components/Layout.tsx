import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDraftPersistence } from '../hooks/useDraftPersistence'

const isFullscreenPath = (pathname: string) =>
  /^\/comic\/[^/]+$/.test(pathname) || /^\/session\/[^/]+\/visualizer$/.test(pathname)

export function Layout({ children }: { children?: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const comicSlugFromUrl = new URLSearchParams(location.search).get('comic')
  useDraftPersistence(user, authLoading, comicSlugFromUrl)
  const hideNav = isFullscreenPath(location.pathname)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    // Used by PreviewPage "back" behavior in collab mode.
    // Whenever we're on a collab session route, remember the session code.
    // Clear it when navigating to solo flow paths so preview doesn't redirect to old sessions.
    if (typeof window === 'undefined') return
    const match = location.pathname.match(/^\/session\/([^/]+)(?:\/|$)/)
    const code = match?.[1]
    if (code) {
      window.sessionStorage.setItem('collabSessionCode', code)
    } else if (/^\/(create|edit|preview)?\/?$/.test(location.pathname)) {
      // User is in solo flow — clear any stale collab session reference
      window.sessionStorage.removeItem('collabSessionCode')
    }
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
      <main className="flex-1 w-full min-w-0 max-w-[640px] mx-auto px-2 py-2 box-border">
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
