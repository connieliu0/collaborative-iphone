import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthModal } from '../contexts/AuthModalContext'
import { useAuth } from '../hooks/useAuth'
import { ComicFlowHeader } from '../components/ComicFlowHeader'
import { PublishSuccessModal } from '../components/PublishSuccessModal'
import { ensureJpeg } from '../lib/heic'
import { publishComic, updateComic } from '../lib/publish'
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ComicFrame, FontFamilyId } from '../stores/useComicStore'
import { useComicStore } from '../stores/useComicStore'

const MAX_FRAMES = 12

const FONT_FAMILY_OPTIONS: { id: FontFamilyId; label: string; fontFamily: string }[] = [
  { id: 'Arial', label: 'Arial', fontFamily: 'Arial, sans-serif' },
  { id: 'Arial Narrow', label: 'Arial Narrow', fontFamily: '"Arial Narrow", Arial, sans-serif' },
  { id: 'News Cycle', label: 'News Cycle', fontFamily: '"News Cycle", sans-serif' },
]

type CreateView = 'grid' | 'list'

function SortableGridItem({
  frame,
  index,
  onRemove,
  onNavigate,
  onUpload,
  onEnterFrame,
  nextFrameId,
  focusCaptionFrameId,
  onFocusCaptionConsumed,
  showInsertionBefore,
  onCaptionChange,
}: {
  frame: ComicFrame
  index: number
  onRemove: (id: string) => void
  onNavigate: (id: string) => void
  onUpload: (id: string) => void
  onEnterFrame: (frame: ComicFrame, nextFrameId?: string) => void
  nextFrameId?: string
  focusCaptionFrameId?: string | null
  onFocusCaptionConsumed: () => void
  showInsertionBefore?: boolean
  onCaptionChange: (id: string, caption: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: frame.id })
  const { tabIndex: _gridTabIndex, ...gridAttributes } = attributes

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  }

  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const captionInputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (!isEditingCaption) return
    const input = captionInputRef.current
    if (!input) return
    input.focus()
    const len = input.value.length
    input.setSelectionRange(len, len)
  }, [isEditingCaption])

  useEffect(() => {
    if (focusCaptionFrameId === frame.id) {
      setIsEditingCaption(true)
      onFocusCaptionConsumed()
    }
  }, [focusCaptionFrameId, frame.id, onFocusCaptionConsumed])

  const isFirstInRow = index % 3 === 0
  return (
    <div className="relative">
      {showInsertionBefore && (
        <div
          className={`absolute top-0 bottom-0 w-0.5 bg-gray-400 rounded-full z-20 pointer-events-none ${isFirstInRow ? 'left-0' : '-left-2'}`}
          aria-hidden
        />
      )}
      <div
        ref={setNodeRef}
        style={style}
        className={`group aspect-[198/277] relative rounded-lg overflow-hidden bg-[#DDDDDD] border border-border cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${isDragging ? 'opacity-80 z-10' : ''}`}
        onClick={() => (frame.imageUrl ? onNavigate(frame.id) : onUpload(frame.id))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnterFrame(frame, nextFrameId)
          }
        }}
        aria-label={frame.imageUrl ? `Edit frame ${index + 1}` : `Upload photo for empty frame ${index + 1}`}
        {...gridAttributes}
        {...listeners}
      >
        {frame.imageUrl ? (
          <img
            src={frame.imageUrl}
            alt=""
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <span className="text-sm text-gray-500">+ add photo</span>
          </div>
        )}
        {/* Dark gray gradient along top of image, visible only on hover */}
        <div
          className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-gray-800/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
          aria-hidden
        />
        <span
          className="absolute top-2 left-2 z-10 min-w-[28px] min-h-[28px] flex items-center justify-center rounded-md bg-primary text-on-primary text-xs font-medium"
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
          className="absolute top-1 right-1 z-10 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-white/50"
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

        {/* Bottom caption strip for inline editing */}
        <div
          className="absolute inset-x-0 bottom-0 min-h-[2.5rem] max-w-[500px] bg-black/70 text-white px-1.5 py-1 text-[11px] leading-snug cursor-text group-hover:bg-black/80 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            setIsEditingCaption(true)
          }}
        >
          {isEditingCaption ? (
            <textarea
              ref={captionInputRef}
              value={frame.caption}
              onChange={(event) => {
                onCaptionChange(frame.id, event.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  onEnterFrame(frame, nextFrameId)
                }
              }}
              onBlur={() => {
                setIsEditingCaption(false)
              }}
              rows={1}
              className="block w-full h-full min-h-[1.5rem] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none text-[11px] leading-snug text-white placeholder-gray-300"
              style={{
                fontFamily:
                  FONT_FAMILY_OPTIONS.find((f) => f.id === frame.fontFamily)?.fontFamily ??
                  '"News Cycle", sans-serif',
                fontWeight: 900,
              }}
              placeholder="Add a caption..."
            />
          ) : (
            <span
              className={`select-none ${frame.caption.trim() ? '' : 'text-gray-300'}`}
              style={{
                fontFamily:
                  FONT_FAMILY_OPTIONS.find((f) => f.id === frame.fontFamily)?.fontFamily ??
                  '"News Cycle", sans-serif',
                fontWeight: 900,
              }}
            >
              {frame.caption.trim() || 'Add a caption...'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function SortableListItem({
  frame,
  index,
  onRemove,
  onNavigate,
  onUpload,
  onEnterFrame,
  nextFrameId,
  focusCaptionFrameId,
  onFocusCaptionConsumed,
  showInsertionBefore,
  onCaptionChange,
}: {
  frame: ComicFrame
  index: number
  onRemove: (id: string) => void
  onNavigate: (id: string) => void
  onUpload: (id: string) => void
  onEnterFrame: (frame: ComicFrame, nextFrameId?: string) => void
  nextFrameId?: string
  focusCaptionFrameId?: string | null
  onFocusCaptionConsumed: () => void
  showInsertionBefore?: boolean
  onCaptionChange: (id: string, caption: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: frame.id })
  const { tabIndex: _listTabIndex, ...listAttributes } = attributes

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  }

  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const captionInputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (!isEditingCaption) return
    const input = captionInputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }, [isEditingCaption])

  useEffect(() => {
    if (focusCaptionFrameId === frame.id) {
      setIsEditingCaption(true)
      onFocusCaptionConsumed()
    }
  }, [focusCaptionFrameId, frame.id, onFocusCaptionConsumed])

  const baseText = frame.caption.trim() || frame.overlayText.trim()
  const displayText = baseText || 'Add a caption...'

  return (
    <div className="relative">
      {showInsertionBefore && (
        <div
          className="absolute left-0 right-0 top-0 h-0.5 bg-gray-400 rounded-full z-20 pointer-events-none"
          aria-hidden
        />
      )}
      <div
        ref={setNodeRef}
        style={style}
        className={`flex flex-row items-stretch gap-0 w-full rounded-lg border border-border bg-surface overflow-hidden cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${isDragging ? 'opacity-80 z-10' : ''}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnterFrame(frame, nextFrameId)
          }
        }}
        {...listAttributes}
        {...listeners}
      >
        <button
          type="button"
          className="shrink-0 w-14 min-h-14 self-stretch rounded-l-lg overflow-hidden border-r border-border focus:outline-none focus:ring-2 focus:ring-muted focus:ring-inset"
          onClick={(e) => {
            e.stopPropagation()
            frame.imageUrl ? onNavigate(frame.id) : onUpload(frame.id)
          }}
          aria-label={frame.imageUrl ? `Edit frame ${index + 1}` : `Upload photo for empty frame ${index + 1}`}
        >
          {frame.imageUrl ? (
            <img
              src={frame.imageUrl}
              alt=""
              className="h-full w-full min-h-14 object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="h-full min-h-14 w-full flex items-center justify-center bg-gray-100">
              <span className="text-xs text-gray-500">+</span>
            </div>
          )}
        </button>
        <div
          className="flex-1 min-w-0 flex items-center py-3 px-3 text-sm text-gray-900 cursor-text hover:bg-gray-100/80 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            if (!isEditingCaption) {
              setIsEditingCaption(true)
            }
          }}
        >
          {isEditingCaption ? (
            <textarea
              ref={captionInputRef}
              value={frame.caption}
              onChange={(e) => onCaptionChange(frame.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  onEnterFrame(frame, nextFrameId)
                }
              }}
              onBlur={() => setIsEditingCaption(false)}
              onClick={(e) => e.stopPropagation()}
              rows={1}
              className="block w-full min-h-[1.25rem] p-0 m-0 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none text-sm leading-snug text-gray-900 placeholder:text-gray-500 placeholder:opacity-100"
              style={{
                fontFamily:
                  FONT_FAMILY_OPTIONS.find((f) => f.id === frame.fontFamily)?.fontFamily ??
                  '"News Cycle", sans-serif',
                lineHeight: 1.375,
              }}
              placeholder="Add a caption..."
            />
          ) : (
            <span
              className={`block w-full select-none leading-snug ${
                displayText === 'Add a caption...' ? 'text-gray-500' : 'text-gray-900'
              }`}
              style={{
                fontFamily:
                  FONT_FAMILY_OPTIONS.find((f) => f.id === frame.fontFamily)?.fontFamily ??
                  '"News Cycle", sans-serif',
                lineHeight: 1.375,
              }}
            >
              {displayText}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove(frame.id)
          }}
          className="shrink-0 self-center p-2 text-gray-400 hover:text-red-500 focus:outline-none"
          aria-label={`Remove frame ${index + 1}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

const PUBLISH_AUTH_MESSAGE = 'Create a free account to publish your comic'

function CreatePageSkeleton() {
  return (
    <div className="w-full max-w-xl mx-auto animate-pulse">
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="w-full max-w-sm min-h-[200px] rounded-2xl bg-gray-200" />
        <div className="h-4 w-32 bg-gray-200 rounded mt-4" />
        <div className="h-3 w-48 bg-gray-200 rounded mt-2" />
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
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishSuccessSlug, setPublishSuccessSlug] = useState<string | null>(null)
  const [processingFiles, setProcessingFiles] = useState(false)
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const [focusCaptionFrameId, setFocusCaptionFrameId] = useState<string | null>(null)

  const { user } = useAuth()
  const { openAuthModal } = useAuthModal()
  const { frames, addFrames, addEmptyFrame, removeFrame, reorderFrames, updateFrame } = useComicStore()
  const { comicTitle, setComicTitle, publishedComicId, setPublishedComic } = useComicStore()
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

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const fileList = Array.from(files)
    e.target.value = ''
    const remaining = MAX_FRAMES - frames.length
    const toProcess = fileList.slice(0, remaining)
    setProcessingFiles(true)
    try {
      const converted = await Promise.all(toProcess.map((f) => ensureJpeg(f)))
      if (uploadTargetId && converted[0]) {
        const file = converted[0]
        updateFrame(uploadTargetId, {
          imageFile: file,
          imageUrl: URL.createObjectURL(file),
        })
      } else {
        addFrames(converted)
      }
      if (fileList.length > remaining || frames.length + converted.length === MAX_FRAMES) {
        setLimitMessageShown(true)
      }
    } finally {
      setProcessingFiles(false)
      setUploadTargetId(null)
    }
  }

  const openFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleUploadForFrame = (id: string) => {
    setUploadTargetId(id)
    openFileInput()
  }

  const handleEnterOnFrame = (_frame: ComicFrame, nextFrameId?: string) => {
    if (nextFrameId) {
      setFocusCaptionFrameId(nextFrameId)
      return
    }
    const id = addEmptyFrame()
    if (id) setFocusCaptionFrameId(id)
  }

  const handleFocusCaptionConsumed = () => {
    setFocusCaptionFrameId(null)
  }

  const handleGridDragOver = (event: DragOverEvent) => {
    if (event.over == null) {
      setInsertionIndex(null)
      return
    }
    const idx = frameIds.indexOf(event.over.id as string)
    setInsertionIndex(idx !== -1 ? idx : null)
  }

  const handleGridDragEnd = (event: DragEndEvent) => {
    setInsertionIndex(null)
    const { active, over } = event
    if (over == null || active.id === over.id) return
    const oldIndex = frames.findIndex((f) => f.id === active.id)
    const newIndex = frames.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(frames, oldIndex, newIndex)
    reorderFrames(newOrder)
  }

  const handleListDragOver = (event: DragOverEvent) => {
    if (event.over == null) {
      setInsertionIndex(null)
      return
    }
    const idx = frameIds.indexOf(event.over.id as string)
    setInsertionIndex(idx !== -1 ? idx : null)
  }

  const handleListDragEnd = (event: DragEndEvent) => {
    setInsertionIndex(null)
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
    const publishFrames = frames.filter((frame) => frame.imageUrl)
    const result = publishedComicId
      ? await updateComic(publishedComicId, user.id, publishFrames, comicTitle)
      : await publishComic(user.id, publishFrames, { mode: 'solo', title: comicTitle })
    setPublishing(false)
    if ('error' in result) {
      setPublishError(result.error)
      return
    }
    setPublishSuccessSlug(result.slug)
    setPublishedComic({ slug: result.slug, comicId: result.comicId })
  }

  if (!hydrated) {
    return <CreatePageSkeleton />
  }

  return (
    <div className="relative w-full max-w-xl mx-auto overflow-x-hidden min-w-0">
      {processingFiles && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/90 backdrop-blur-sm border border-gray-200"
          aria-live="polite"
          aria-busy="true"
        >
          <div
            className="h-10 w-10 shrink-0 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin"
            aria-hidden
          />
          <p className="text-sm font-medium text-gray-700">Converting images…</p>
        </div>
      )}

      {publishSuccessSlug && (
        <PublishSuccessModal
          slug={publishSuccessSlug}
          onClose={() => setPublishSuccessSlug(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        max={MAX_FRAMES}
        onChange={handleSelectFiles}
        className="hidden"
        aria-label="Select photos for comic"
      />

      <ComicFlowHeader
        variant="create"
        onPublish={handlePublish}
        publishing={publishing}
        title={comicTitle}
        onTitleChange={setComicTitle}
        hideActions={frames.length === 0}
        leftContent={
          hasFrames ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-gray-600 shrink-0">Font</span>
              <div className="relative w-[160px] sm:w-[100px] min-h-[32px]">
                <span
                  className="pointer-events-none absolute inset-0 flex items-center rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 whitespace-nowrap"
                  style={{
                    fontFamily:
                      FONT_FAMILY_OPTIONS.find((f) => f.id === (frames[0]?.fontFamily ?? 'News Cycle'))
                        ?.fontFamily ?? '"News Cycle", sans-serif',
                  }}
                  aria-hidden
                >
                  {FONT_FAMILY_OPTIONS.find((f) => f.id === (frames[0]?.fontFamily ?? 'News Cycle'))
                    ?.label ?? 'News Cycle'}
                </span>
                <select
                  value={frames[0]?.fontFamily ?? 'News Cycle'}
                  onChange={(e) => {
                    const fontFamily = e.target.value as FontFamilyId
                    frames.forEach((frame) => {
                      updateFrame(frame.id, { fontFamily })
                    })
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer rounded border-0 bg-transparent opacity-0"
                  aria-label="Font style"
                >
                  {FONT_FAMILY_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : undefined
        }
        previewDisabled={frames.length === 0}
        publishDisabled={frames.length === 0}
        leadingActions={
          hasFrames ? (
            <div
              className="flex rounded-md border border-border bg-surface p-0.5 shrink-0"
              role="tablist"
              aria-label="View layout"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === 'grid'}
                onClick={() => setView('grid')}
                className={`px-2 py-1 text-xs sm:text-sm rounded sm:rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-1 ${view === 'grid' ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-gray-100'}`}
              >
                Grid
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'list'}
                onClick={() => setView('list')}
                className={`px-2 py-1 text-xs sm:text-sm rounded sm:rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-1 ${view === 'list' ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-gray-100'}`}
              >
                List
              </button>
            </div>
          ) : undefined
        }
      />

      {!hasFrames ? (
        <>
          <button
            type="button"
            onClick={openFileInput}
            className="w-full min-h-[200px] border border-black border-dashed flex items-center justify-center p-[10px] bg-white hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-2"
            aria-label="Upload photos"
          >
            <p className="font-sans text-[16px] leading-normal text-black whitespace-nowrap">
              Upload Photos
            </p>
          </button>
        </>
      ) : (
        <>
          {view === 'grid' ? (
            <DndContext
              sensors={sensors}
              autoScroll={false}
              onDragOver={handleGridDragOver}
              onDragEnd={handleGridDragEnd}
            >
              <SortableContext
                items={frameIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="grid grid-cols-3 gap-4">
                  {frames.map((frame, index) => (
                    <SortableGridItem
                      key={frame.id}
                      frame={frame}
                      index={index}
                      onRemove={removeFrame}
                      onNavigate={handleNavigateToEdit}
                      onUpload={handleUploadForFrame}
                      onEnterFrame={handleEnterOnFrame}
                      nextFrameId={frames[index + 1]?.id}
                      focusCaptionFrameId={focusCaptionFrameId}
                      onFocusCaptionConsumed={handleFocusCaptionConsumed}
                      showInsertionBefore={
                        insertionIndex != null &&
                        insertionIndex === index &&
                        index > 0 &&
                        index < frames.length
                      }
                      onCaptionChange={(id, caption) =>
                        updateFrame(id, { caption, overlayText: caption })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <DndContext
              sensors={sensors}
              autoScroll={false}
              onDragOver={handleListDragOver}
              onDragEnd={handleListDragEnd}
            >
              <SortableContext
                items={frameIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {frames.map((frame, index) => (
                    <SortableListItem
                      key={frame.id}
                      frame={frame}
                      index={index}
                      onRemove={removeFrame}
                      onNavigate={handleNavigateToEdit}
                      onUpload={handleUploadForFrame}
                      onEnterFrame={handleEnterOnFrame}
                      nextFrameId={frames[index + 1]?.id}
                      focusCaptionFrameId={focusCaptionFrameId}
                      onFocusCaptionConsumed={handleFocusCaptionConsumed}
                      showInsertionBefore={
                        insertionIndex != null &&
                        insertionIndex === index &&
                        index > 0
                      }
                      onCaptionChange={(id, caption) =>
                        updateFrame(id, { caption, overlayText: caption })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="mt-6 flex flex-col items-center gap-3">
            {canAddMore && (
              <button
                type="button"
                onClick={openFileInput}
                className="btn-primary"
              >
                + add more
              </button>
            )}
            {limitMessageShown && frames.length === MAX_FRAMES && (
              <p className="text-sm text-amber-600" role="status">
                Maximum 12 frames reached
              </p>
            )}
            {publishError && (
              <p className="text-sm text-red-600" role="alert">
                {publishError}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
