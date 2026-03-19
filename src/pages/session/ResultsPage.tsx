import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { supabase } from '../../lib/supabase'
import { getPersonalComics } from '../../lib/session'
import { getProfilesByIds } from '../../lib/profiles'

interface ComicLink {
  id: string
  slug: string
  owner_id: string
  title: string
  username?: string
}

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function ResultsPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { session, members, loading, error } = useSession(code)

  const [collabComic, setCollabComic] = useState<{ slug: string } | null>(null)
  const [personalComics, setPersonalComics] = useState<ComicLink[]>([])

  useEffect(() => {
    if (!session) return
    if (session.round !== 'complete') {
      navigate(`/session/${code}/${session.round === 'lobby' ? '' : session.round}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  const loadComics = useCallback(async () => {
    if (!session) return

    if (session.final_comic_id) {
      const { data } = await supabase
        .from('comics')
        .select('slug')
        .eq('id', session.final_comic_id)
        .maybeSingle()
      if (data) setCollabComic({ slug: data.slug as string })
    }

    const comics = await getPersonalComics(session.id)
    const ownerIds = comics.map((c) => c.owner_id)
    const profiles = await getProfilesByIds(ownerIds)
    const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.username]))

    setPersonalComics(
      comics.map((c) => ({
        ...c,
        username: profileMap[c.owner_id],
      }))
    )
  }, [session?.id, session?.final_comic_id, session])

  useEffect(() => {
    loadComics()
  }, [loadComics])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-8 w-8 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-gray-600">{error ?? 'Session not found'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center px-4 pb-8 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mt-6 mb-2">Session Complete!</h1>
      <p className="text-sm text-gray-500 mb-6">{members.length} players participated</p>

      {collabComic && (
        <section className="w-full mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Collaborative Comic</h2>
          <Link
            to={{
              pathname: `/comic/${collabComic.slug}`,
              state: { sessionCode: code },
            }}
            className={btnPrimary + ' w-full text-center block'}
          >
            View Collaborative Comic →
          </Link>
        </section>
      )}

      <section className="w-full">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Personal Comics</h2>
        <div className="flex flex-col gap-2">
          {personalComics.map((comic) => (
            <Link
              key={comic.id}
              to={{
                pathname: `/comic/${comic.slug}`,
                state: { sessionCode: code },
              }}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm text-gray-900">
                {comic.username ? `@${comic.username}` : 'Player'}
              </span>
              <span className="text-sm text-gray-500">View →</span>
            </Link>
          ))}
        </div>
      </section>

      <Link to="/" className="mt-8 text-sm text-gray-500 hover:text-gray-700 underline">
        Back to Home
      </Link>
    </div>
  )
}
