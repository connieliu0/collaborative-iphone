import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deleteComic } from '../lib/deleteComic'
import { useAuth } from '../hooks/useAuth'

interface ProfileComic {
  id: string
  slug: string
  title: string
  status: string
  created_at: string
  mode?: 'solo' | 'collab'
}

function formatDate(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function ProfilePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comics, setComics] = useState<ProfileComic[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)

      const { data, error: queryError } = await supabase
        .from('comics')
        .select('id, slug, title, status, created_at, mode')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (queryError) {
        setError(queryError.message)
        setComics([])
        setLoading(false)
        return
      }

      setComics((data ?? []) as ProfileComic[])
      setLoading(false)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const handleDeleteComic = async (comic: ProfileComic) => {
    if (!user) return

    const title = comic.title?.trim() ? comic.title : 'Untitled'
    const ok = window.confirm(`Delete "${title}"? This cannot be undone.`)
    if (!ok) return

    setDeleteError(null)
    setDeletingId(comic.id)

    const result = await deleteComic(user.id, comic.id)
    if ('error' in result) {
      setDeleteError(result.error)
      setDeletingId(null)
      return
    }

    setComics((prev) => prev.filter((c) => c.id !== comic.id))
    setDeletingId(null)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
        <p className="text-gray-600 mb-4">Sign in to view your published comics.</p>
        <Link
          to="/create"
          className="min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors inline-flex items-center justify-center"
        >
          Create a comic
        </Link>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[40vh] px-4">
        <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
        <p className="text-sm text-gray-600 mt-3">Loading your comics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full flex flex-col items-center justify-center min-h-[40vh] px-4 text-center">
        <p className="text-red-600 text-sm mb-4" role="alert">
          {error}
        </p>
        <Link
          to="/create"
          className="min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors inline-flex items-center justify-center"
        >
          Publish a new comic
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Your profile</h1>
      <p className="text-sm text-gray-600">
        {comics.length === 0 ? 'No comics yet.' : `You’ve published ${comics.length} comic${comics.length === 1 ? '' : 's'}.`}
      </p>

      {comics.length === 0 ? (
        <div className="mt-2 flex flex-col gap-3 items-center text-center">
          <p className="text-sm text-gray-600">When you publish, it will show up here.</p>
          <Link
            to="/create"
            className="min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors inline-flex items-center justify-center"
          >
            Create your first comic
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {deleteError && (
            <div className="sm:col-span-2 text-red-600 text-sm" role="alert">
              {deleteError}
            </div>
          )}
          {comics.map((comic) => {
            const badgeClass =
              comic.status === 'complete'
                ? 'bg-green-100 text-green-800 border-green-200'
                : 'bg-amber-100 text-amber-800 border-amber-200'

            return (
              <div
                key={comic.id}
                className="rounded-xl border border-gray-200 hover:border-gray-300 bg-white p-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/comic/${comic.slug}`} className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h2
                        className="text-sm font-semibold text-gray-900 truncate"
                        title={comic.title?.trim() ? comic.title : 'Untitled'}
                      >
                        {comic.title?.trim() ? comic.title : 'Untitled'}
                      </h2>
                      <span className={`shrink-0 text-xs px-2 py-1 rounded-full border ${badgeClass}`}>
                        {comic.status === 'complete' ? 'Complete' : 'In progress'}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-gray-500">{formatDate(comic.created_at)}</p>
                      {comic.mode && (
                        <p className="text-xs text-gray-500">{comic.mode === 'collab' ? 'Collab' : 'Solo'}</p>
                      )}
                    </div>
                  </Link>

                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center justify-center h-8 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Delete ${comic.title?.trim() ? comic.title : 'Untitled'}`}
                    disabled={deletingId === comic.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void handleDeleteComic(comic)
                    }}
                  >
                    {deletingId === comic.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

