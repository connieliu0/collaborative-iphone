import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export type ComicFlowHeaderVariant = 'create' | 'edit'

export interface ComicFlowHeaderProps {
  variant: ComicFlowHeaderVariant
  onPublish: () => void
  publishing: boolean
  leftContent?: React.ReactNode
  /** When true, Preview link is disabled (e.g. no frames yet on create). */
  previewDisabled?: boolean
  /** When true, Publish button is disabled. */
  publishDisabled?: boolean
}

export function ComicFlowHeader({
  variant,
  onPublish,
  publishing,
  leftContent,
  previewDisabled = false,
  publishDisabled = false,
}: ComicFlowHeaderProps) {
  const { user } = useAuth()

  return (
    <header className="sticky top-0 z-10 w-full border-b border-[#C2C2C2] mb-4 pt-[env(safe-area-inset-top)] pb-2">
      <div className="flex items-center justify-between gap-4 min-w-0">
        <div className="flex items-center min-w-0 shrink-0">
          {variant === 'create' && leftContent}
          {variant === 'edit' && (
            <Link
              to="/create"
              className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2"
            >
              ← Back
            </Link>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 ml-auto">
          <Link
            to="/preview"
            className="btn-primary shrink-0"
            aria-disabled={previewDisabled}
            onClick={(e) => previewDisabled && e.preventDefault()}
            style={previewDisabled ? { pointerEvents: 'none' as const, opacity: 0.6 } : undefined}
          >
            Preview
          </Link>
          <button
            type="button"
            onClick={onPublish}
            disabled={publishing || publishDisabled}
            className="btn-primary shrink-0"
          >
            {publishing ? 'Publishing...' : 'Publish'}
          </button>
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
