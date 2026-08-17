import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

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
}

export function ComicFlowHeader({
  variant,
  leftContent,
  hideActions = false,
  previewDisabled = false,
  leadingActions,
}: ComicFlowHeaderProps) {
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-10 w-full border-b border-[#C2C2C2] mb-4 pt-[env(safe-area-inset-top)] pb-2">
      <div className="flex flex-nowrap items-center justify-between gap-2 sm:gap-4 min-w-0 w-full overflow-x-auto">
        <div className="flex items-center min-w-0 shrink-0">
          {variant === 'create' && leftContent}
          {variant === 'edit' && (
            <Link
              to="/create"
              className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 whitespace-nowrap"
            >
              ← Back
            </Link>
          )}
        </div>

        <div className="flex flex-nowrap items-center justify-end gap-x-2 sm:gap-x-3 ml-auto shrink-0 text-sm text-gray-900">
          {leadingActions}
          {!hideActions && (
            <Link
              to="/preview"
              className="btn-primary shrink-0"
              aria-disabled={previewDisabled}
              onClick={(e) => previewDisabled && e.preventDefault()}
              style={previewDisabled ? { pointerEvents: 'none' as const, opacity: 0.6 } : undefined}
            >
              Preview
            </Link>
          )}
          {user && (
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
          )}
        </div>
      </div>
    </header>
  )
}
