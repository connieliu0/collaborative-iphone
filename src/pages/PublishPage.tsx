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

  if (!slug) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-white/80 mb-4">No comic to show. Create one first.</p>
        <button
          type="button"
          onClick={() => navigate('/create')}
          className="min-h-[44px] inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90"
        >
          Create comic
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center min-h-[50vh] text-center px-4 pb-8">
      <h1 className="text-xl font-semibold text-white mb-2">
        Your comic is live!
      </h1>
      <p className="text-white/70 text-sm mb-6">
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
            className="w-full px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm font-mono truncate"
            aria-label="Shareable URL"
          />
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
            {copied && (
              <p className="text-sm text-green-400" role="status">
                Copied!
              </p>
            )}
          </div>
        </div>

        {isCollabOwner && (
          <section className="text-left border border-white/10 rounded-lg p-4 bg-white/5">
            <h2 className="text-sm font-medium text-white mb-2">Invite Collaborators</h2>
            <p className="text-xs text-white/60 mb-3">
              Add by username (max {MAX_COLLABORATORS}). They can add frames in turn.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCollaborator()}
                placeholder="Username"
                className="flex-1 min-h-[40px] px-3 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/40"
                aria-label="Collaborator username"
              />
              <button
                type="button"
                onClick={handleAddCollaborator}
                disabled={savingInvites || (comic?.turn_order?.filter((id) => id !== comic?.owner_id).length ?? 0) >= MAX_COLLABORATORS}
                className="min-h-[40px] px-4 rounded-lg bg-white/20 text-white text-sm font-medium hover:bg-white/30 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {inviteError && (
              <p className="text-sm text-red-400 mb-2" role="alert">
                {inviteError}
              </p>
            )}
            <ul className="space-y-2">
              {collaboratorProfiles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <span>@{p.username}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCollaborator(p.id)}
                    disabled={pendingRemoveId === p.id}
                    className="text-white/60 hover:text-red-400 disabled:opacity-50"
                    aria-label={`Remove ${p.username}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {collaboratorIds.length > 0 && collaboratorProfiles.length < collaboratorIds.length && (
                <li className="text-sm text-white/50">Loading…</li>
              )}
            </ul>
          </section>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={handleViewComic}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white/10 text-white font-medium text-sm hover:bg-white/20 transition-colors border border-white/20"
          >
            View Comic
          </button>
          <button
            type="button"
            onClick={handleCreateAnother}
            className="min-h-[44px] px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors"
          >
            Create Another
          </button>
        </div>
      </div>
    </div>
  )
}
