import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchSession, getSessionImages, getSessionPhrases, type SessionImageRow, type SessionPhraseRow, type SessionRow } from '../../lib/session'

export function VisualizerPage() {
  const { code } = useParams<{ code: string }>()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [images, setImages] = useState<SessionImageRow[]>([])
  const [phrases, setPhrases] = useState<SessionPhraseRow[]>([])
  const [loading, setLoading] = useState(true)

  const loadSession = useCallback(async () => {
    if (!code) return
    const result = await fetchSession(code)
    if ('error' in result) return
    setSession(result.session)
    setLoading(false)
  }, [code])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const loadContent = useCallback(async () => {
    if (!session) return
    const [imgs, phrs] = await Promise.all([
      getSessionImages(session.id),
      getSessionPhrases(session.id),
    ])
    setImages(imgs)
    setPhrases(phrs)
  }, [session?.id, session])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  useEffect(() => {
    if (!session?.id) return

    const channel = supabase
      .channel(`visualizer-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_images',
          filter: `session_id=eq.${session.id}`,
        },
        () => loadContent()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_phrases',
          filter: `session_id=eq.${session.id}`,
        },
        () => loadContent()
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          setSession((prev) => prev ? { ...prev, ...(payload.new as SessionRow) } : prev)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.id, loadContent])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-2 border-gray-600 border-t-white animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center text-white">
        <p>Session not found</p>
      </div>
    )
  }

  const roundLabel =
    session.round === 'images'
      ? 'Uploading Images…'
      : session.round === 'phrases'
        ? 'Writing Phrases…'
        : session.round === 'compose'
          ? 'Composing Comics…'
          : session.round === 'voting'
            ? 'Voting…'
            : session.round === 'complete'
              ? 'Complete!'
              : 'Lobby'

  return (
    <div className="fixed inset-0 bg-gray-950 text-white overflow-hidden flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-6 py-4">
        <span className="text-sm font-medium text-gray-400">
          {session.code}
        </span>
        <span className="text-sm font-medium text-gray-400">
          {roundLabel}
        </span>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {images.length === 0 && phrases.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-lg">Waiting for contributions…</p>
          </div>
        )}

        {images.length > 0 && (
          <div className="absolute inset-0 flex flex-wrap gap-3 p-6 content-start overflow-y-auto">
            {images.map((img) => (
              <div
                key={img.id}
                className="w-40 h-40 rounded-lg overflow-hidden border border-gray-700 shrink-0 animate-[fadeIn_0.5s_ease-in]"
              >
                <img
                  src={img.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            ))}
          </div>
        )}

        {phrases.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <div className="flex flex-wrap gap-2 justify-center">
              {phrases.map((p) => (
                <span
                  key={p.id}
                  className="inline-block px-4 py-2 bg-white/10 backdrop-blur rounded-full text-sm text-white border border-white/20 animate-[fadeIn_0.5s_ease-in]"
                >
                  {p.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
