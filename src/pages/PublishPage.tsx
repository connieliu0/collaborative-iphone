import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useComicStore } from '../stores/useComicStore'
import { useAuth } from '../hooks/useAuth'
import { useComic } from '../hooks/useComic'
import { getProfileByUsername, getProfilesByIds, type ProfileRow } from '../lib/profiles'
import { updateComicCollaborators } from '../lib/publish'

const COPIED_DURATION_MS = 2000
const MAX_COLLABORATORS = 5

export function PublishPage() {
  const [searchParams] = useSearchParams()
  const slug = searchParams.get('slug') ?? ''
  const navigate = useNavigate()
  const clearComic = useComicStore((s) => s.clearComic)
  const { user } = useAuth()
  const { comic, loading: comicLoading, refetch: refetchComic } = useComic(slug || undefined)

  const [copied, setCopied] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [savingInvites, setSavingInvites] = useState(false)
  const [collaboratorProfiles, setCollaboratorProfiles] = useState<ProfileRow[]>([])
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = slug ? `${origin}/comic/${slug}` : ''

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_DURATION_MS)
    } catch {
      setCopied(false)
    }
  }, [shareUrl])

  const handleViewComic = useCallback(() => {
    navigate(`/comic/${slug}`)
  }, [navigate, slug])

  const handleCreateAnother = useCallback(() => {
    clearComic()
    navigate('/create')
  }, [clearComic, navigate])

  const isCollabOwner = Boolean(
    slug && comic && user && comic.mode === 'collab' && comic.owner_id === user.id
  )
  const collaboratorIds = comic?.turn_order?.filter((id) => id !== comic?.owner_id) ?? []

  const loadCollaboratorProfiles = useCallback(async () => {
    if (collaboratorIds.length === 0) {
      setCollaboratorProfiles([])
      return
    }
    const profiles = await getProfilesByIds(collaboratorIds)
    setCollaboratorProfiles(profiles)
  }, [collaboratorIds.join(',')])

  useEffect(() => {
    if (isCollabOwner && collaboratorIds.length > 0 && !comicLoading) {
      loadCollaboratorProfiles()
    }
  }, [isCollabOwner, collaboratorIds.length, comicLoading, loadCollaboratorProfiles])

  const handleAddCollaborator = useCallback(async () => {
    setInviteError(null)
    const name = inviteUsername.trim()
    if (!name) return
    if (!comic || !user) return
    setSavingInvites(true)
    try {
      const current = comic.turn_order ?? [comic.owner_id]
      const collabIds = current.filter((id) => id !== comic.owner_id)
      if (collabIds.length >= MAX_COLLABORATORS) {
        setInviteError(`Maximum ${MAX_COLLABORATORS} collaborators`)
        return
      }
      const profile = await getProfileByUsername(name)
      if (!profile) {
        setInviteError('Username not found')
        return
      }
      if (profile.id === comic.owner_id) {
        setInviteError('Cannot add yourself')
        return
      }
      if (collabIds.includes(profile.id)) {
        setInviteError('Already added')
        return
      }
      const newCollabIds = [...collabIds, profile.id]
      const result = await updateComicCollaborators(comic.id, comic.owner_id, newCollabIds)
      if (result.error) {
        setInviteError(result.error)
        return
      }
      setInviteUsername('')
      setCollaboratorProfiles((prev) => [...prev.filter((p) => p.id !== profile.id), profile])
      refetchComic()
    } finally {
      setSavingInvites(false)
    }
  }, [inviteUsername, comic, user, refetchComic])

  const handleRemoveCollaborator = useCallback(
    async (id: string) => {
      if (!comic || comic.owner_id !== user?.id) return
      setPendingRemoveId(id)
      const newCollabIds = (comic.turn_order ?? [comic.owner_id]).filter(
        (uid) => uid !== comic.owner_id && uid !== id
      )
      const result = await updateComicCollaborators(comic.id, comic.owner_id, newCollabIds)
      setPendingRemoveId(null)
      if (!result.error) {
        setCollaboratorProfiles((prev) => prev.filter((p) => p.id !== id))
        refetchComic()
      }
    },
    [comic, user, refetchComic]
  )

  const btnPrimary = 'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
  const btnSecondary = 'min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors'

  if (!slug) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-gray-600 mb-4">No comic to show. Create one first.</p>
        <button
          type="button"
          onClick={() => navigate('/create')}
          className={btnPrimary + ' inline-flex items-center justify-center'}
        >
          Create comic
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center min-h-[50vh] text-center px-4 pb-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-2">
        Your comic is live!
      </h1>
      <p className="text-gray-600 text-sm mb-6">
        Share this link with anyone to view your comic.
      </p>

      <div className="w-full max-w-md flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="publish-share-url" className="sr-only">
            Shareable URL
          </label>
          <input
            id="publish-share-url"
            type="text"
            readOnly
            value={shareUrl}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm font-mono truncate"
            aria-label="Shareable URL"
          />
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className={btnPrimary + ' inline-flex items-center justify-center'}
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
            {copied && (
              <p className="text-sm text-green-600" role="status">
                Copied!
              </p>
            )}
          </div>
        </div>

        {isCollabOwner && (
          <section className="text-left border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Invite Collaborators</h2>
            <p className="text-xs text-gray-500 mb-3">
              Add by username (max {MAX_COLLABORATORS}). They can add frames in turn.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollaborator()}
                placeholder="Username"
                className="flex-1 min-h-[40px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm placeholder-gray-400"
                aria-label="Collaborator username"
              />
              <button
                type="button"
                onClick={handleAddCollaborator}
                disabled={savingInvites || (comic?.turn_order?.filter((id) => id !== comic?.owner_id).length ?? 0) >= MAX_COLLABORATORS}
                className="min-h-[40px] px-4 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {inviteError && (
              <p className="text-sm text-red-600 mb-2" role="alert">
                {inviteError}
              </p>
            )}
            <ul className="space-y-2">
              {collaboratorProfiles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900"
                >
                  <span>@{p.username}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCollaborator(p.id)}
                    disabled={pendingRemoveId === p.id}
                    className="text-gray-500 hover:text-red-600 disabled:opacity-50"
                    aria-label={`Remove ${p.username}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {collaboratorIds.length > 0 && collaboratorProfiles.length < collaboratorIds.length && (
                <li className="text-sm text-gray-500">Loading…</li>
              )}
            </ul>
          </section>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleViewComic}
            className={btnSecondary + ' inline-flex items-center justify-center'}
          >
            View Comic
          </button>
          <button
            type="button"
            onClick={handleCreateAnother}
            className={btnPrimary + ' inline-flex items-center justify-center'}
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  )
}
