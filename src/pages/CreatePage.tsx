import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ComicFlowHeader } from '../components/ComicFlowHeader'
import { prepareImage, getImagesFromClipboard } from '../lib/prepareImage'
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  COMIC_CAPTION_FONT_FAMILY,
  COMIC_TEXT_STROKE_SHADOW,
} from '../lib/comicCaptionStyle'
import { useAuth } from '../hooks/useAuth'
import { MAX_FRAMES, useComicStore, type ComicFrame } from '../stores/useComicStore'
import { createPagePath, editPagePath } from '../lib/comicEditor'
import { parseWebsiteLinkInput, websiteHostname, iframeSrcForWebsiteUrl, isInstagramEmbed } from '../lib/websiteLink'

const captionFontStyle: React.CSSProperties = {
  fontFamily: COMIC_CAPTION_FONT_FAMILY,
  fontWeight: 'bold',
}

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

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 10 16" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1.25" />
      <circle cx="8" cy="2" r="1.25" />
      <circle cx="2" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="2" cy="14" r="1.25" />
      <circle cx="8" cy="14" r="1.25" />
    </svg>
  )
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  )
}

function FeedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

const mobileBarButtonClass =
  'flex flex-1 items-center justify-center self-stretch text-foreground hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-inset'

function MobileCreateBar({
  viewToggle,
  canAddMore,
  onAdd,
  onUpload,
  canRemove,
  onRemove,
}: {
  viewToggle: { label: string; icon: 'list' | 'feed'; onClick: () => void }
  canAddMore: boolean
  onAdd: () => void
  onUpload: () => void
  canRemove: boolean
  onRemove: () => void
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-20 sm:hidden border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch max-w-xl mx-auto h-14 divide-x divide-gray-200">
        <button
          type="button"
          onClick={viewToggle.onClick}
          className={mobileBarButtonClass}
          aria-label={viewToggle.label}
        >
          {viewToggle.icon === 'list' ? (
            <ListIcon className="w-5 h-5" />
          ) : (
            <FeedIcon className="w-5 h-5" />
          )}
        </button>
        {canAddMore && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              onAdd()
            }}
            className={mobileBarButtonClass}
            aria-label="Add blank frame"
          >
            <PlusIcon className="w-5 h-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onUpload}
          className={mobileBarButtonClass}
          aria-label="Upload"
        >
          <UploadIcon className="w-5 h-5" />
        </button>
        {canRemove && (
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault()
              onRemove()
            }}
            className={mobileBarButtonClass}
            aria-label="Remove"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
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
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parseWebsiteLinkInput(url)
    if ('error' in parsed) {
      setError(parsed.error)
      return
    }
    onSave(frameId, parsed.url)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-300 p-5 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium mb-1">Add Website Link</h3>
        <p className="text-sm text-gray-500 mb-4">
          Paste a URL, or an Instagram embed code for a post or profile.
        </p>
        <form onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError(null)
            }}
            placeholder="https://example.com"
            rows={5}
            className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-gray-500 resize-y min-h-[6rem] text-sm"
          />
          {error && (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-4 py-2 bg-gray-900 text-white hover:bg-gray-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
  focusCaptionFrameId,
  onFocusCaptionConsumed,
  showInsertionBefore,
  onCaptionChange,
  onFocus,
  onBlur,
  readOnly = false,
}: {
  frame: ComicFrame
  index: number
  onRemove: (id: string) => void
  onNavigate: (id: string) => void
  onUpload: (id: string) => void
  onEnterFrame: (frame: ComicFrame) => void
  focusCaptionFrameId?: string | null
  onFocusCaptionConsumed: () => void
  showInsertionBefore?: boolean
  onCaptionChange: (id: string, caption: string) => void
  onFocus?: (id: string) => void
  onBlur?: () => void
  readOnly?: boolean
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

  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  }

  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const captionInputRef = useRef<HTMLTextAreaElement>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    if (isDragging) suppressClickRef.current = true
  }, [isDragging])

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
        className={`group aspect-[198/277] relative rounded-lg overflow-hidden bg-[#DDDDDD] border border-border cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-2 focus:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isDragging ? 'opacity-80 z-10' : ''}`}
        onClick={(e) => {
          if (readOnly) return
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          onFocus?.(frame.id)
          if (!isDesktop) {
            // Mobile: tap selects (for bottom bar add/remove); empty frames open upload
            if (!frame.imageUrl && !frame.websiteUrl) {
              onUpload(frame.id)
            }
            ;(e.currentTarget as HTMLElement).focus()
            return
          }
          if (frame.imageUrl) {
            onNavigate(frame.id)
          } else {
            onUpload(frame.id)
          }
          ;(e.currentTarget as HTMLElement).focus()
        }}
        onFocus={() => {
          if (!isEditingCaption) {
            onFocus?.(frame.id)
          }
        }}
        onBlur={(e) => {
          // Only blur if not focusing a child element
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onBlur?.()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnterFrame(frame)
          }
        }}
        tabIndex={0}
        aria-label={frame.imageUrl || frame.websiteUrl ? `Edit frame ${index + 1}` : `Upload photo for empty frame ${index + 1}`}
        {...gridAttributes}
        {...(readOnly ? {} : listeners)}
      >
        {frame.websiteUrl ? (
          <div className="w-full h-full flex items-center justify-center bg-white">
            <img
              src={`https://www.google.com/s2/favicons?domain=${websiteHostname(frame.websiteUrl) ?? 'instagram.com'}&sz=128`}
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
            loading="lazy"
            decoding="async"
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
        {!readOnly && (
          <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {(frame.imageUrl || frame.websiteUrl) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onFocus?.(frame.id)
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
                onFocus?.(frame.id)
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
        )}

        {/* Bottom caption strip for inline editing */}
        <div
          className={`absolute inset-x-0 bottom-0 min-h-[2.5rem] max-w-[500px] text-white px-1.5 py-1 text-[11px] leading-snug transition-colors ${
            frame.websiteUrl ? 'bg-black' : 'bg-black/70 group-hover:bg-black/80'
          } ${readOnly ? 'cursor-default' : 'cursor-text'}`}
          onClick={(e) => {
            if (readOnly) return
            e.stopPropagation()
            onFocus?.(frame.id)
            setIsEditingCaption(true)
          }}
        >
          {!readOnly && isEditingCaption ? (
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
                  onEnterFrame(frame)
                }
              }}
                      onBlur={() => {
                        setIsEditingCaption(false)
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
              {frame.caption.trim() || (readOnly ? '' : 'Add a caption...')}
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
  focusCaptionFrameId,
  onFocusCaptionConsumed,
  showInsertionBefore,
  onCaptionChange,
  onFocus,
  onBlur,
  onMultiLinePaste,
  readOnly = false,
}: {
  frame: ComicFrame
  index: number
  onRemove: (id: string) => void
  onUpload: (id: string) => void
  onAddLink: (id: string) => void
  onEnterFrame: (frame: ComicFrame) => void
  focusCaptionFrameId?: string | null
  onFocusCaptionConsumed: () => void
  showInsertionBefore?: boolean
  onCaptionChange: (id: string, caption: string) => void
  onFocus?: (id: string) => void
  onBlur?: () => void
  onMultiLinePaste?: (frameId: string, lines: string[]) => void
  readOnly?: boolean
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

  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const captionInputRef = useRef<HTMLTextAreaElement>(null)
  const suppressThumbClickRef = useRef(false)

  useEffect(() => {
    if (isDragging) suppressThumbClickRef.current = true
  }, [isDragging])

  const autoResizeTextarea = useCallback(() => {
    const textarea = captionInputRef.current
    if (!textarea) return
    // Collapse first so scrollHeight reflects content, not the default 2-row textarea.
    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    if (!isEditingCaption) return
    const input = captionInputRef.current
    if (!input) return
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    autoResizeTextarea()
  }, [isEditingCaption, autoResizeTextarea])

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

  const baseText = frame.caption.trim()
  const displayText = baseText || 'Add a caption...'
  // Mobile: long-press the photo to reorder (keeps caption editable).
  const thumbDragProps = !readOnly && !isDesktop ? { ...listAttributes, ...listeners } : {}

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative w-full ${isDragging ? 'z-20' : ''}`}
    >
      {showInsertionBefore && (
        <div
          className="absolute left-0 right-0 top-0 h-0.5 bg-gray-400 rounded-full z-20 pointer-events-none"
          aria-hidden
        />
      )}
      {!readOnly && isDesktop && (
        <button
          type="button"
          className="absolute right-full top-1/2 -translate-y-1/2 mr-1 shrink-0 p-1.5 text-gray-500 hover:text-gray-700 cursor-grab active:cursor-grabbing touch-none focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-1 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
          aria-label={`Drag to reorder frame ${index + 1}`}
          {...listAttributes}
          {...listeners}
        >
          <DragHandleIcon className="w-2.5 h-4" />
        </button>
      )}
      <div
        className={`flex w-full min-w-0 flex-row items-stretch gap-0 rounded-lg border border-border bg-surface overflow-hidden select-none focus:outline-none focus:ring-2 focus:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-shadow ${
          isDragging ? 'shadow-[0_12px_28px_rgba(0,0,0,0.22)]' : ''
        }`}
        tabIndex={0}
        onFocus={() => {
          if (!isEditingCaption) {
            onFocus?.(frame.id)
          }
        }}
        onBlur={(e) => {
          // Only blur if not focusing a child element
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            onBlur?.()
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnterFrame(frame)
          }
        }}
      >
        <button
          type="button"
          className={`group/thumb shrink-0 w-14 min-h-14 self-stretch rounded-l-lg overflow-hidden border-r border-border focus:outline-none focus:ring-2 focus:ring-muted focus:ring-inset relative ${
            !readOnly && !isDesktop ? 'touch-none cursor-grab active:cursor-grabbing' : ''
          }`}
          onClick={(e) => {
            if (readOnly) return
            e.stopPropagation()
            if (suppressThumbClickRef.current) {
              suppressThumbClickRef.current = false
              return
            }
            onFocus?.(frame.id)
            onUpload(frame.id)
          }}
          disabled={readOnly}
          aria-label={
            !readOnly && !isDesktop
              ? `Hold to reorder, or tap to ${frame.imageUrl || frame.websiteUrl ? 'reupload' : 'upload'} photo for frame ${index + 1}`
              : frame.imageUrl || frame.websiteUrl
                ? `Reupload photo for frame ${index + 1}`
                : `Upload photo for empty frame ${index + 1}`
          }
          {...thumbDragProps}
        >
          {frame.websiteUrl ? (
            <>
              <div className="h-full w-full min-h-14 bg-white flex items-center justify-center">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${websiteHostname(frame.websiteUrl) ?? 'instagram.com'}&sz=128`}
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
                loading="lazy"
                decoding="async"
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
          className={`flex-1 min-w-0 flex items-center py-3 px-3 text-sm text-gray-900 transition-colors ${
            readOnly ? 'cursor-default' : 'cursor-text hover:bg-gray-100/80'
          }`}
          onClick={(e) => {
            if (readOnly) return
            e.stopPropagation()
            onFocus?.(frame.id)
            if (!isEditingCaption) {
              setIsEditingCaption(true)
            }
          }}
        >
          {!readOnly && isEditingCaption ? (
            <textarea
              ref={captionInputRef}
              rows={1}
              value={frame.caption}
              onChange={(e) => {
                onCaptionChange(frame.id, e.target.value)
                autoResizeTextarea()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.stopPropagation()
                  onEnterFrame(frame)
                }
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text/plain')
                if (text) {
                  const lines = text.split(/\r?\n/).filter((line) => line.trim())
                  if (lines.length > 1 && onMultiLinePaste) {
                    e.preventDefault()
                    e.stopPropagation()
                    onMultiLinePaste(frame.id, lines)
                  }
                }
              }}
              onBlur={() => {
                setIsEditingCaption(false)
              }}
              onClick={(e) => e.stopPropagation()}
              className="block w-full p-0 m-0 bg-transparent border-0 outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 resize-none text-sm leading-snug text-gray-900 placeholder:text-gray-500 placeholder:opacity-100 overflow-hidden"
              style={{
                ...captionFontStyle,
                lineHeight: 1.375,
                height: '1.375em',
              }}
              placeholder="Add a caption..."
            />
          ) : (
            <span
              className={`block w-full select-none leading-snug ${
                displayText === 'Add a caption...' && !readOnly ? 'text-gray-500' : 'text-gray-900'
              }`}
              style={{
                ...captionFontStyle,
                lineHeight: 1.375,
              }}
            >
              {readOnly && displayText === 'Add a caption...' ? '' : displayText}
            </span>
          )}
        </div>
      </div>
      {!readOnly && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-0.5 hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onFocus?.(frame.id)
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
              onFocus?.(frame.id)
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
      )}
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
        {frame.websiteUrl ? (
          <div className="relative w-full max-w-md h-[70vh] flex flex-col">
            <iframe
              src={iframeSrcForWebsiteUrl(frame.websiteUrl)}
              title="Website preview"
              className={
                isInstagramEmbed(frame.websiteUrl)
                  ? 'w-full flex-1 min-h-0 max-w-[540px] mx-auto rounded-lg bg-white'
                  : 'w-full flex-1 min-h-0 rounded-lg bg-white'
              }
              sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              allow="encrypted-media; clipboard-write; picture-in-picture"
            />
            <textarea
              ref={inputRef}
              value={frame.caption}
              onChange={(e) => onCaptionChange(frame.id, e.target.value)}
              placeholder="Add a caption..."
              rows={2}
              className="mt-3 w-full bg-black text-white border-0 outline-none focus:outline-none focus:ring-0 placeholder-white/50 resize-none text-center px-2.5 py-1.5 rounded"
              style={{
                ...captionFontStyle,
                fontSize: `${frame.fontSize}px`,
              }}
            />
          </div>
        ) : frame.imageUrl ? (
          <div className="relative w-full max-w-md">
            <img
              src={frame.imageUrl}
              alt=""
              className="w-full h-auto object-contain rounded-lg"
              decoding="async"
            />
            {/* Inline editable text overlay - centered on image */}
            <div
              className="absolute inset-x-4 bottom-8 flex items-center justify-center"
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
                  textShadow: COMIC_TEXT_STROKE_SHADOW,
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
  onSwipePastEnd,
}: {
  frames: ComicFrame[]
  currentIndex: number
  onCurrentIndexChange: (index: number) => void
  onFrameTap: (frame: ComicFrame) => void
  onSwipePastEnd?: () => boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRefs = useRef<(HTMLDivElement | null)[]>([])
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const startedAtEndRef = useRef(false)
  const pendingScrollToEndRef = useRef(false)
  const swipeCooldownRef = useRef(false)

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

  // After swipe-to-add, scroll to the newly appended frame
  useEffect(() => {
    if (!pendingScrollToEndRef.current || frames.length === 0) return
    pendingScrollToEndRef.current = false
    const newIndex = frames.length - 1
    requestAnimationFrame(() => scrollToIndex(newIndex))
  }, [frames.length])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !onSwipePastEnd) return

    const isAtEnd = () => {
      const maxScroll = container.scrollWidth - container.clientWidth
      return currentIndex >= frames.length - 1 || container.scrollLeft >= maxScroll - 4
    }

    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      startedAtEndRef.current = isAtEnd()
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current == null || touchStartY.current == null) return
      if (!startedAtEndRef.current || swipeCooldownRef.current) {
        touchStartX.current = null
        touchStartY.current = null
        return
      }

      const dx = e.changedTouches[0].clientX - touchStartX.current
      const dy = e.changedTouches[0].clientY - touchStartY.current
      touchStartX.current = null
      touchStartY.current = null

      // Advance past the last frame: finger swipes toward the next / right end
      const isHorizontal = Math.abs(dx) > Math.abs(dy)
      if (!isHorizontal || dx > -56) return

      swipeCooldownRef.current = true
      const created = onSwipePastEnd()
      if (created) {
        pendingScrollToEndRef.current = true
      }
      window.setTimeout(() => {
        swipeCooldownRef.current = false
      }, 500)
    }

    container.addEventListener('touchstart', onTouchStart, { passive: true })
    container.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchend', onTouchEnd)
    }
  }, [currentIndex, frames.length, onSwipePastEnd])

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
              {frame.websiteUrl ? (
                <iframe
                  src={iframeSrcForWebsiteUrl(frame.websiteUrl)}
                  title="Website preview"
                  className={
                    isInstagramEmbed(frame.websiteUrl)
                      ? 'w-full max-w-[540px] h-full pointer-events-none'
                      : 'w-full h-full pointer-events-none'
                  }
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  allow="encrypted-media; clipboard-write; picture-in-picture"
                />
              ) : frame.imageUrl ? (
                <img
                  src={frame.imageUrl}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div className="w-full h-full bg-[#DDDDDD] flex items-center justify-center">
                  <span className="text-gray-500">+ add photo</span>
                </div>
              )}
              {frame.caption && (
                <div
                  className={`absolute bottom-8 left-4 right-4 leading-snug text-center ${
                    frame.websiteUrl ? 'bg-black text-white px-2.5 py-1.5' : ''
                  }`}
                  style={{
                    ...captionFontStyle,
                    fontSize: `${frame.fontSize}px`,
                    color: frame.websiteUrl ? '#ffffff' : frame.fontColor,
                    textShadow: frame.websiteUrl ? undefined : COMIC_TEXT_STROKE_SHADOW,
                  }}
                >
                  {frame.caption}
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
            {frame.websiteUrl ? (
              <div className="w-full h-full bg-white flex items-center justify-center">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${websiteHostname(frame.websiteUrl) ?? 'instagram.com'}&sz=64`}
                  alt=""
                  className="w-6 h-6 object-contain"
                  draggable={false}
                />
              </div>
            ) : frame.imageUrl ? (
              <img
                src={frame.imageUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
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
  const { user, loading: authLoading } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [hydrated, setHydrated] = useState(false)
  const [limitMessageShown, setLimitMessageShown] = useState(false)
  const initialView = searchParams.get('view')
  const [view, setView] = useState<CreateView>(() => {
    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 639px)').matches
    if (initialView === 'list' || initialView === 'feed' || initialView === 'grid') {
      // Mobile modes are grid + feed; map list → grid
      if (initialView === 'list' && isMobile) return 'grid'
      return initialView
    }
    return 'grid'
  })
  const [processingFiles, setProcessingFiles] = useState(false)
  const [insertionIndex, setInsertionIndex] = useState<number | null>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)
  const [focusCaptionFrameId, setFocusCaptionFrameId] = useState<string | null>(null)
  const [focusedFrameId, setFocusedFrameId] = useState<string | null>(null)
  const [feedCurrentIndex, setFeedCurrentIndex] = useState(0)
  const [editingFeedFrame, setEditingFeedFrame] = useState<ComicFrame | null>(null)
  const [linkModalFrameId, setLinkModalFrameId] = useState<string | null>(null)
  const focusHandledRef = useRef(false)
  const [undoSnapshot, setUndoSnapshot] = useState<ComicFrame[] | null>(null)

  const { frames, addFrames, addEmptyFrame, removeFrame, reorderFrames, updateFrame, publishedSlug, editorHydrated, editorHydrateError, isReadOnly } = useComicStore()
  const hasFrames = frames.length > 0

  useEffect(() => {
    setHydrated(true)
  }, [])

  // Mobile only supports grid + feed; keep list for desktop
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const syncMobileView = () => {
      if (mq.matches && view === 'list') {
        setView('grid')
      }
    }
    syncMobileView()
    mq.addEventListener('change', syncMobileView)
    return () => mq.removeEventListener('change', syncMobileView)
  }, [view])

  // Handle ?view=list&focus=first from "Describe a feeling" homepage entry
  useEffect(() => {
    if (!hydrated || !editorHydrated || focusHandledRef.current) return
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
  }, [hydrated, editorHydrated, searchParams, setSearchParams, addEmptyFrame])

  const canAddMore = frames.length < MAX_FRAMES

  const handleFeedSwipePastEnd = useCallback(() => {
    if (isReadOnly) return false
    if (frames.length >= MAX_FRAMES) return false
    const id = addEmptyFrame()
    if (!id) return false
    const newIndex = useComicStore.getState().frames.length - 1
    setFeedCurrentIndex(newIndex)
    setFocusedFrameId(id)
    return true
  }, [frames.length, addEmptyFrame, isReadOnly])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    })
  )

  const frameIds = useMemo(() => frames.map((f) => f.id), [frames])

  const insertBlankFrameAfter = useCallback(
    (afterId: string | null) => {
      if (isReadOnly) return null
      if (frames.length >= MAX_FRAMES) {
        setLimitMessageShown(true)
        return null
      }

      if (afterId) {
        const currentIndex = frames.findIndex((f) => f.id === afterId)
        if (currentIndex !== -1) {
          const id = addEmptyFrame()
          if (!id) return null
          const updatedFrames = useComicStore.getState().frames
          const newFrames = [...updatedFrames]
          const newFrame = newFrames.pop()!
          newFrames.splice(currentIndex + 1, 0, newFrame)
          reorderFrames(newFrames)
          setFocusedFrameId(id)
          setFocusCaptionFrameId(id)
          if (view === 'feed') {
            setFeedCurrentIndex(currentIndex + 1)
          }
          return id
        }
      }

      const id = addEmptyFrame()
      if (!id) return null
      setFocusedFrameId(id)
      setFocusCaptionFrameId(id)
      if (view === 'feed') {
        setFeedCurrentIndex(useComicStore.getState().frames.length - 1)
      }
      return id
    },
    [frames, addEmptyFrame, reorderFrames, isReadOnly, view]
  )

  const handleMobileAddBlankFrame = useCallback(() => {
    const afterId =
      view === 'feed'
        ? frames[feedCurrentIndex]?.id ?? null
        : focusedFrameId
    insertBlankFrameAfter(afterId)
  }, [view, frames, feedCurrentIndex, focusedFrameId, insertBlankFrameAfter])

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
        // Clear websiteUrl when uploading image - they're mutually exclusive
        updateFrame(uploadTargetId, {
          imageFile: file,
          imageUrl: URL.createObjectURL(file),
          websiteUrl: undefined,
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
      if (isReadOnly) return

      const images = getImagesFromClipboard(e.clipboardData)
      
      if (images.length > 0) {
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
        return
      }

      // Handle multi-line text paste in list view (only when not editing a textarea)
      const activeEl = document.activeElement
      const isEditingText = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement
      
      if (view === 'list' && !isEditingText) {
        const text = e.clipboardData?.getData('text/plain')
        if (text) {
          const lines = text.split(/\r?\n/).filter((line) => line.trim())
          if (lines.length > 1) {
            e.preventDefault()
            
            // Save state for undo
            setUndoSnapshot([...frames])
            
            const remaining = MAX_FRAMES - frames.length
            const linesToAdd = lines.slice(0, remaining)
            
            // Create frames for each line
            linesToAdd.forEach((line, index) => {
              const id = addEmptyFrame()
              if (id) {
                updateFrame(id, { caption: line.trim() })
                // Focus the first new frame
                if (index === 0) {
                  setFocusCaptionFrameId(id)
                }
              }
            })

            if (lines.length > remaining || frames.length + linesToAdd.length === MAX_FRAMES) {
              setLimitMessageShown(true)
            }
          }
        }
      }
    },
    [frames.length, focusedFrameId, updateFrame, addFrames, view, addEmptyFrame, isReadOnly]
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  // Handle undo (Ctrl+Z / Cmd+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isReadOnly) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Only undo if not typing in a text field
        const activeEl = document.activeElement
        const isEditingText = activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement
        
        if (!isEditingText && undoSnapshot) {
          e.preventDefault()
          reorderFrames(undoSnapshot)
          setUndoSnapshot(null)
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [undoSnapshot, reorderFrames, isReadOnly])

  const handleUploadForFrame = (id: string) => {
    setUploadTargetId(id)
    openFileInput()
  }

  const handleAddLink = (id: string) => {
    setLinkModalFrameId(id)
  }

  const handleSaveLink = (frameId: string, url: string) => {
    const frame = frames.find((f) => f.id === frameId)
    // Revoke old blob URL if present
    if (frame?.imageUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(frame.imageUrl)
    }
    // Clear image when adding website link - they're mutually exclusive
    updateFrame(frameId, { websiteUrl: url, imageUrl: '', imageFile: null })
  }

  const handleEnterOnFrame = (frame: ComicFrame) => {
    if (isReadOnly) return
    
    // Save state for undo
    setUndoSnapshot([...frames])
    
    // Always create a new blank row and insert it right after the current row
    const currentIndex = frames.findIndex(f => f.id === frame.id)
    if (currentIndex === -1) return
    
    const id = addEmptyFrame()
    if (id) {
      // Get the updated frames from the store (includes the newly added frame)
      const updatedFrames = useComicStore.getState().frames
      const newFrames = [...updatedFrames]
      const newFrame = newFrames.pop()! // Remove new frame from end
      newFrames.splice(currentIndex + 1, 0, newFrame) // Insert after current
      reorderFrames(newFrames)
      setFocusCaptionFrameId(id)
    }
  }

  const handleMultiLinePaste = useCallback(
    (frameId: string, lines: string[]) => {
      if (isReadOnly || lines.length === 0) return
      
      // Save state for undo
      setUndoSnapshot([...frames])
      
      // First line updates the current frame's caption
      updateFrame(frameId, { caption: lines[0].trim() })
      
      // Remaining lines create new frames
      const remaining = MAX_FRAMES - frames.length
      const linesToAdd = lines.slice(1, 1 + remaining)
      
      let lastCreatedId: string | null = null
      linesToAdd.forEach((line) => {
        const id = addEmptyFrame()
        if (id) {
          updateFrame(id, { caption: line.trim() })
          lastCreatedId = id
        }
      })

      // Focus the last created frame
      if (lastCreatedId) {
        setFocusCaptionFrameId(lastCreatedId)
      }

      if (lines.length - 1 > remaining || frames.length + linesToAdd.length === MAX_FRAMES) {
        setLimitMessageShown(true)
      }
    },
    [frames, updateFrame, addEmptyFrame, isReadOnly]
  )

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
    navigate(editPagePath(id, publishedSlug))
  }

  if (!hydrated || authLoading || !editorHydrated) {
    return <CreatePageSkeleton />
  }

  if (editorHydrateError && !hasFrames) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-gray-600 mb-4">{editorHydrateError}</p>
        <button
          type="button"
          onClick={() => navigate('/create', { replace: true })}
          className="min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors"
        >
          Start a new comic
        </button>
      </div>
    )
  }

  return (
    <div
      className={`relative w-full max-w-xl mx-auto min-w-0 ${
        view === 'list'
          ? 'overflow-x-visible sm:pl-9 sm:pr-20'
          : 'overflow-x-hidden'
      } ${!isReadOnly ? 'pb-20 sm:pb-0' : ''}`}
    >
      {isReadOnly && hasFrames && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
          <p className="font-medium">Viewing in read-only mode</p>
          <p className="text-blue-700 mt-1">
            {user ? 'You can only edit your own comics.' : 'Sign in to edit this comic if you own it.'}
          </p>
        </div>
      )}

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
        hideActions={frames.length === 0 || isReadOnly}
        previewDisabled={frames.length === 0}
        previewReturnTo={createPagePath(publishedSlug, view)}
        previewStartIndex={focusedFrameId ? frames.findIndex(f => f.id === focusedFrameId) : undefined}
        leftContent={
          <h1 className="text-[16px] leading-normal font-bold text-black whitespace-nowrap">
            Sequence
          </h1>
        }
        leadingActions={
          hasFrames && !isReadOnly ? (
            /* Desktop: Grid / List toggle (mobile uses pinned bottom bar) */
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
        <div className="flex items-stretch gap-6 self-stretch">
          <button
            type="button"
            onClick={openFileInput}
            disabled={processingFiles}
            className="flex-1 min-w-0 min-h-[200px] flex items-center justify-center p-2.5 bg-white border border-dashed border-black hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-2 disabled:opacity-50"
            aria-label="Upload photos"
          >
            <span className="text-[16px] leading-normal font-bold text-black whitespace-nowrap">
              {processingFiles ? 'Uploading…' : 'Upload Photos'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              const id = addEmptyFrame()
              if (id) setFocusCaptionFrameId(id)
              const isMobile = window.matchMedia('(max-width: 639px)').matches
              setView(isMobile ? 'grid' : 'list')
            }}
            disabled={processingFiles}
            className="flex-1 min-w-0 min-h-[200px] flex items-center justify-center p-2.5 bg-white border border-dashed border-black hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-2 disabled:opacity-50"
            aria-label="Describe a feeling"
          >
            <span className="text-[16px] leading-normal font-bold text-black whitespace-nowrap">
              Describe a feeling
            </span>
          </button>
        </div>
      ) : (
        <>
          {view === 'feed' ? (
            <>
              <FeedView
                frames={frames}
                currentIndex={feedCurrentIndex}
                onCurrentIndexChange={(index) => {
                  setFeedCurrentIndex(index)
                  if (frames[index]) {
                    setFocusedFrameId(frames[index].id)
                  }
                }}
                onFrameTap={(frame) => {
                  if (isReadOnly) return
                  setFocusedFrameId(frame.id)
                  if (frame.imageUrl || frame.websiteUrl) {
                    setEditingFeedFrame(frame)
                  } else {
                    handleUploadForFrame(frame.id)
                  }
                }}
                onSwipePastEnd={handleFeedSwipePastEnd}
              />
              {!isReadOnly && (
                <MobileCreateBar
                  viewToggle={{
                    label: 'Grid view',
                    icon: 'list',
                    onClick: () => setView('grid'),
                  }}
                  canAddMore={canAddMore}
                  onAdd={handleMobileAddBlankFrame}
                  onUpload={() => {
                    const targetId = frames[feedCurrentIndex]?.id
                    if (targetId) {
                      handleUploadForFrame(targetId)
                    } else {
                      openFileInput()
                    }
                  }}
                  canRemove={Boolean(frames[feedCurrentIndex])}
                  onRemove={() => {
                    const id = frames[feedCurrentIndex]?.id
                    if (!id) return
                    removeFrame(id)
                    setFocusedFrameId((current) => (current === id ? null : current))
                  }}
                />
              )}
              {editingFeedFrame && (
                <FeedCaptionEditor
                  frame={editingFeedFrame}
                  onClose={() => setEditingFeedFrame(null)}
                  onCaptionChange={(id, caption) => {
                    updateFrame(id, { caption })
                    const updated = frames.find((f) => f.id === id)
                    if (updated) {
                      setEditingFeedFrame({ ...updated, caption })
                    }
                  }}
                />
              )}
            </>
          ) : view === 'grid' ? (
            <>
              {!isReadOnly ? (
                <DndContext
                  sensors={sensors}
                  autoScroll={false}
                  onDragOver={handleGridDragOver}
                  onDragEnd={handleGridDragEnd}
                >
                <SortableContext
                  items={frameIds}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    {frames.map((frame, index) => (
                      <SortableGridItem
                        key={frame.id}
                        frame={frame}
                        index={index}
                        onRemove={removeFrame}
                        onNavigate={handleNavigateToEdit}
                        onUpload={handleUploadForFrame}
                        onEnterFrame={handleEnterOnFrame}
                        focusCaptionFrameId={focusCaptionFrameId}
                        onFocusCaptionConsumed={handleFocusCaptionConsumed}
                        showInsertionBefore={
                          insertionIndex != null &&
                          insertionIndex === index &&
                          index > 0 &&
                          index < frames.length
                        }
                        onCaptionChange={(id, caption) =>
                          updateFrame(id, { caption })
                        }
                        onFocus={setFocusedFrameId}
                        onBlur={() => setFocusedFrameId(null)}
                        readOnly={isReadOnly}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              ) : (
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
                      focusCaptionFrameId={focusCaptionFrameId}
                      onFocusCaptionConsumed={handleFocusCaptionConsumed}
                      showInsertionBefore={false}
                      onCaptionChange={(id, caption) =>
                        updateFrame(id, { caption })
                      }
                      onFocus={setFocusedFrameId}
                      onBlur={() => setFocusedFrameId(null)}
                      readOnly={isReadOnly}
                    />
                  ))}
                </div>
              )}
              {!isReadOnly && (
                <MobileCreateBar
                  viewToggle={{
                    label: 'Feed view',
                    icon: 'feed',
                    onClick: () => setView('feed'),
                  }}
                  canAddMore={canAddMore}
                  onAdd={handleMobileAddBlankFrame}
                  onUpload={() => {
                    if (focusedFrameId) {
                      handleUploadForFrame(focusedFrameId)
                    } else {
                      openFileInput()
                    }
                  }}
                  canRemove={Boolean(focusedFrameId)}
                  onRemove={() => {
                    if (!focusedFrameId) return
                    removeFrame(focusedFrameId)
                    setFocusedFrameId(null)
                  }}
                />
              )}
            </>
          ) : (
            <>
              {!isReadOnly ? (
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
                        focusCaptionFrameId={focusCaptionFrameId}
                        onFocusCaptionConsumed={handleFocusCaptionConsumed}
                        showInsertionBefore={
                          insertionIndex != null &&
                          insertionIndex === index &&
                          index > 0
                        }
                        onCaptionChange={(id, caption) =>
                          updateFrame(id, { caption })
                        }
                        onFocus={setFocusedFrameId}
                        onBlur={() => setFocusedFrameId(null)}
                        onMultiLinePaste={handleMultiLinePaste}
                        readOnly={isReadOnly}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              ) : (
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
                      focusCaptionFrameId={focusCaptionFrameId}
                      onFocusCaptionConsumed={handleFocusCaptionConsumed}
                      showInsertionBefore={false}
                      onCaptionChange={(id, caption) =>
                        updateFrame(id, { caption })
                      }
                      onFocus={setFocusedFrameId}
                      onBlur={() => setFocusedFrameId(null)}
                      onMultiLinePaste={handleMultiLinePaste}
                      readOnly={isReadOnly}
                    />
                  ))}
                </div>
              )}
              {!isReadOnly && (
                <MobileCreateBar
                  viewToggle={{
                    label: 'Feed view',
                    icon: 'feed',
                    onClick: () => setView('feed'),
                  }}
                  canAddMore={canAddMore}
                  onAdd={handleMobileAddBlankFrame}
                  onUpload={() => {
                    if (focusedFrameId) {
                      handleUploadForFrame(focusedFrameId)
                    } else {
                      openFileInput()
                    }
                  }}
                  canRemove={Boolean(focusedFrameId)}
                  onRemove={() => {
                    if (!focusedFrameId) return
                    removeFrame(focusedFrameId)
                    setFocusedFrameId(null)
                  }}
                />
              )}
            </>
          )}

          {!isReadOnly && (
            <div className="mt-6 flex flex-col items-center gap-3">
              {canAddMore && (
                <button
                  type="button"
                  onClick={openFileInput}
                  className="btn-primary hidden sm:inline-flex"
                >
                  + add more
                </button>
              )}
              {limitMessageShown && frames.length === MAX_FRAMES && (
                <p className="text-sm text-amber-600" role="status">
                  Maximum {MAX_FRAMES} frames reached
                </p>
              )}
            </div>
          )}
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
