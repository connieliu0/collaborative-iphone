import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useAuth } from '../hooks/useAuth'
import { publishComic, type PublishOptions } from '../lib/publish'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ComicFrame } from '../stores/useComicStore'
import { useComicStore } from '../stores/useComicStore'

const MAX_FRAMES = 12

type CreateView = 'grid' | 'filmstrip'

function SortableGridItem({
  frame,
  index,
  onRemove,
  onNavigate,
}: {
  frame: ComicFrame
  index: number
  onRemove: (id: string) => void
  onNavigate: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: frame.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`aspect-square relative rounded-lg overflow-hidden bg-white/5 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black ${isDragging ? 'opacity-80 z-10' : ''}`}
      onClick={() => onNavigate(frame.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onNavigate(frame.id)
        }
      }}
      aria-label={`Edit frame ${index + 1}`}
      {...attributes}
      {...listeners}
    >
      <img
        src={frame.imageUrl}
        alt=""
        className="w-full h-full object-cover pointer-events-none"
        draggable={false}
      />
      <span
        className="absolute top-2 left-2 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md bg-black/60 text-white text-xs font-medium"
        aria-hidden
      >
        {index + 1}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(frame.id)
        }}
        className="absolute top-2 right-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-red-600/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
        aria-label={`Remove frame ${index + 1}`}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}

function SortableFilmstripThumb({
  frame,
  index,
  isSelected,
  onSelect,
}: {
  frame: ComicFrame
  index: number
  isSelected: boolean
  onSelect: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: frame.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  }

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      className={`shrink-0 w-[80px] h-[80px] rounded-lg overflow-hidden bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''} ${isDragging ? 'opacity-80 z-10' : ''}`}
      onClick={(e) => {
        e.preventDefault()
        onSelect(frame.id)
      }}
      aria-label={`Frame ${index + 1}${isSelected ? ', selected' : ''}`}
      {...attributes}
      {...listeners}
    >
      <img
        src={frame.imageUrl}
        alt=""
        className="w-full h-full object-cover pointer-events-none"
        draggable={false}
      />
    </button>
  )
}

