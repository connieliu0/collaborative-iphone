import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import {
  advanceRound,
  getSessionImages,
  getSessionPhrases,
  getPersonalComics,
  claimPhrase,
  releasePhrase,
  publishPersonalComic,
  type SessionImageRow,
  type SessionPhraseRow,
} from '../../lib/session'

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
interface ComicFrameLocal {
  id: string
  image_url: string
  caption: string
  phraseId: string | null
}

export function ComposeRoundPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { session, members, loading, error } = useSession(code)

  const [, setAllImages] = useState<SessionImageRow[]>([])
  const [allPhrases, setAllPhrases] = useState<SessionPhraseRow[]>([])
  const [myImages, setMyImages] = useState<SessionImageRow[]>([])
  const [frames, setFrames] = useState<ComicFrameLocal[]>([])
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [personalComicCount, setPersonalComicCount] = useState(0)
  const [initialized, setInitialized] = useState(false)
  const [phrasePickerFrame, setPhrasePickerFrame] = useState<string | null>(null)

  const isHost = user && session && session.host_id === user.id

  useEffect(() => {
    if (!session) return
    if (session.round !== 'compose') {
      const next = session.round === 'complete' ? 'results' : session.round
      navigate(`/session/${code}/${next}`, { replace: true })
    }
  }, [session?.round, code, navigate, session])

  const loadData = useCallback(async () => {
    if (!session) return
    const [imgs, phrs, comics] = await Promise.all([
      getSessionImages(session.id),
      getSessionPhrases(session.id),
      getPersonalComics(session.id),
    ])
    setAllImages(imgs)
    setAllPhrases(phrs)
    setPersonalComicCount(comics.length)

    if (user && comics.some((c) => c.owner_id === user.id)) {
      setPublished(true)
    }

    if (!initialized && user) {
      const shuffled = [...imgs].sort(() => Math.random() - 0.5)
      const memberIds = members.map((m) => m.user_id)
      const myIdx = memberIds.indexOf(user.id)
      const perPlayer = Math.max(3, Math.ceil(shuffled.length / Math.max(memberIds.length, 1)))
      const start = (myIdx * perPlayer) % shuffled.length
      const assigned: SessionImageRow[] = []
      for (let i = 0; i < perPlayer && assigned.length < perPlayer; i++) {
        assigned.push(shuffled[(start + i) % shuffled.length])
      }
      setMyImages(assigned)
      setInitialized(true)
    }
  }, [session?.id, user?.id, initialized, members, session, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!session?.id) return
    const channel = supabase
      .channel(`compose-progress-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comics', filter: `session_id=eq.${session.id}` },
        () => loadData()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.id, loadData])

  const availablePhrases = useMemo(() => {
    const usedIds = new Set(frames.map((f) => f.phraseId).filter(Boolean))
    return allPhrases.filter(
      (p) => p.used_by === null || p.used_by === user?.id || usedIds.has(p.id)
    )
  }, [allPhrases, frames, user?.id])

  const handleAddFrame = (img: SessionImageRow) => {
    if (frames.some((f) => f.image_url === img.image_url)) return
    setFrames((prev) => [
      ...prev,
      { id: crypto.randomUUID(), image_url: img.image_url, caption: '', phraseId: null },
    ])
  }

  const handleRemoveFrame = async (frameId: string) => {
    const frame = frames.find((f) => f.id === frameId)
    if (frame?.phraseId && user) {
      await releasePhrase(frame.phraseId, user.id)
    }
    setFrames((prev) => prev.filter((f) => f.id !== frameId))
  }

  const handlePickPhrase = async (frameId: string, phrase: SessionPhraseRow) => {
    if (!user) return
    const result = await claimPhrase(phrase.id, user.id)
    if (result.error) {
      setAllPhrases((prev) =>
        prev.map((p) => (p.id === phrase.id ? { ...p, used_by: 'taken' } : p))
      )
      return
    }
    const frame = frames.find((f) => f.id === frameId)
    if (frame?.phraseId) {
      await releasePhrase(frame.phraseId, user.id)
    }
    setFrames((prev) =>
      prev.map((f) => (f.id === frameId ? { ...f, caption: phrase.text, phraseId: phrase.id } : f))
    )
    setPhrasePickerFrame(null)
    loadData()
  }

  const handlePublish = async () => {
    if (!session || !user || frames.length === 0) return
    setPublishing(true)
    setPublishError(null)
    const result = await publishPersonalComic(
      user.id,
      session.id,
      frames.map((f) => ({ image_url: f.image_url, caption: f.caption }))
    )
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    setPublished(true)
    loadData()
  }

  const handleAdvance = async () => {
    if (!session || !user) return
    setAdvancing(true)
    await advanceRound(session.id, user.id, 'voting')
    setAdvancing(false)
  }

  const allPublished = personalComicCount >= members.length

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
    <div className="flex flex-col px-4 pb-8 max-w-xl mx-auto">
      <h1 className="text-lg font-semibold text-gray-900 mt-4 mb-1 text-center">
        Round 3: Compose
      </h1>
      <p className="text-sm text-gray-500 mb-4 text-center">
        Build your comic from the image pool and phrase list
      </p>

      <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
        <div
          className="bg-gray-900 h-2 rounded-full transition-all"
          style={{ width: `${(personalComicCount / Math.max(members.length, 1)) * 100}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mb-6 text-center">
        {personalComicCount} / {members.length} players published
      </p>

      {!published ? (
        <>
          <section className="mb-6">
            <h2 className="text-sm font-medium text-gray-700 mb-2">Your Image Pool</h2>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {myImages.map((img) => {
                const used = frames.some((f) => f.image_url === img.image_url)
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => handleAddFrame(img)}
                    disabled={used}
                    className={`shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                      used ? 'border-green-500 opacity-60' : 'border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                  </button>
                )
              })}
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-sm font-medium text-gray-700 mb-2">
              Your Comic ({frames.length} frames)
            </h2>
            {frames.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Tap images above to add frames
              </p>
            )}
            <div className="flex flex-col gap-3">
              {frames.map((frame) => (
                <div
                  key={frame.id}
                  className="flex gap-3 items-start rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                    <img src={frame.image_url} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {frame.caption ? (
                      <p className="text-sm text-gray-900 mb-1">"{frame.caption}"</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPhrasePickerFrame(frame.id)}
                        className="text-sm text-blue-600 hover:text-blue-800 underline"
                      >
                        Pick a phrase →
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveFrame(frame.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {phrasePickerFrame && (
            <section className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Pick a phrase</h3>
              <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto">
                {availablePhrases.map((p) => {
                  const claimed = p.used_by !== null && p.used_by !== user?.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePickPhrase(phrasePickerFrame, p)}
                      disabled={claimed}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                        claimed
                          ? 'border-gray-200 text-gray-400 cursor-not-allowed'
                          : 'border-gray-300 text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      {p.text}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setPhrasePickerFrame(null)}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </section>
          )}

          {publishError && (
            <p className="text-sm text-red-600 mb-2 text-center" role="alert">
              {publishError}
            </p>
          )}

          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || frames.length === 0}
            className={btnPrimary + ' w-full max-w-xs mx-auto'}
          >
            {publishing ? 'Publishing…' : 'Publish My Comic'}
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-2">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm text-gray-600">Comic published! Waiting for others…</p>
        </div>
      )}

      {isHost && allPublished && (
        <button
          type="button"
          onClick={handleAdvance}
          disabled={advancing}
          className={btnPrimary + ' w-full max-w-xs mx-auto mt-6'}
        >
          {advancing ? 'Advancing…' : 'Next: Voting →'}
        </button>
      )}
    </div>
  )
}
