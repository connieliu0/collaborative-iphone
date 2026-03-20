import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../../hooks/useSession'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { FrameContent, type FrameDisplay } from '../ComicViewerPage'
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

const SWIPE_THRESHOLD_PX = 50

const btnPrimary =
  'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'
const btnSecondary =
  'min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:pointer-events-none'
const REQUIRED_FRAMES = 3
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
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewIndex, setPreviewIndex] = useState(0)
  const previewSwipeStartRef = useRef<{ x: number } | null>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)

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

  const requiredFrameCount = useMemo(
    () => Math.min(REQUIRED_FRAMES, myImages.length),
    [myImages.length]
  )

  const handleToggleImage = (img: SessionImageRow) => {
    setSelectedImageUrls((prev) => {
      if (prev.includes(img.image_url)) {
        return prev.filter((url) => url !== img.image_url)
      }
      if (prev.length >= requiredFrameCount) return prev
      return [...prev, img.image_url]
    })
  }

  const handleStartCompose = () => {
    if (selectedImageUrls.length !== requiredFrameCount) return
    setFrames(
      selectedImageUrls.map((image_url) => ({
        id: crypto.randomUUID(),
        image_url,
        caption: '',
        phraseId: null,
      }))
    )
  }

  const handleRemoveFrame = async (frameId: string) => {
    const frame = frames.find((f) => f.id === frameId)
    if (frame?.phraseId && user) {
      await releasePhrase(frame.phraseId, user.id)
    }
    setFrames((prev) => prev.filter((f) => f.id !== frameId))
  }

  const handlePhraseSelect = async (frameId: string, nextPhraseId: string) => {
    if (!user) return
    const frame = frames.find((f) => f.id === frameId)
    if (!frame) return

    if (!nextPhraseId) {
      if (frame.phraseId) {
        await releasePhrase(frame.phraseId, user.id)
      }
      setFrames((prev) =>
        prev.map((f) => (f.id === frameId ? { ...f, caption: '', phraseId: null } : f))
      )
      loadData()
      return
    }

    if (frame.phraseId === nextPhraseId) return
    const phrase = availablePhrases.find((p) => p.id === nextPhraseId)
    if (!phrase) return

    const result = await claimPhrase(nextPhraseId, user.id)
    if (result.error) return

    if (frame.phraseId) {
      await releasePhrase(frame.phraseId, user.id)
    }
    setFrames((prev) =>
      prev.map((f) => (f.id === frameId ? { ...f, caption: phrase.text, phraseId: phrase.id } : f))
    )
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

  const previewDisplayFrames: FrameDisplay[] = useMemo(
    () =>
      frames.map((f) => ({
        image_url: f.image_url,
        caption: f.caption,
        overlay_x: 50,
        overlay_y: 90,
        font_size: 18,
        font_color: '#ffffff',
        font_family: 'News Cycle',
      })),
    [frames]
  )

  const previewGoPrev = useCallback(() => {
    setPreviewIndex((i) => (i > 0 ? i - 1 : i))
  }, [])

  const previewGoNext = useCallback(() => {
    setPreviewIndex((i) => (i < previewDisplayFrames.length - 1 ? i + 1 : i))
  }, [previewDisplayFrames.length])

  const onPreviewPointerDown = useCallback((e: React.PointerEvent) => {
    previewSwipeStartRef.current = { x: e.clientX }
  }, [])

  const onPreviewPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const start = previewSwipeStartRef.current
      previewSwipeStartRef.current = null
      if (!start) return
      const delta = e.clientX - start.x
      if (delta > SWIPE_THRESHOLD_PX) previewGoPrev()
      else if (delta < -SWIPE_THRESHOLD_PX) previewGoNext()
    },
    [previewGoPrev, previewGoNext]
  )

  const onPreviewKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        previewGoPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        previewGoNext()
      }
    },
    [previewGoPrev, previewGoNext]
  )

  useEffect(() => {
    if (!previewOpen) return
    setPreviewIndex(0)
    previewContainerRef.current?.focus()
  }, [previewOpen])

  useEffect(() => {
    if (!previewOpen) return
    setPreviewIndex((i) => Math.min(i, Math.max(0, previewDisplayFrames.length - 1)))
  }, [previewOpen, previewDisplayFrames.length])

  const canPreview = frames.length > 0
  const previewFrame = previewDisplayFrames[previewIndex]

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
      <p className="text-sm text-gray-500 mb-4 text-center">Choose photos, then match each with a phrase</p>

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
          {frames.length === 0 ? (
            <section className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-gray-700">Step 1: Choose Photos</h2>
                <p className="text-xs text-gray-500">
                  {selectedImageUrls.length} / {requiredFrameCount}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {myImages.map((img) => {
                  const selected = selectedImageUrls.includes(img.image_url)
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => handleToggleImage(img)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selected ? 'border-gray-900 ring-2 ring-gray-300' : 'border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                onClick={handleStartCompose}
                disabled={selectedImageUrls.length !== requiredFrameCount}
                className={btnPrimary + ' w-full'}
              >
                Continue with selected photos
              </button>
            </section>
          ) : (
            <>
              <section className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-medium text-gray-700">
                    Step 2: Match Phrases ({frames.length} frames)
                  </h2>
                  <button
                    type="button"
                    onClick={async () => {
                      for (const frame of frames) {
                        if (frame.phraseId && user) {
                          await releasePhrase(frame.phraseId, user.id)
                        }
                      }
                      setFrames([])
                      setSelectedImageUrls([])
                      setPublishError(null)
                      loadData()
                    }}
                    className="text-xs text-gray-600 hover:text-gray-900 underline"
                  >
                    Re-pick photos
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  {frames.map((frame) => {
                    const dropdownOptions = availablePhrases.filter(
                      (phrase) => phrase.id === frame.phraseId || !frames.some((f) => f.phraseId === phrase.id)
                    )
                    return (
                      <div
                        key={frame.id}
                        className="flex gap-3 items-start rounded-lg border border-gray-200 bg-white p-3"
                      >
                        <div className="shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                          <img src={frame.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs text-gray-500 mb-1">Text</label>
                          <select
                            value={frame.phraseId ?? ''}
                            onChange={(e) => void handlePhraseSelect(frame.id, e.target.value)}
                            className="w-full min-h-[40px] px-2 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
                          >
                            <option value="">Select a phrase</option>
                            {dropdownOptions.map((phrase) => (
                              <option key={phrase.id} value={phrase.id}>
                                {phrase.text}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveFrame(frame.id)}
                            className="mt-2 text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Selected phrases are removed from other dropdowns.
                </p>
              </section>
            </>
          )}

          {publishError && (
            <p className="text-sm text-red-600 mb-2 text-center" role="alert">
              {publishError}
            </p>
          )}

          <div className="flex flex-row gap-2 w-full max-w-xs mx-auto">
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              disabled={!canPreview}
              className={btnSecondary + ' flex-1 min-w-0'}
            >
              Preview
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || frames.length === 0 || frames.some((f) => !f.phraseId)}
              className={btnPrimary + ' flex-1 min-w-0'}
            >
              {publishing ? 'Publishing…' : 'Publish My Comic'}
            </button>
          </div>
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

      {previewOpen && (
        <div
          ref={previewContainerRef}
          className="fixed inset-0 z-[100] bg-gray-50 flex flex-col text-gray-900 overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
          onKeyDown={onPreviewKeyDown}
          tabIndex={0}
          role="dialog"
          aria-modal="true"
          aria-label="Comic preview"
        >
          <div className="absolute top-4 right-4 z-10">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Close preview"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-center text-xs text-gray-500 pt-14 px-4 shrink-0">
            Comment mode: phrase in the caption bar under each panel
          </p>
          <div
            className="flex-1 flex flex-col items-center justify-center w-full max-w-[640px] mx-auto px-4 py-4 min-h-0"
            onPointerDown={onPreviewPointerDown}
            onPointerUp={onPreviewPointerUp}
            onPointerLeave={onPreviewPointerUp}
            onPointerCancel={onPreviewPointerUp}
          >
            {previewFrame ? (
              <FrameContent
                frame={previewFrame}
                showCaption
                overlayCaption={false}
                variant="default"
              />
            ) : (
              <p className="text-gray-500">No frames</p>
            )}
          </div>
          {previewDisplayFrames.length > 0 && (
            <>
              <button
                type="button"
                onClick={previewGoPrev}
                disabled={previewIndex <= 0}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                aria-label="Previous frame"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={previewGoNext}
                disabled={previewIndex >= previewDisplayFrames.length - 1}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                aria-label="Next frame"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="shrink-0 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] flex items-center justify-center gap-2">
                <span className="text-sm text-gray-600 tabular-nums">
                  {previewIndex + 1} / {previewDisplayFrames.length}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
