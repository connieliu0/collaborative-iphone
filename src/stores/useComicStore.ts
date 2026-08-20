import { create } from 'zustand'
import {
  clearPublishedMetaFromSession,
  writePublishedMetaToSession,
} from '../lib/comicEditor'
import {
  DEFAULT_COMIC_FONT_COLOR,
  DEFAULT_COMIC_FONT_SIZE,
  DEFAULT_OVERLAY_Y,
  normalizeLegacyComicCaptionStyle,
  normalizeLegacyOverlayY,
} from '../lib/comicCaptionStyle'

export type TextMode = 'caption' | 'overlay'

export interface OverlayPosition {
  x: number // percentage 0–100 relative to image width
  y: number // percentage 0–100 relative to image height
}

export type FontFamilyId = 'Arial' | 'Arial Narrow' | 'News Cycle'

export interface ComicFrame {
  id: string
  imageFile: File | null
  imageUrl: string
  websiteUrl?: string
  caption: string
  overlayPosition: OverlayPosition
  textMode: TextMode
  fontSize: number
  fontColor: string
  fontFamily: FontFamilyId
}

export const MAX_FRAMES = 100

const defaultOverlayPosition: OverlayPosition = { x: 50, y: DEFAULT_OVERLAY_Y }

function createFrame(file: File, fontFamily: FontFamilyId): ComicFrame {
  return {
    id: crypto.randomUUID(),
    imageFile: file,
    imageUrl: URL.createObjectURL(file),
    websiteUrl: undefined,
    caption: '',
    overlayPosition: { ...defaultOverlayPosition },
    textMode: 'caption',
    fontSize: DEFAULT_COMIC_FONT_SIZE,
    fontColor: DEFAULT_COMIC_FONT_COLOR,
    fontFamily,
  }
}

export function createEmptyFrame(fontFamily: FontFamilyId = 'Arial'): ComicFrame {
  return {
    id: crypto.randomUUID(),
    imageFile: null,
    imageUrl: '',
    websiteUrl: undefined,
    caption: '',
    overlayPosition: { ...defaultOverlayPosition },
    textMode: 'caption',
    fontSize: DEFAULT_COMIC_FONT_SIZE,
    fontColor: DEFAULT_COMIC_FONT_COLOR,
    fontFamily,
  }
}

export interface LoadedFrame {
  id: string
  image_url: string
  website_url?: string | null
  caption: string
  overlay_x: number
  overlay_y: number
  font_size: number
  font_color: string
  font_family?: string
}

interface ComicState {
  frames: ComicFrame[]
  comicTitle: string
  setComicTitle: (title: string) => void
  addFrames: (files: File[]) => void
  addEmptyFrame: () => string | null
  setFrames: (frames: ComicFrame[]) => void
  removeFrame: (id: string) => void
  updateFrame: (id: string, patch: Partial<ComicFrame>) => void
  reorderFrames: (newOrder: ComicFrame[]) => void
  clearComic: () => void
  publishedSlug: string | null
  publishedComicId: string | null
  setPublishedComic: (args: { slug: string; comicId: string }) => void
  /** Update frame URLs to remote URLs after publishing (avoids re-upload on republish) */
  updateFrameUrls: (uploadedUrls: string[]) => void
  loadPublishedComic: (comicId: string, slug: string, title: string, frames: LoadedFrame[]) => void
  restoreDraftMeta: (args: { publishedSlug?: string | null; publishedComicId?: string | null }) => void
  editorHydrated: boolean
  editorHydrateError: string | null
  setEditorHydrated: (args: { hydrated: boolean; error?: string | null }) => void
  isReadOnly: boolean
  setReadOnly: (readOnly: boolean) => void
}

