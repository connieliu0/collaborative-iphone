import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useComicStore } from '../stores/useComicStore'

export const PREVIEW_RETURN_PATH_KEY = 'previewReturnPath'

export type ComicFlowHeaderVariant = 'create' | 'edit'

export interface ComicFlowHeaderProps {
  variant: ComicFlowHeaderVariant
  leftContent?: React.ReactNode
  /** When true, hide Preview entirely. */
  hideActions?: boolean
  /** When true, Preview link is disabled (e.g. no frames yet on create). */
  previewDisabled?: boolean
  /** Shown before Preview (e.g. grid/list toggle on create). */
  leadingActions?: React.ReactNode
  /** Where to return after closing preview. Defaults to current route. */
  previewReturnTo?: string
  /** Edit header back-link. Defaults to /create. */
  backTo?: string
  /** Start preview from this frame index (0-based). */
  previewStartIndex?: number
}

export function ComicFlowHeader({
  variant,
  leftContent,
  hideActions = false,
  previewDisabled = false,
  leadingActions,
  previewReturnTo,
  backTo = '/create',
  previewStartIndex,
}: ComicFlowHeaderProps) {
  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const location = useLocation()
  const navigate = useNavigate()
  const clearComic = useComicStore((s) => s.clearComic)
  const hasFrames = useComicStore((s) => s.frames.length > 0)
  const returnTo = previewReturnTo ?? `${location.pathname}${location.search}`

  const handleNewComic = () => {
    clearComic()
    navigate('/create')
  }

  return (
    <header className="sticky top-0 z-10 w-full border-b border-[#C2C2C2] mb-4 pt-[env(safe-area-inset-top)] pb-2 bg-white">
      <div className="flex flex-nowrap items-center justify-between gap-2 sm:gap-4 min-w-0 w-full overflow-x-auto">
        <div className="flex items-center min-w-0 shrink-0">
          {variant === 'create' && leftContent}
          {variant === 'edit' && (
            <Link
              to={backTo}
              className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 whitespace-nowrap"
            >
              ← Back
            </Link>
          )}
        </div>

        <div className="flex flex-nowrap items-center justify-end gap-x-2 sm:gap-x-3 ml-auto shrink-0 text-sm text-gray-900">
          {leadingActions}
          {variant === 'create' && hasFrames && (
            <button
              type="button"
              onClick={handleNewComic}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors shrink-0"
            >
              New
            </button>
          )}
          {!hideActions && (
            <Link
              to="/preview"
              state={{ from: returnTo, startIndex: previewStartIndex }}
              className="btn-primary shrink-0"
              aria-disabled={previewDisabled}
              onClick={(e) => {
                if (previewDisabled) {
                  e.preventDefault()
                  return
                }
                if (typeof window !== 'undefined') {
                  window.sessionStorage.setItem(PREVIEW_RETURN_PATH_KEY, returnTo)
                }
              }}
              style={previewDisabled ? { pointerEvents: 'none' as const, opacity: 0.6 } : undefined}
            >
              Preview
            </Link>
          )}
          {user ? (
            <Link
              to="/profile"
              aria-label="Go to profile"
              className="w-[28px] h-[28px] rounded-full bg-black text-white flex items-center justify-center hover:bg-gray-900 transition-colors shrink-0"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('Log in to view your profile and published comics')}
              className="px-4 py-1.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors shrink-0"
            >
              Log in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
