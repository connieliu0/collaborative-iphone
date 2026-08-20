import { useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
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

function loadKey(comicSlugFromUrl: string | null): string {
  return comicSlugFromUrl ?? '__new__'
}

function storeMatchesComicSlug(
  comicSlugFromUrl: string,
  publishedSlug: string | null,
  publishedComicId: string | null
): boolean {
  return publishedSlug === comicSlugFromUrl || publishedComicId === comicSlugFromUrl
}

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

const OWNERSHIP_ERROR = 'You can only edit your own comics'

async function verifyComicOwnership(
  slugOrId: string,
  userId: string
): Promise<{ error?: string }> {
  const result = await fetchComicForEditor(slugOrId)
  if ('error' in result) return { error: result.error }
  if (result.ownerId !== userId) return { error: OWNERSHIP_ERROR }
  return {}
}

/**
 * Load comic draft (or a published comic from ?comic=) on mount and
 * persist frame images + metadata to IndexedDB whenever frames change.
 */
export function useDraftPersistence(
  user: User | null,
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
  const loadedForKeyRef = useRef<string | null>(null)
  /** True after we've had at least one frame this session (so we can tell "user cleared all" from "just refreshed". */
  const hadFramesThisSession = useRef(false)

  useEffect(() => {
    if (authLoading) return

    const key = loadKey(comicSlugFromUrl)
    const current = useComicStore.getState()

    // Solo create/edit requires a signed-in user.
    if (!user) {
      setEditorHydrated({ hydrated: true })
      return
    }

    // Already loaded this exact target and editor is ready.
    if (loadedForKeyRef.current === key && current.editorHydrated) {
      return
    }

    // Profile (or similar) pre-loaded the comic into the store before navigating here.
    if (
      comicSlugFromUrl &&
      storeMatchesComicSlug(comicSlugFromUrl, current.publishedSlug, current.publishedComicId) &&
      current.frames.length > 0
    ) {
      loadedForKeyRef.current = key
      hadFramesThisSession.current = true
      setEditorHydrated({ hydrated: true })
      return
    }

    // In-progress new comic (no ?comic=) with frames already in memory.
    if (!comicSlugFromUrl && current.frames.length > 0) {
      loadedForKeyRef.current = key
      hadFramesThisSession.current = true
      setEditorHydrated({ hydrated: true })
      return
    }

    setEditorHydrated({ hydrated: false })

    let cancelled = false
    ;(async () => {
      try {
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
                // Skip corrupt legacy draft and continue loading.
                break
              }
            }
            if (blobs.length === legacy.frames.length) {
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
        }

        if (cancelled) return

        const useLocalDraft =
          Boolean(draft?.frames?.length) &&
          (!comicSlugFromUrl || draftMatchesComic(draft, comicSlugFromUrl))

        if (useLocalDraft && draft?.frames?.length) {
          if (comicSlugFromUrl) {
            const ownership = await verifyComicOwnership(comicSlugFromUrl, user.id)
            if (cancelled) return
            if (ownership.error) {
              loadedForKeyRef.current = key
              setEditorHydrated({ hydrated: true, error: ownership.error })
              return
            }
          }
          hadFramesThisSession.current = true
          setFrames(draft.frames.map(storedToFrame))
          setComicTitle(draft.title?.trim() || 'Comic Title')
          restoreDraftMeta({
            publishedSlug: draft.publishedSlug ?? null,
            publishedComicId: draft.publishedComicId ?? null,
          })
          loadedForKeyRef.current = key
          setEditorHydrated({ hydrated: true })
          return
        }

        if (comicSlugFromUrl) {
          const result = await fetchComicForEditor(comicSlugFromUrl)
          if (cancelled) return
          if ('error' in result) {
            loadedForKeyRef.current = key
            setEditorHydrated({ hydrated: true, error: result.error })
            return
          }
          if (result.ownerId !== user.id) {
            loadedForKeyRef.current = key
            setEditorHydrated({ hydrated: true, error: OWNERSHIP_ERROR })
            return
          }
          hadFramesThisSession.current = true
          loadPublishedComic(result.comicId, result.slug, result.title, result.frames)
          loadedForKeyRef.current = key
          setEditorHydrated({ hydrated: true })
          return
        }

        loadedForKeyRef.current = key
        setEditorHydrated({ hydrated: true })
      } catch (err) {
        if (cancelled) return
        console.error('useDraftPersistence: failed to load editor state', err)
        loadedForKeyRef.current = key
        setEditorHydrated({
          hydrated: true,
          error: 'Failed to load comic. Try refreshing the page.',
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    authLoading,
    user,
    comicSlugFromUrl,
    setFrames,
    setComicTitle,
    restoreDraftMeta,
    loadPublishedComic,
    setEditorHydrated,
  ])

  useEffect(() => {
    if (!loadedForKeyRef.current) return
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