function FilmstripPreview({
  frame,
  frameNumber,
  totalFrames,
  onNavigateToEdit,
}: {
  frame: ComicFrame
  frameNumber: number
  totalFrames: number
  onNavigateToEdit: (id: string) => void
}) {
  return (
    <section
      className="shrink-0 w-full min-h-[200px] max-h-[60vh] relative bg-black/40 rounded-lg overflow-hidden"
      aria-label="Frame preview"
    >
      <div className="w-full h-full flex flex-col min-h-[200px]">
        <button
          type="button"
          className="relative w-full flex-1 min-h-0 overflow-hidden block text-left focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-inset"
          onClick={() => onNavigateToEdit(frame.id)}
          aria-label={`Edit frame ${frameNumber} of ${totalFrames}`}
        >
          <img
            src={frame.imageUrl}
            alt=""
            className="w-full h-full object-cover block"
            draggable={false}
          />
          {frame.overlayText.trim() ? (
            <div
              role="img"
              aria-label="Overlay text"
              className="absolute select-none pointer-events-none border-2 border-white/50 rounded-lg p-2 min-w-[60px] min-h-[32px] flex items-center justify-center shadow-lg bg-black/30"
              style={{
                left: `${frame.overlayPosition.x}%`,
                top: `${frame.overlayPosition.y}%`,
                transform: 'translate(-50%, -50%)',
                fontSize: `${frame.fontSize}px`,
                color: frame.fontColor,
                fontWeight: 'bold',
                textShadow:
                  '0 1px 2px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6), 1px 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              <span className="whitespace-pre-wrap break-words text-center">
                {frame.overlayText}
              </span>
            </div>
          ) : null}
        </button>
        {frame.caption.trim() ? (
          <div
            className="w-full bg-black/60 text-white px-3 py-2 shrink-0"
            style={{ fontSize: `${frame.fontSize}px` }}
          >
            {frame.caption}
          </div>
        ) : null}
      </div>
    </section>
  )
}

const PUBLISH_AUTH_MESSAGE = 'Create a free account to publish your comic'

function CreatePageSkeleton() {
  return (
    <div className="w-full max-w-xl mx-auto animate-pulse">
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="w-full max-w-sm min-h-[200px] rounded-2xl bg-white/10" />
        <div className="h-4 w-32 bg-white/10 rounded mt-4" />
        <div className="h-3 w-48 bg-white/10 rounded mt-2" />
      </div>
    </div>
  )
}

export function CreatePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [hydrated, setHydrated] = useState(false)
  const [limitMessageShown, setLimitMessageShown] = useState(false)
  const [view, setView] = useState<CreateView>('grid')
  const [filmstripSelectedId, setFilmstripSelectedId] = useState<string | null>(
    null
  )
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishMode, setPublishMode] = useState<'solo' | 'collab'>('solo')
  const [maxFramesInput, setMaxFramesInput] = useState<string>('')

  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const { frames, addFrames, removeFrame, reorderFrames } = useComicStore()
  const hasFrames = frames.length > 0

  useEffect(() => {
    setHydrated(true)
  }, [])
  const canAddMore = frames.length < MAX_FRAMES

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  const frameIds = useMemo(() => frames.map((f) => f.id), [frames])
  const filmstripFrame =
    frames.find((f) => f.id === filmstripSelectedId) ?? frames[0] ?? null

  useEffect(() => {
    if (
      hasFrames &&
      filmstripSelectedId != null &&
      !frames.some((f) => f.id === filmstripSelectedId)
    ) {
      setFilmstripSelectedId(frames[0]?.id ?? null)
    }
  }, [hasFrames, filmstripSelectedId, frames])

  useEffect(() => {
    if (view === 'filmstrip' && filmstripSelectedId === null && frames[0]) {
      setFilmstripSelectedId(frames[0].id)
    }
  }, [view, filmstripSelectedId, frames])

  const handleSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const fileList = Array.from(files)
    const remaining = MAX_FRAMES - frames.length
    const toAdd = fileList.slice(0, remaining)
    addFrames(toAdd)
    if (fileList.length > remaining || frames.length + toAdd.length === MAX_FRAMES) {
      setLimitMessageShown(true)
    }
    e.target.value = ''
  }

  const openFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleGridDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over == null || active.id === over.id) return
    const oldIndex = frames.findIndex((f) => f.id === active.id)
    const newIndex = frames.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(frames, oldIndex, newIndex)
    reorderFrames(newOrder)
  }

  const handleFilmstripDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over == null || active.id === over.id) return
    const oldIndex = frames.findIndex((f) => f.id === active.id)
    const newIndex = frames.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(frames, oldIndex, newIndex)
    reorderFrames(newOrder)
  }

  const handleNavigateToEdit = (id: string) => {
    navigate(`/edit?frame=${id}`)
  }

  const handlePublish = async () => {
    if (!user) {
      openAuthModal(PUBLISH_AUTH_MESSAGE)
      return
    }
    setPublishError(null)
    setPublishing(true)
    const opts: PublishOptions = {
      mode: publishMode,
      maxFrames: publishMode === 'collab' && maxFramesInput.trim() !== ''
        ? Math.min(24, Math.max(1, parseInt(maxFramesInput, 10) || 3))
        : undefined,
    }
    const result = await publishComic(user.id, frames, opts)
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    navigate(`/publish?slug=${result.slug}`)
  }

  if (!hydrated) {
    return <CreatePageSkeleton />
  }

  return (
    <div className="w-full max-w-xl mx-auto overflow-x-hidden min-w-0">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        max={MAX_FRAMES}
        onChange={handleSelectFiles}
        className="hidden"
        aria-label="Select photos for comic"
      />

      {!hasFrames ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh]">
          <button
            type="button"
            onClick={openFileInput}
            className="flex flex-col items-center justify-center w-full max-w-sm min-h-[200px] rounded-2xl border-2 border-dashed border-white/30 hover:border-white/50 transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-black"
          >
            <svg
              className="w-12 h-12 text-white/50 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-white/90 font-medium mb-1">
              Add photos to your comic
            </span>
            <span className="text-sm text-white/60 mb-4">
              Select up to {MAX_FRAMES} images
            </span>
            <span
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors"
              role="button"
            >
              Select Photos
            </span>
          </button>
        </div>
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex rounded-lg bg-white/5 p-1 gap-1 mb-4">
            <button
              type="button"
              onClick={() => setView('grid')}
              className={`flex-1 min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                view === 'grid'
                  ? 'bg-white text-black'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => {
                setView('filmstrip')
                if (filmstripSelectedId === null && frames[0]) {
                  setFilmstripSelectedId(frames[0].id)
                }
              }}
              className={`flex-1 min-h-[44px] rounded-md text-sm font-medium transition-colors ${
                view === 'filmstrip'
                  ? 'bg-white text-black'
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              Filmstrip
            </button>
          </div>

          {view === 'grid' ? (
            <DndContext sensors={sensors} onDragEnd={handleGridDragEnd}>
              <SortableContext
                items={frameIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {frames.map((frame, index) => (
                    <SortableGridItem
                      key={frame.id}
                      frame={frame}
                      index={index}
                      onRemove={removeFrame}
                      onNavigate={handleNavigateToEdit}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className="flex flex-col gap-4">
              {filmstripFrame ? (
                <FilmstripPreview
                  frame={filmstripFrame}
                  frameNumber={
                    frames.findIndex((f) => f.id === filmstripFrame.id) + 1
                  }
                  totalFrames={frames.length}
                  onNavigateToEdit={handleNavigateToEdit}
                />
              ) : null}
              <DndContext
                sensors={sensors}
                onDragEnd={handleFilmstripDragEnd}
              >
                <SortableContext
                  items={frameIds}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] h-[80px] items-center min-w-0">
                    {frames.map((frame, index) => (
                      <SortableFilmstripThumb
                        key={frame.id}
                        frame={frame}
                        index={index}
                        isSelected={filmstripFrame?.id === frame.id}
                        onSelect={setFilmstripSelectedId}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/70">Publish as:</span>
              <div className="flex rounded-lg bg-white/5 p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setPublishMode('solo')}
                  className={`min-h-[36px] px-3 rounded-md text-sm font-medium transition-colors ${
                    publishMode === 'solo' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  Solo
                </button>
                <button
                  type="button"
                  onClick={() => setPublishMode('collab')}
                  className={`min-h-[36px] px-3 rounded-md text-sm font-medium transition-colors ${
                    publishMode === 'collab' ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  Collab
                </button>
              </div>
              {publishMode === 'collab' && (
                <label className="flex items-center gap-2 text-sm text-white/70">
                  Max frames
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={maxFramesInput}
                    onChange={(e) => setMaxFramesInput(e.target.value)}
                    placeholder="24"
                    className="w-14 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm"
                  />
                </label>
              )}
            </div>
            {canAddMore && (
              <button
                type="button"
                onClick={openFileInput}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/30 text-white font-medium text-sm hover:bg-white/10 transition-colors"
              >
                <span aria-hidden>+</span>
                Add More
              </button>
            )}
            <p className="text-sm text-white/70">
              {frames.length} / {MAX_FRAMES} frames
            </p>
            {limitMessageShown && frames.length === MAX_FRAMES && (
              <p className="text-sm text-amber-400/90" role="status">
                Maximum 12 frames reached
              </p>
            )}
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || frames.length === 0}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
            {publishError && (
              <p className="text-sm text-red-400" role="alert">
                {publishError}
              </p>
            )}
            <Link
              to={frames.length > 0 ? `/edit?frame=${frames[0].id}` : '/edit'}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-white/30 text-white font-medium text-sm hover:border-white/50 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              aria-disabled={frames.length === 0}
            >
              Next: Edit Frames →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
