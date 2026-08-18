import { useEffect, useRef } from 'react'
import { fetchComicForEditor } from '../lib/comicEditor'
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
  const blobUrl = d.imageBlob ? URL.createObjectURL(d.imageBlob) : ''
  return {
    id: d.id,
    imageFile: null,
    imageUrl: blobUrl || d.imageUrl || '',
    websiteUrl: d.websiteUrl,
    caption: d.caption,
    overlayPosition: { ...d.overlayPosition },
    textMode: d.textMode,
    fontSize: d.fontSize,
    fontColor: d.fontColor,
    fontFamily: d.fontFamily ?? 'Arial',
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
  title: string,
  publishedComicId: string | null,
  publishedSlug: string | null
): Promise<DraftPayloadStored | null> {
  const draftFrames: DraftFrameStored[] = []
  for (const frame of frames) {
    const imageBlob = await frameToBlob(frame)
    const remoteUrl =
      !imageBlob && /^https?:\/\//.test(frame.imageUrl) ? frame.imageUrl : undefined
    draftFrames.push({
      id: frame.id,
      caption: frame.caption,
      overlayPosition: { ...frame.overlayPosition },
      textMode: frame.textMode,
      fontSize: frame.fontSize,
      fontColor: frame.fontColor,
      fontFamily: frame.fontFamily,
      imageBlob: imageBlob ?? undefined,
      imageUrl: remoteUrl,
      websiteUrl: frame.websiteUrl,
    })
  }
  return {
    version: DRAFT_VERSION,
    title,
    publishedComicId,
    publishedSlug,
    frames: draftFrames,
  }
}

function draftMatchesComic(
  draft: DraftPayloadStored | null,
  comicSlugFromUrl: string | null
): boolean {
  if (!draft || !comicSlugFromUrl) return false
  return (
    draft.publishedSlug === comicSlugFromUrl ||
    draft.publishedComicId === comicSlugFromUrl
  )
}

/**
 * Load comic draft (or a published comic from ?comic=) on mount and
 * persist frame images + metadata to IndexedDB whenever frames change.
 */
export function useDraftPersistence(
  _user: unknown,
  authLoading: boolean,
  comicSlugFromUrl: string | null
): void {
  const {
    frames,
    comicTitle,
    publishedComicId,
    publishedSlug,
    setFrames,
    setComicTitle,
    restoreDraftMeta,
    loadPublishedComic,
    setEditorHydrated,
  } = useComicStore()
  const hasLoadedDraft = useRef(false)
  /** True after we've had at least one frame this session (so we can tell "user cleared all" from "just refreshed". */
  const hadFramesThisSession = useRef(false)

  useEffect(() => {
    if (authLoading) return
    const current = useComicStore.getState()
    const urlMismatch =
      Boolean(comicSlugFromUrl) &&
      current.publishedSlug !== comicSlugFromUrl &&
      current.publishedComicId !== comicSlugFromUrl
    if (urlMismatch) {
      hasLoadedDraft.current = false
      setEditorHydrated({ hydrated: false })
    }
    if (hasLoadedDraft.current) return
    const currentFrames = current.frames
    if (currentFrames.length > 0 && !urlMismatch) {
      hasLoadedDraft.current = true
      hadFramesThisSession.current = true
      setEditorHydrated({ hydrated: true })
      return
    }

    let cancelled = false
    ;(async () => {
      let draft = await getDraft()
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

      if (cancelled) return

      const useLocalDraft =
        Boolean(draft?.frames?.length) &&
        (!comicSlugFromUrl || draftMatchesComic(draft, comicSlugFromUrl))

      if (useLocalDraft && draft?.frames?.length) {
        hasLoadedDraft.current = true
        hadFramesThisSession.current = true
        setFrames(draft.frames.map(storedToFrame))
        setComicTitle(draft.title?.trim() || 'Comic Title')
        restoreDraftMeta({
          publishedSlug: draft.publishedSlug ?? null,
          publishedComicId: draft.publishedComicId ?? null,
        })
        setEditorHydrated({ hydrated: true })
        return
      }

      if (comicSlugFromUrl) {
        const result = await fetchComicForEditor(comicSlugFromUrl)
        if (cancelled) return
        hasLoadedDraft.current = true
        if ('error' in result) {
          setEditorHydrated({ hydrated: true, error: result.error })
          return
        }
        hadFramesThisSession.current = true
        loadPublishedComic(result.comicId, result.slug, result.title, result.frames)
        setEditorHydrated({ hydrated: true })
        return
      }

      hasLoadedDraft.current = true
      setEditorHydrated({ hydrated: true })
    })()

    return () => {
      cancelled = true
    }
  }, [
    authLoading,
    comicSlugFromUrl,
    setFrames,
    setComicTitle,
    restoreDraftMeta,
    loadPublishedComic,
    setEditorHydrated,
  ])

  useEffect(() => {
    if (!hasLoadedDraft.current) return
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
    framesToDraftPayload(frames, comicTitle, publishedComicId, publishedSlug).then(async (payload) => {
      if (cancelled || !payload) return
      await setDraft(payload)
    })
    return () => {
      cancelled = true
    }
  }, [frames, comicTitle, publishedComicId, publishedSlug])
}
