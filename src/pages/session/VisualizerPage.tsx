import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchSession, getSessionImages, getSessionPhrases, type SessionImageRow, type SessionPhraseRow, type SessionRow } from '../../lib/session'

function seededRandom(id: string, salt: number): number {
  let hash = salt
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  return ((hash & 0x7fffffff) % 1000) / 1000
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

type ClusterOpts = { stackPerIndex?: number; jitterMul?: number; stackSpread?: number }

/** Deterministic positions packed near (cx, cy) so items feel aware of each other. */
function clusterPercent(
  id: string,
  index: number,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  salt: number,
  opts?: ClusterOpts
): { x: number; y: number } {
  const stackPerIndex = opts?.stackPerIndex ?? 2.2
  const jitterMul = opts?.jitterMul ?? 0.55
  const stackSpread = opts?.stackSpread ?? 0.35
  const angle = seededRandom(id, salt) * Math.PI * 2
  const radial = 0.25 + seededRandom(id, salt + 7) * 0.75
  const ringX = Math.cos(angle) * radiusX * radial
  const ringY = Math.sin(angle) * radiusY * radial
  const jitterX = (seededRandom(id, salt + 13) - 0.5) * radiusX * jitterMul
  const jitterY = (seededRandom(id, salt + 19) - 0.5) * radiusY * jitterMul
  const stack = index * stackPerIndex
  const stackAngle = (index * 0.85) % (Math.PI * 2)
  const x = cx + ringX + jitterX + Math.cos(stackAngle) * stack * stackSpread
  const y = cy + ringY + jitterY + Math.sin(stackAngle) * stack * stackSpread
  return {
    x: clamp(x, 2, 88),
    y: clamp(y, 4, 82),
  }
}

const FALL_DURATION_MS = 1300
const STAGGER_MS = 100
/** Pause after last image lands before any phrase starts falling. */
const PHRASE_AFTER_IMAGES_GAP_MS = 450

export function VisualizerPage() {
  const { code } = useParams<{ code: string }>()
  const [session, setSession] = useState<SessionRow | null>(null)
  const [images, setImages] = useState<SessionImageRow[]>([])
  const [phrases, setPhrases] = useState<SessionPhraseRow[]>([])
  const [loading, setLoading] = useState(true)

  const initialImageIds = useRef<Set<string> | null>(null)
  const initialPhraseIds = useRef<Set<string> | null>(null)

  const loadSession = useCallback(async () => {
    if (!code) return
    const result = await fetchSession(code)
    if ('error' in result) return
    setSession(result.session)
    setLoading(false)
  }, [code])

  useEffect(() => { loadSession() }, [loadSession])

  const loadContent = useCallback(async () => {
    if (!session) return
    const [imgs, phrs] = await Promise.all([
      getSessionImages(session.id),
      getSessionPhrases(session.id),
    ])
    setImages(imgs)
    setPhrases(phrs)
  }, [session?.id, session])

  useEffect(() => { loadContent() }, [loadContent])

  useEffect(() => {
    if (initialImageIds.current === null && images.length > 0) {
      initialImageIds.current = new Set(images.map((i) => i.id))
    }
  }, [images])

  useEffect(() => {
    if (initialPhraseIds.current === null && phrases.length > 0) {
      initialPhraseIds.current = new Set(phrases.map((p) => p.id))
    }
  }, [phrases])

  useEffect(() => {
    if (!session?.id) return

    const channel = supabase
      .channel(`visualizer-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_images', filter: `session_id=eq.${session.id}` },
        () => loadContent()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_phrases', filter: `session_id=eq.${session.id}` },
        () => loadContent()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
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

  const initialImgCount = initialImageIds.current?.size ?? images.length
  const lastImageStartMs =
    images.length === 0 ? 0 : Math.max(0, initialImgCount - 1) * STAGGER_MS
  const imagesAllLandedMs =
    images.length === 0 ? 0 : lastImageStartMs + FALL_DURATION_MS
  const phraseCascadeStartMs =
    images.length === 0
      ? 0
      : imagesAllLandedMs + PHRASE_AFTER_IMAGES_GAP_MS

  return (
    <div className="fixed inset-0 bg-gray-950 text-white overflow-hidden flex flex-col">
      <style>{`
        @keyframes gravity-drop {
          0% {
            transform: translateY(-110vh) rotate(calc(var(--land-tilt, 0deg) * 3));
            opacity: 0;
          }
          5% {
            opacity: 0.5;
          }
          18% {
            transform: translateY(-100vh) rotate(calc(var(--land-tilt, 0deg) * 2.5));
            opacity: 0.5;
          }
          36% {
            transform: translateY(-73vh) rotate(calc(var(--land-tilt, 0deg) * 1.5));
          }
          52% {
            transform: translateY(-32vh) rotate(var(--land-tilt, 0deg));
          }
          62% {
            transform: translateY(0) rotate(var(--land-tilt, 0deg));
          }
          73% {
            transform: translateY(-28px) rotate(calc(var(--land-tilt, 0deg) - 1.5deg));
          }
          83% {
            transform: translateY(0) rotate(var(--land-tilt, 0deg));
          }
          91% {
            transform: translateY(-8px) rotate(calc(var(--land-tilt, 0deg) + 0.5deg));
          }
          100% {
            transform: translateY(0) rotate(var(--land-tilt, 0deg));
            opacity: 0.5;
          }
        }
      `}</style>

      <div className="shrink-0 flex items-center justify-between px-6 py-4">
        <span className="text-sm font-medium text-gray-400">{session.code}</span>
        <span className="text-sm font-medium text-gray-400">{roundLabel}</span>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {images.length === 0 && phrases.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 text-lg">Waiting for contributions…</p>
          </div>
        )}

        {images.map((img, idx) => {
          const { x, y } = clusterPercent(img.id, idx, 44, 24, 34, 22, 101, {
            stackPerIndex: 5.2,
            jitterMul: 0.62,
            stackSpread: 0.48,
          })
          const tilt = seededRandom(img.id, 3) * 12 - 6
          const isInitial = initialImageIds.current?.has(img.id) ?? false
          const delay = isInitial ? idx * STAGGER_MS : 0

          return (
            <div
              key={img.id}
              className="absolute w-56 h-56 sm:w-64 sm:h-64 rounded-lg overflow-hidden border border-gray-700 shadow-lg"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                zIndex: idx,
                opacity: 0.5,
                transform: `rotate(${tilt}deg)`,
                willChange: 'transform, opacity',
                animation: `gravity-drop ${FALL_DURATION_MS}ms linear ${delay}ms both`,
                ['--land-tilt' as string]: `${tilt}deg`,
              }}
            >
              <img src={img.image_url} alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
          )
        })}

        {phrases.map((p, idx) => {
          const { x, y } = clusterPercent(p.id, idx, 44, 80, 24, 9, 203)
          const tilt = seededRandom(p.id, 3) * 10 - 5
          const isInitial = initialPhraseIds.current?.has(p.id) ?? false
          const delay = isInitial ? phraseCascadeStartMs + idx * STAGGER_MS : 0

          return (
            <span
              key={p.id}
              className="absolute px-6 py-3 sm:px-7 sm:py-3.5 bg-white/10 backdrop-blur rounded-full text-xl sm:text-2xl font-medium text-white border border-white/20 whitespace-nowrap"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                zIndex: images.length + idx,
                opacity: 0.5,
                transform: `rotate(${tilt}deg)`,
                willChange: 'transform, opacity',
                animation: `gravity-drop ${FALL_DURATION_MS}ms linear ${delay}ms both`,
                ['--land-tilt' as string]: `${tilt}deg`,
              }}
            >
              {p.text}
            </span>
          )
        })}
      </div>
    </div>
  )
}
