import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { deleteComic } from '../lib/deleteComic'
import { createPagePath, fetchComicForEditor } from '../lib/comicEditor'
import { useAuth } from '../hooks/useAuth'
import { useComicStore } from '../stores/useComicStore'

interface ProfileComic {
  id: string
  slug: string
  title: string
  status: string
  created_at: string
  mode?: 'solo' | 'collab'
}

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const loadPublishedComic = useComicStore((s) => s.loadPublishedComic)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comics, setComics] = useState<ProfileComic[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const fetchComics = useCallback(async () => {
    if (!user) return

    setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('comics')
      .select('id, slug, title, status, created_at, mode')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false })

    if (queryError) {
      setError(queryError.message)
      setComics([])
      setLoading(false)
      return
    }

    setComics((data ?? []) as ProfileComic[])
    setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchComics()
  }, [user?.id, fetchComics])

  // Refetch when page becomes visible (e.g., after publishing a comic)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        fetchComics()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [user, fetchComics])

  const handleDeleteComic = async (comic: ProfileComic) => {
    if (!user) return

    const title = comic.title?.trim() ? comic.title : 'Comic Title'
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

  const handleEditComic = async (comic: ProfileComic) => {
    if (!user) return

    setEditingId(comic.id)
    setDeleteError(null)

    const result = await fetchComicForEditor(comic.slug)
    if ('error' in result) {
      setDeleteError(result.error)
      setEditingId(null)
      return
    }

    loadPublishedComic(result.comicId, result.slug, result.title, result.frames)
    setEditingId(null)
    navigate(createPagePath(result.slug))
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/create')
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-gray-900">Your profile</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="min-h-[36px] px-4 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          Log out
        </button>
      </div>
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
        <div className="flex flex-col gap-1">
          {deleteError && (
            <div className="text-red-600 text-sm mb-2" role="alert">
              {deleteError}
            </div>
          )}
          {comics.map((comic) => (
            <div
              key={comic.id}
              className="py-2 px-3 bg-white"
            >
              <div className="flex items-center justify-between gap-3">
                <Link to={`/comic/${comic.slug}`} className="flex-1 min-w-0">
                  <h2
                    className="text-sm text-gray-900 truncate"
                    title={comic.title?.trim() ? comic.title : 'Comic Title'}
                  >
                    {comic.title?.trim() ? comic.title : 'Comic Title'}
                  </h2>
                </Link>

                <div className="flex items-center gap-1.5">
                  {comic.mode !== 'collab' && (
                    <button
                      type="button"
                      className="shrink-0 inline-flex items-center justify-center h-8 w-8 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label={`Edit ${comic.title?.trim() ? comic.title : 'Comic Title'}`}
                      disabled={editingId === comic.id || deletingId === comic.id}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        void handleEditComic(comic)
                      }}
                    >
                      {editingId === comic.id ? (
                        <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center justify-center h-8 w-8 text-gray-600 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Delete ${comic.title?.trim() ? comic.title : 'Comic Title'}`}
                    disabled={deletingId === comic.id || editingId === comic.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      void handleDeleteComic(comic)
                    }}
                  >
                    {deletingId === comic.id ? (
                      <div className="h-4 w-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