export const useComicStore = create<ComicState>((set) => ({
  frames: [],
  comicTitle: 'Comic Title',
  publishedSlug: null,
  publishedComicId: null,
  editorHydrated: false,
  editorHydrateError: null,
  isReadOnly: false,

  setComicTitle: (title: string) => {
    set({ comicTitle: title })
  },

  addFrames: (files: File[]) => {
    set((state) => {
      const remaining = MAX_FRAMES - state.frames.length
      if (remaining <= 0) return state
      // Inherit the currently selected font so new uploads keep the user's choice.
      const currentFontFamily: FontFamilyId = state.frames[0]?.fontFamily ?? 'Arial'
      const toAdd = files.slice(0, remaining)
      const newFrames = toAdd.map((file) => createFrame(file, currentFontFamily))
      return { frames: [...state.frames, ...newFrames] }
    })
  },

  addEmptyFrame: () => {
    let createdId: string | null = null
    set((state) => {
      if (state.frames.length >= MAX_FRAMES) return state
      const currentFontFamily: FontFamilyId = state.frames[0]?.fontFamily ?? 'Arial'
      const frame = createEmptyFrame(currentFontFamily)
      createdId = frame.id
      return { frames: [...state.frames, frame] }
    })
    return createdId
  },

  setFrames: (frames: ComicFrame[]) => {
    set({ frames })
  },

  removeFrame: (id: string) => {
    set((state) => {
      const frame = state.frames.find((f) => f.id === id)
      if (frame?.imageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(frame.imageUrl)
      }
      return { frames: state.frames.filter((f) => f.id !== id) }
    })
  },

  updateFrame: (id: string, patch: Partial<ComicFrame>) => {
    set((state) => ({
      frames: state.frames.map((f) =>
        f.id === id ? { ...f, ...patch } : f
      ),
    }))
  },

  reorderFrames: (newOrder: ComicFrame[]) => {
    set({ frames: newOrder })
  },

  clearComic: () => {
    set((state) => {
      state.frames.forEach((f) => {
        if (f.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(f.imageUrl)
      })
      clearPublishedMetaFromSession()
      return {
        frames: [],
        comicTitle: 'Comic Title',
        publishedSlug: null,
        publishedComicId: null,
      }
    })
  },

  setPublishedComic: ({ slug, comicId }) => {
    writePublishedMetaToSession(comicId, slug)
    set({
      publishedSlug: slug,
      publishedComicId: comicId,
    })
  },

  updateFrameUrls: (uploadedUrls) => {
    set((state) => {
      // Count frames that have content (image, website URL, or caption)
      const framesWithContent = state.frames.filter((f) => f.imageUrl || f.websiteUrl || f.caption.trim())
      if (framesWithContent.length !== uploadedUrls.length) {
        console.warn('updateFrameUrls: frame count mismatch', {
          framesWithContent: framesWithContent.length,
          uploadedUrls: uploadedUrls.length,
        })
        // Still try to update what we can rather than bailing entirely
      }
      let urlIndex = 0
      const updatedFrames = state.frames.map((frame) => {
        // Skip empty frames (no image, no website URL, no caption)
        if (!frame.imageUrl && !frame.websiteUrl && !frame.caption.trim()) return frame
        // Safety check: don't go past uploadedUrls array
        if (urlIndex >= uploadedUrls.length) return frame
        const oldUrl = frame.imageUrl
        const newUrl = uploadedUrls[urlIndex++]
        if (oldUrl && oldUrl.startsWith('blob:')) {
          URL.revokeObjectURL(oldUrl)
        }
        // For frames without images (website-only or text-only), newUrl is empty string
        // For frames with images, update to the remote URL
        return {
          ...frame,
          imageFile: null,
          imageUrl: newUrl || '',
        }
      })
      return { frames: updatedFrames }
    })
  },

  restoreDraftMeta: ({ publishedSlug, publishedComicId }) => {
    set({
      publishedSlug: publishedSlug ?? null,
      publishedComicId: publishedComicId ?? null,
    })
  },

  setEditorHydrated: ({ hydrated, error = null }) => {
    set({
      editorHydrated: hydrated,
      editorHydrateError: error,
    })
  },

  setReadOnly: (readOnly: boolean) => {
    set({ isReadOnly: readOnly })
  },

  loadPublishedComic: (comicId, slug, title, dbFrames) => {
    set((state) => {
      // Revoke any existing blob URLs
      state.frames.forEach((f) => {
        if (f.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(f.imageUrl)
      })

      // Convert DB frames to local frames (imageFile will be null since we're loading from URLs)
      const frames: ComicFrame[] = dbFrames.map((f) => {
        const { fontSize, fontColor } = normalizeLegacyComicCaptionStyle(f.font_size, f.font_color)
        return {
          id: f.id,
          imageFile: null,
          imageUrl: f.image_url,
          websiteUrl: f.website_url ?? undefined,
          caption: f.caption,
          overlayPosition: { x: f.overlay_x, y: normalizeLegacyOverlayY(f.overlay_y) },
          textMode: 'caption' as TextMode,
          fontSize,
          fontColor,
          fontFamily: (f.font_family as FontFamilyId) || 'Arial',
        }
      })

      return {
        frames,
        comicTitle: title,
        publishedSlug: slug,
        publishedComicId: comicId,
      }
    })
    writePublishedMetaToSession(comicId, slug)
  },
}))
