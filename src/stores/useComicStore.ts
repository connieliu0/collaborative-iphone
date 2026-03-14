import { create } from 'zustand'

export type TextMode = 'caption' | 'overlay'

export interface OverlayPosition {
  x: number // percentage 0–100 relative to image width
  y: number // percentage 0–100 relative to image height
}

export interface ComicFrame {
  id: string
  imageFile: File | null
  imageUrl: string
  caption: string
  overlayText: string
  overlayPosition: OverlayPosition
  textMode: TextMode
  fontSize: number
  fontColor: string
}

const MAX_FRAMES = 12

const defaultOverlayPosition: OverlayPosition = { x: 50, y: 50 }

function createFrame(file: File): ComicFrame {
  return {
    id: crypto.randomUUID(),
    imageFile: file,
    imageUrl: URL.createObjectURL(file),
    caption: '',
    overlayText: '',
    overlayPosition: { ...defaultOverlayPosition },
    textMode: 'caption',
    fontSize: 18,
    fontColor: '#ffffff',
  }
}

interface ComicState {
  frames: ComicFrame[]
  addFrames: (files: File[]) => void
  removeFrame: (id: string) => void
  updateFrame: (id: string, patch: Partial<ComicFrame>) => void
  reorderFrames: (newOrder: ComicFrame[]) => void
  clearComic: () => void
}

export const useComicStore = create<ComicState>((set) => ({
  frames: [],

  addFrames: (files: File[]) => {
    set((state) => {
      const remaining = MAX_FRAMES - state.frames.length
      if (remaining <= 0) return state
      const toAdd = files.slice(0, remaining)
      const newFrames = toAdd.map(createFrame)
      return { frames: [...state.frames, ...newFrames] }
    })
  },

  removeFrame: (id: string) => {
    set((state) => {
      const frame = state.frames.find((f) => f.id === id)
      if (frame?.imageUrl) {
        URL.revokeObjectURL(frame.imageUrl) // release object URL to avoid memory leaks
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
        if (f.imageUrl) URL.revokeObjectURL(f.imageUrl) // release every frame's object URL
      })
      return { frames: [] }
    })
  },
}))
