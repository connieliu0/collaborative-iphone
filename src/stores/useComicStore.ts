import { create } from 'zustand'
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

const MAX_FRAMES = 12

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
  loadPublishedComic: (comicId: string, slug: string, title: string, frames: LoadedFrame[]) => void
  restoreDraftMeta: (args: { publishedSlug?: string | null; publishedComicId?: string | null }) => void
  editorHydrated: boolean
  editorHydrateError: string | null
  setEditorHydrated: (args: { hydrated: boolean; error?: string | null }) => void
}

export const useComicStore = create<ComicState>((set) => ({
  frames: [],
  comicTitle: 'Comic Title',
  publishedSlug: null,
  publishedComicId: null,
  editorHydrated: false,
  editorHydrateError: null,

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
      return {
        frames: [],
        comicTitle: 'Comic Title',
        publishedSlug: null,
        publishedComicId: null,
      }
    })
  },

  setPublishedComic: ({ slug, comicId }) => {
    set({
      publishedSlug: slug,
      publishedComicId: comicId,
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
          websiteUrl: undefined,
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
  },
}))
