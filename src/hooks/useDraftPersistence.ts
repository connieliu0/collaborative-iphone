import { useEffect, useRef } from 'react'
import type { ComicFrame } from '../stores/useComicStore'
import { useComicStore } from '../stores/useComicStore'
import {
  clearDraft,
  getDraft,
  setDraft,
  getLegacyDraft,
  clearLegacyDraft,
  dataUrlToBlob,
  type DraftFrameStored,
  type DraftPayloadStored,
} from '../lib/draftStorage'

const DRAFT_VERSION = 1

function storedToFrame(d: DraftFrameStored): ComicFrame {
  return {
    id: d.id,
    imageFile: null,
    imageUrl: URL.createObjectURL(d.imageBlob),
    caption: d.caption,
    overlayText: d.overlayText,
    overlayPosition: { ...d.overlayPosition },
    textMode: d.textMode,
    fontSize: d.fontSize,
    fontColor: d.fontColor,
    fontFamily: d.fontFamily ?? 'News Cycle',
  }
}

async function frameToBlob(frame: ComicFrame): Promise<Blob | null> {
  if (frame.imageFile) return frame.imageFile
  if (frame.imageUrl.startsWith('blob:')) {
    try {
      const res = await fetch(frame.imageUrl)
      return await res.blob()
    } catch {
      return null
    }
  }
  return null
}

async function framesToDraftPayload(
  frames: ComicFrame[],
  title: string
): Promise<DraftPayloadStored | null> {
  const draftFrames: DraftFrameStored[] = []
  for (const frame of frames) {
    const imageBlob = await frameToBlob(frame)
    if (!imageBlob) return null
    draftFrames.push({
      id: frame.id,
      caption: frame.caption,
      overlayText: frame.overlayText,
      overlayPosition: { ...frame.overlayPosition },
      textMode: frame.textMode,
      fontSize: frame.fontSize,
      fontColor: frame.fontColor,
      fontFamily: frame.fontFamily,
      imageBlob,
    })
  }
  return { version: DRAFT_VERSION, title, frames: draftFrames }
}

/**
 * When there is no user, load comic draft from IndexedDB on mount and
 * persist frame images (as Blobs) + metadata to IndexedDB whenever frames change.
 */
export function useDraftPersistence(user: unknown, authLoading: boolean): void {
  const { frames, comicTitle, setFrames, setComicTitle } = useComicStore()
  const hasLoadedDraft = useRef(false)
  /** True after we've had at least one frame this session (so we can tell "user cleared all" from "just refreshed". */
  const hadFramesThisSession = useRef(false)

  // Load draft once when no user and store is empty (with optional legacy migration)
  useEffect(() => {
    if (authLoading || user != null) return
    if (hasLoadedDraft.current) return
    const currentFrames = useComicStore.getState().frames
    if (currentFrames.length > 0) return

    let cancelled = false
    ;(async () => {
      let draft = await getDraft()
      // Migrate from localStorage if IDB draft is empty
      if (!draft?.frames?.length) {
        const legacy = getLegacyDraft()
        if (legacy?.frames?.length) {
          const blobs: Blob[] = []
          for (const f of legacy.frames) {
            try {
              const blob = await dataUrlToBlob(f.imageDataUrl)
              blobs.push(blob)
            } catch {
              if (cancelled) return
              return
            }
          }
          draft = {
            version: DRAFT_VERSION,
            frames: legacy.frames.map((f, i) => ({
              id: f.id,
              caption: f.caption,
              overlayText: f.overlayText,
              overlayPosition: f.overlayPosition,
              textMode: f.textMode,
              fontSize: f.fontSize,
              fontColor: f.fontColor,
              fontFamily: f.fontFamily,
              imageBlob: blobs[i],
            })),
          }
          await setDraft(draft)
          clearLegacyDraft()
        }
      }
      if (cancelled || !draft?.frames?.length) return
      hasLoadedDraft.current = true
      hadFramesThisSession.current = true
      const restored = draft.frames.map(storedToFrame)
      setFrames(restored)
      setComicTitle(draft.title?.trim() || 'Untitled')
    })()

    return () => {
      cancelled = true
    }
  }, [authLoading, user, setFrames, setComicTitle])

  // Persist draft when no user and frames exist; only clear when user had frames and then removed all (not on refresh)
  useEffect(() => {
    if (user != null) return
    if (frames.length > 0) {
      hadFramesThisSession.current = true
    }
    if (frames.length === 0) {
      if (hadFramesThisSession.current) {
        hadFramesThisSession.current = false
        clearDraft()
      }
      return
    }
    let cancelled = false
    framesToDraftPayload(frames, comicTitle).then(async (payload) => {
      if (cancelled || !payload) return
      await setDraft(payload)
    })
    return () => {
      cancelled = true
    }
  }, [user, frames, comicTitle])
}
