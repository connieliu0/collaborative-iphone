import { Link } from 'react-router-dom'

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
        </div>
      </div>
    </header>
  )
}
