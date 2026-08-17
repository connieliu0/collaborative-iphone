import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ComicFlowHeader } from '../components/ComicFlowHeader'
import { prepareImage, getImagesFromClipboard } from '../lib/prepareImage'
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
import type { ComicFrame } from '../stores/useComicStore'
import { useComicStore } from '../stores/useComicStore'

const MAX_FRAMES = 12

const captionFontStyle: React.CSSProperties = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontWeight: 'bold',
}

const textOverlayShadow =
  '-1px -1px 0 rgba(0, 0, 0, 0.85), -1px 0 0 rgba(0, 0, 0, 0.85), -1px 1px 0 rgba(0, 0, 0, 0.85), ' +
  '0 -1px 0 rgba(0, 0, 0, 0.85), 0 1px 0 rgba(0, 0, 0, 0.85), ' +
  '1px -1px 0 rgba(0, 0, 0, 0.85), 1px 0 0 rgba(0, 0, 0, 0.85), 1px 1px 0 rgba(0, 0, 0, 0.85)'

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
    </svg>
  )
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function LinkInputModal({
  frameId,
  initialUrl,
  onClose,
  onSave,
}: {
  frameId: string
  initialUrl?: string
  onClose: () => void
  onSave: (frameId: string, url: string) => void
}) {
  const [url, setUrl] = useState(initialUrl || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (url.trim()) {
      onSave(frameId, url.trim())
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">Add Website Link</h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

type CreateView = 'grid' | 'list' | 'feed'

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
  onFocus,
  onBlur,
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
  onFocus?: (id: string) => void
  onBlur?: () => void
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

  useEffect(() => {
    if (isEditingCaption) {
      onFocus?.(frame.id)
    }
  }, [isEditingCaption, frame.id, onFocus])

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
        {frame.websiteUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <img
              src={`https://www.google.com/s2/favicons?domain=${new URL(frame.websiteUrl).hostname}&sz=128`}
              alt=""
              className="w-16 h-16 object-contain pointer-events-none"
              draggable={false}
            />
          </div>
        ) : frame.imageUrl ? (
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
        {/* Top right action buttons */}
        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {(frame.imageUrl || frame.websiteUrl) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onUpload(frame.id)
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label={`Reupload photo for frame ${index + 1}`}
            >
              <UploadIcon className="w-5 h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(frame.id)
            }}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-white hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-white/50"
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

        {/* Bottom caption strip for inline editing */}
        <div
          className={`absolute inset-x-0 bottom-0 min-h-[2.5rem] max-w-[500px] text-white px-1.5 py-1 text-[11px] leading-snug cursor-text transition-colors ${
            frame.websiteUrl ? 'bg-black' : 'bg-black/70 group-hover:bg-black/80'
          }`}
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
                        onBlur?.()
                      }}
              rows={1}
              className="block w-full h-full min-h-[1.5rem] bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none text-[11px] leading-snug text-white placeholder-gray-300"
              style={captionFontStyle}
              placeholder="Add a caption..."
            />
          ) : (
            <span
              className={`select-none ${frame.caption.trim() ? '' : 'text-gray-300'}`}
              style={captionFontStyle}
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
  onUpload,
  onAddLink,
  onEnterFrame,
  nextFrameId,
  focusCaptionFrameId,
  onFocusCaptionConsumed,
  showInsertionBefore,
  onCaptionChange,
  onFocus,
  onBlur,
}: {
  frame: ComicFrame
  index: number
  onRemove: (id: string) => void
  onUpload: (id: string) => void
  onAddLink: (id: string) => void
  onEnterFrame: (frame: ComicFrame, nextFrameId?: string) => void
  nextFrameId?: string
  focusCaptionFrameId?: string | null
  onFocusCaptionConsumed: () => void
  showInsertionBefore?: boolean
  onCaptionChange: (id: string, caption: string) => void
  onFocus?: (id: string) => void
  onBlur?: () => void
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

  useEffect(() => {
    if (isEditingCaption) {
      onFocus?.(frame.id)
    }
  }, [isEditingCaption, frame.id, onFocus])

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
        className={`group flex flex-row items-stretch gap-0 w-full rounded-lg border border-border bg-surface overflow-hidden cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${isDragging ? 'opacity-80 z-10' : ''}`}
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
          className="group/thumb shrink-0 w-14 min-h-14 self-stretch rounded-l-lg overflow-hidden border-r border-border focus:outline-none focus:ring-2 focus:ring-muted focus:ring-inset relative"
          onClick={(e) => {
            e.stopPropagation()
            onUpload(frame.id)
          }}
          aria-label={frame.imageUrl || frame.websiteUrl ? `Reupload photo for frame ${index + 1}` : `Upload photo for empty frame ${index + 1}`}
        >
          {frame.websiteUrl ? (
            <>
              <div className="h-full w-full min-h-14 bg-white flex items-center justify-center">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${new URL(frame.websiteUrl).hostname}&sz=128`}
                  alt=""
                  className="w-8 h-8 object-contain pointer-events-none"
                  draggable={false}
                />
              </div>
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <UploadIcon className="w-5 h-5 text-white" />
              </div>
            </>
          ) : frame.imageUrl ? (
            <>
              <img
                src={frame.imageUrl}
                alt=""
                className="h-full w-full min-h-14 object-cover pointer-events-none"
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <UploadIcon className="w-5 h-5 text-white" />
              </div>
            </>
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
                onBlur={() => {
                  setIsEditingCaption(false)
                  onBlur?.()
                }}
              onClick={(e) => e.stopPropagation()}
              rows={1}
              className="block w-full min-h-[1.25rem] p-0 m-0 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none text-sm leading-snug text-gray-900 placeholder:text-gray-500 placeholder:opacity-100"
              style={{
                ...captionFontStyle,
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
                ...captionFontStyle,
                lineHeight: 1.375,
              }}
            >
              {displayText}
            </span>
          )}
        </div>
        <div className="shrink-0 self-center flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onAddLink(frame.id)
            }}
            className="p-2 text-gray-400 hover:text-green-500 focus:outline-none"
            aria-label={`Add website link for frame ${index + 1}`}
          >
            <LinkIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove(frame.id)
            }}
            className="p-2 text-gray-400 hover:text-red-500 focus:outline-none"
            aria-label={`Remove frame ${index + 1}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function FeedCaptionEditor({
  frame,
  onClose,
  onCaptionChange,
}: {
  frame: ComicFrame
  onClose: () => void
  onCaptionChange: (id: string, caption: string) => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    const len = input.value.length
    input.setSelectionRange(len, len)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onClick={onClose}
    >
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-full bg-white text-black font-medium text-sm hover:bg-gray-200 transition-colors"
        >
          Done
        </button>
      </div>

      <div
        className="flex-1 flex items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {frame.imageUrl ? (
          <div className="relative w-full max-w-md">
            <img
              src={frame.imageUrl}
              alt=""
              className="w-full h-auto object-contain rounded-lg"
            />
            {/* Inline editable text overlay - centered on image */}
            <div
              className="absolute inset-x-4 bottom-4 flex items-center justify-center"
            >
              <textarea
                ref={inputRef}
                value={frame.caption}
                onChange={(e) => onCaptionChange(frame.id, e.target.value)}
                placeholder="Add a caption..."
                rows={2}
                className="w-full bg-transparent border-0 outline-none focus:outline-none focus:ring-0 placeholder-white/50 resize-none text-center"
                style={{
                  ...captionFontStyle,
                  fontSize: `${frame.fontSize}px`,
                  color: frame.fontColor,
                  textShadow: textOverlayShadow,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm aspect-[3/4] bg-gray-800 rounded-lg flex items-center justify-center">
            <span className="text-gray-500">No photo</span>
          </div>
        )}
      </div>
    </div>
  )
}

function FeedView({
  frames,
  currentIndex,
  onCurrentIndexChange,
  onFrameTap,
}: {
  frames: ComicFrame[]
  currentIndex: number
  onCurrentIndexChange: (index: number) => void
  onFrameTap: (frame: ComicFrame) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = frameRefs.current.findIndex((el) => el === entry.target)
            if (index !== -1) {
              onCurrentIndexChange(index)
            }
          }
        })
      },
      {
        root: container,
        threshold: 0.5,
      }
    )

    frameRefs.current.forEach((el) => {
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [frames.length, onCurrentIndexChange])

  const scrollToIndex = (index: number) => {
    const el = frameRefs.current[index]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    }
  }

  return (
    <div className="relative h-[calc(100vh-180px)] min-h-[400px]">
      {/* Main photo area - horizontal scroll */}
      <div
        ref={containerRef}
        className="absolute inset-0 bottom-20 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex h-full">
          {frames.map((frame, index) => (
            <div
              key={frame.id}
              ref={(el) => { frameRefs.current[index] = el }}
              className="w-full h-full snap-center shrink-0 relative cursor-pointer flex items-center justify-center"
              onClick={() => onFrameTap(frame)}
            >
              {frame.imageUrl ? (
                <img
                  src={frame.imageUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="w-full h-full bg-[#DDDDDD] flex items-center justify-center">
                  <span className="text-gray-500">+ add photo</span>
                </div>
              )}
              {(frame.caption || frame.overlayText) && (
                <div
                  className="absolute bottom-4 left-4 right-4 leading-snug text-center"
                  style={{
                    ...captionFontStyle,
                    fontSize: `${frame.fontSize}px`,
                    color: frame.fontColor,
                    textShadow: textOverlayShadow,
                  }}
                >
                  {frame.caption || frame.overlayText}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom filmstrip - fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-16 flex gap-1.5 px-2 py-2 overflow-x-auto scrollbar-hide bg-white/80 backdrop-blur-sm">
        {frames.map((frame, index) => (
          <button
            key={frame.id}
            type="button"
            onClick={() => scrollToIndex(index)}
            className={`h-full aspect-[3/4] rounded overflow-hidden transition-all shrink-0 ${
              index === currentIndex
                ? 'ring-2 ring-gray-900 ring-offset-1'
                : 'opacity-50 hover:opacity-100'
            }`}
            aria-label={`Go to frame ${index + 1}`}
          >
            {frame.imageUrl ? (
              <img
                src={frame.imageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#DDDDDD]" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

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
  const [searchParams, setSearchParams] = useSearchParams()
  const [hydrated, setHydrated] = useState(false)
  const [limitMessageShown, setLimitMessageShown] = useState(false)
  const initialView = searchParams.get('view')
  const [view, setView] = useState<CreateView>(
    initialView === 'list' || initialView === 'feed' || initialView === 'grid'
      ? initialView
      : 'grid'
  )
  const [processingFiles, setProcessingFiles] = useState(false)
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const [focusCaptionFrameId, setFocusCaptionFrameId] = useState<string | null>(null)
  const [focusedFrameId, setFocusedFrameId] = useState<string | null>(null)
  const [feedCurrentIndex, setFeedCurrentIndex] = useState(0)
  const [editingFeedFrame, setEditingFeedFrame] = useState<ComicFrame | null>(null)
  const [linkModalFrameId, setLinkModalFrameId] = useState<string | null>(null)
  const focusHandledRef = useRef(false)

  const { frames, addFrames, addEmptyFrame, removeFrame, reorderFrames, updateFrame } = useComicStore()
  const hasFrames = frames.length > 0

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Handle ?view=list&focus=first from "Describe a feeling" homepage entry
  useEffect(() => {
    if (!hydrated || focusHandledRef.current) return
    const focus = searchParams.get('focus')
    if (focus !== 'first') return

    focusHandledRef.current = true
    const existingFirstId = useComicStore.getState().frames[0]?.id
    if (existingFirstId) {
      setFocusCaptionFrameId(existingFirstId)
    } else {
      const id = addEmptyFrame()
      if (id) setFocusCaptionFrameId(id)
    }

    // Clear consumed params so refresh doesn't re-trigger
    const next = new URLSearchParams(searchParams)
    next.delete('focus')
    setSearchParams(next, { replace: true })
  }, [hydrated, searchParams, setSearchParams, addEmptyFrame])

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
      const converted = await Promise.all(toProcess.map((f) => prepareImage(f)))
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

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const images = getImagesFromClipboard(e.clipboardData)
      if (images.length === 0) return

      e.preventDefault()
      setProcessingFiles(true)
      try {
        const remaining = MAX_FRAMES - frames.length
        const toProcess = images.slice(0, focusedFrameId ? 1 : remaining)
        const converted = await Promise.all(toProcess.map((f) => prepareImage(f)))

        if (focusedFrameId && converted[0]) {
          const file = converted[0]
          updateFrame(focusedFrameId, {
            imageFile: file,
            imageUrl: URL.createObjectURL(file),
          })
        } else {
          addFrames(converted)
          if (images.length > remaining || frames.length + converted.length === MAX_FRAMES) {
            setLimitMessageShown(true)
          }
        }
      } finally {
        setProcessingFiles(false)
      }
    },
    [frames.length, focusedFrameId, updateFrame, addFrames]
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  const handleUploadForFrame = (id: string) => {
    setUploadTargetId(id)
    openFileInput()
  }

  const handleAddLink = (id: string) => {
    setLinkModalFrameId(id)
  }

  const handleSaveLink = (frameId: string, url: string) => {
    updateFrame(frameId, { websiteUrl: url })
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
        hideActions={frames.length === 0}
        previewDisabled={frames.length === 0}
        leadingActions={
          hasFrames ? (
            /* Desktop: Grid / List toggle (mobile uses floating bottom toggle) */
            <div
              className="hidden sm:flex rounded-md border border-border bg-surface p-0.5 shrink-0"
              role="tablist"
              aria-label="View layout"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === 'grid'}
                onClick={() => setView('grid')}
                className={`px-2 py-1 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-1 ${view === 'grid' ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-gray-100'}`}
              >
                Grid
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'list'}
                onClick={() => setView('list')}
                className={`px-2 py-1 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-1 ${view === 'list' ? 'bg-primary text-on-primary' : 'text-foreground hover:bg-gray-100'}`}
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
          {view === 'feed' ? (
            <>
              <FeedView
                frames={frames}
                currentIndex={feedCurrentIndex}
                onCurrentIndexChange={setFeedCurrentIndex}
                onFrameTap={(frame) => {
                  if (frame.imageUrl) {
                    setEditingFeedFrame(frame)
                  } else {
                    handleUploadForFrame(frame.id)
                  }
                }}
              />
              {/* Floating bottom toggle for feed view */}
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 sm:hidden pb-[env(safe-area-inset-bottom)]">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  className="px-4 py-2.5 rounded-full bg-white shadow-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  grid toggle
                </button>
              </div>
              {editingFeedFrame && (
                <FeedCaptionEditor
                  frame={editingFeedFrame}
                  onClose={() => setEditingFeedFrame(null)}
                  onCaptionChange={(id, caption) => {
                    updateFrame(id, { caption, overlayText: caption })
                    const updated = frames.find((f) => f.id === id)
                    if (updated) {
                      setEditingFeedFrame({ ...updated, caption, overlayText: caption })
                    }
                  }}
                />
              )}
            </>
          ) : view === 'grid' ? (
            <>
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
                        onFocus={setFocusedFrameId}
                        onBlur={() => setFocusedFrameId(null)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              {/* Floating bottom toggle for grid view on mobile */}
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 sm:hidden pb-[env(safe-area-inset-bottom)]">
                <button
                  type="button"
                  onClick={() => setView('feed')}
                  className="px-4 py-2.5 rounded-full bg-white shadow-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  feed toggle
                </button>
              </div>
            </>
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
                      onUpload={handleUploadForFrame}
                      onAddLink={handleAddLink}
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
                      onFocus={setFocusedFrameId}
                      onBlur={() => setFocusedFrameId(null)}
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
          </div>
        </>
      )}

      {linkModalFrameId && (
        <LinkInputModal
          frameId={linkModalFrameId}
          initialUrl={frames.find((f) => f.id === linkModalFrameId)?.websiteUrl}
          onClose={() => setLinkModalFrameId(null)}
          onSave={handleSaveLink}
        />
      )}
    </div>
  )
}
