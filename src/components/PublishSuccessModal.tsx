import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

export function PublishSuccessModal({
  slug,
  onClose,
}: {
  slug: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)

  const shareUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return origin ? `${origin}/comic/${slug}` : `/comic/${slug}`
  }, [slug])

  const handleCopy = useCallback(async () => {
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setCopyError('Could not copy. Please copy the link manually.')
    }
  }, [shareUrl])

  const btnPrimary =
    'min-h-[44px] px-4 py-2.5 bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center'
  const btnSecondary =
    'min-h-[44px] px-4 py-2.5 border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 inline-flex items-center justify-center'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Publish success"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-xl sm:max-w-md bg-white border border-gray-300 p-5 mx-0 sm:mx-2 mb-0 sm:mb-0 rounded-t-lg sm:rounded-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">Your comic is live</h2>
            <p className="text-sm text-gray-600 mt-1">
              Share this link with anyone to view your comic.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[36px] h-[36px] border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center justify-center text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="publish-share-url" className="sr-only">
            Shareable URL
          </label>
          <input
            id="publish-share-url"
            type="text"
            readOnly
            value={shareUrl}
            className="w-full px-3 py-2.5 border border-gray-300 bg-white text-gray-900 text-sm font-mono truncate focus:outline-none"
            aria-label="Shareable URL"
          />

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <button type="button" onClick={handleCopy} className={btnPrimary}>
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
            <Link to={`/comic/${slug}`} className={btnSecondary}>
              View Comic
            </Link>
          </div>

          {copyError && (
            <p className="text-sm text-red-600 mt-2" role="alert">
              {copyError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
