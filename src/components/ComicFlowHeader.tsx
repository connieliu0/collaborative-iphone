import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PublishSuccessModal } from './PublishSuccessModal'
import { useAuth } from '../hooks/useAuth'
import { useAuthModal } from '../contexts/AuthModalContext'
import { fetchComicForEditor, readPublishedMetaFromSession } from '../lib/comicEditor'
import { publishComic, updateComic } from '../lib/publish'
import { useComicStore } from '../stores/useComicStore'

export const PREVIEW_RETURN_PATH_KEY = 'previewReturnPath'

const PUBLISH_AUTH_MESSAGE = 'Sign in or create an account to publish and save your comic'

export type ComicFlowHeaderVariant = 'create' | 'edit'

export interface ComicFlowHeaderProps {
  variant: ComicFlowHeaderVariant
  leftContent?: React.ReactNode
  /** When true, hide Preview and Publish entirely. */
  hideActions?: boolean
  /** When true, Preview/Publish are disabled (e.g. no frames yet on create). */
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
  const frames = useComicStore((s) => s.frames)
  const comicTitle = useComicStore((s) => s.comicTitle)
  const publishedComicId = useComicStore((s) => s.publishedComicId)
  const publishedSlug = useComicStore((s) => s.publishedSlug)
  const setPublishedComic = useComicStore((s) => s.setPublishedComic)
  const updateFrameUrls = useComicStore((s) => s.updateFrameUrls)
  const hasFrames = frames.length > 0
  const returnTo = previewReturnTo ?? `${location.pathname}${location.search}`
  const [confirmNewOpen, setConfirmNewOpen] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccessSlug, setPublishSuccessSlug] = useState<string | null>(null)
  const [showTitleModal, setShowTitleModal] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)

  const handleNewComic = useCallback(() => {
    clearComic()
    setConfirmNewOpen(false)
    navigate('/create')
  }, [clearComic, navigate])

  const handlePublishClick = useCallback(() => {
    if (previewDisabled || publishing) return
    if (!user) {
      openAuthModal(PUBLISH_AUTH_MESSAGE)
      return
    }
    setPublishError(null)
    setTitleInput(comicTitle || '')
    setShowTitleModal(true)
  }, [previewDisabled, publishing, user, openAuthModal, comicTitle])

  const handlePublish = useCallback(async () => {
    if (!user) return
    setShowTitleModal(false)
    setPublishError(null)
    setPublishing(true)
    const publishFrames = frames.filter(
      (frame) => frame.imageUrl || frame.websiteUrl || frame.caption.trim()
    )
    const finalTitle = titleInput.trim() || 'Comic Title'

    const sessionMeta = readPublishedMetaFromSession()
    let comicId = publishedComicId ?? sessionMeta.publishedComicId
    let slug = publishedSlug ?? sessionMeta.publishedSlug ?? null

    if (!slug && typeof window !== 'undefined') {
      try {
        const returnUrl = new URL(returnTo, window.location.origin)
        slug = returnUrl.searchParams.get('comic')
      } catch {
        // ignore malformed return path
      }
    }

    if (!comicId && slug) {
      const lookup = await fetchComicForEditor(slug)
      if ('error' in lookup) {
        console.warn('Comic not found in database, creating new comic instead', {
          slug,
          error: lookup.error,
        })
        comicId = null
      } else if (lookup.ownerId !== user.id) {
        setPublishing(false)
        setPublishError('You can only edit your own comics')
        return
      } else {
        comicId = lookup.comicId
      }
    }

    const result = comicId
      ? await updateComic(comicId, user.id, publishFrames, finalTitle)
      : await publishComic(user.id, publishFrames, { mode: 'solo', title: finalTitle })
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    setPublishSuccessSlug(result.slug)
    setPublishedComic({ slug: result.slug, comicId: result.comicId })
    updateFrameUrls(result.uploadedUrls)
  }, [
    user,
    frames,
    titleInput,
    publishedComicId,
    publishedSlug,
    returnTo,
    setPublishedComic,
    updateFrameUrls,
  ])

  useEffect(() => {
    if (!confirmNewOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirmNewOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmNewOpen])

  useEffect(() => {
    if (showTitleModal && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [showTitleModal])

  return (
    <>
      <header className="sticky top-0 z-10 w-full mb-4 pt-[env(safe-area-inset-top)] pb-2 ">
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
            {hasFrames &&
              (user ? (
                <Link
                  to="/profile"
                  aria-label="Go to profile"
                  className="ml-1 w-[28px] h-[28px] rounded-full bg-transparent text-gray-900 flex items-center justify-center hover:text-black transition-colors shrink-0"
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
                  className="shrink-0 content-center py-1.5 px-4 text-sm text-[#101827] hover:text-black transition-colors"
                >
                  Log in
                </button>
              ))}
          </div>

          <div className="flex flex-nowrap items-center justify-end gap-x-3 ml-auto shrink-0 text-sm text-gray-900">
            {leadingActions}
            {variant === 'create' && hasFrames && (
              <button
                type="button"
                onClick={() => setConfirmNewOpen(true)}
                className="shrink-0 flex items-center justify-center px-3 py-1.5 border border-border-strong text-gray-700 text-sm hover:bg-gray-50 transition-colors"
              >
                New
              </button>
            )}
            {!hideActions && (
              <>
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
                <button
                  type="button"
                  onClick={handlePublishClick}
                  disabled={previewDisabled || publishing}
                  className="shrink-0 flex items-center justify-center p-2 bg-black text-white text-base leading-5 hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  style={previewDisabled ? { opacity: 0.6 } : undefined}
                >
                  {publishing ? 'Publishing...' : 'Publish'}
                </button>
              </>
            )}
            {!hasFrames &&
              (user ? (
                <Link
                  to="/profile"
                  aria-label="Go to profile"
                  className="w-[28px] h-[28px] rounded-full bg-transparent text-gray-900 flex items-center justify-center hover:text-black transition-colors shrink-0"
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
                  className="shrink-0 content-center py-1.5 px-4 bg-primary text-on-primary text-sm hover:bg-gray-800 transition-colors"
                >
                  Log in
                </button>
              ))}
          </div>
        </div>
        {publishError && (
          <p className="mt-2 text-sm text-red-600 text-right" role="alert">
            {publishError}
          </p>
        )}
      </header>

      {publishSuccessSlug && (
        <PublishSuccessModal
          slug={publishSuccessSlug}
          onClose={() => setPublishSuccessSlug(null)}
        />
      )}

      {showTitleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowTitleModal(false)
          }}
        >
          <div className="bg-white border border-gray-300 p-5 max-w-md w-full mx-4">
            <h3 className="text-base font-medium text-gray-900 mb-4">
              What do you want to title your comic?
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handlePublish()
              }}
            >
              <input
                ref={titleInputRef}
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="Comic Title"
                className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 text-gray-900"
              />
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowTitleModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 text-white hover:bg-gray-800 text-sm"
                >
                  Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmNewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-comic-confirm-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmNewOpen(false)
          }}
        >
          <div className="w-full max-w-sm bg-white border border-gray-300 p-5">
            <h2 id="new-comic-confirm-title" className="text-base font-medium text-gray-900">
              Start a new comic?
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              This will make a new comic. Are you sure? Your current work on this device will be
              cleared.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleNewComic}
                className="w-full min-h-[44px] px-4 py-2.5 bg-gray-900 text-white font-medium text-sm hover:bg-gray-800"
              >
                Proceed
              </button>
              <button
                type="button"
                onClick={() => setConfirmNewOpen(false)}
                className="w-full min-h-[44px] px-4 py-2.5 border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
