import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ComicFlowHeader } from '../components/ComicFlowHeader'
import { prepareImage, getImagesFromClipboard } from '../lib/prepareImage'
import { COMIC_CAPTION_FONT_FAMILY, COMIC_TEXT_STROKE_SHADOW } from '../lib/comicCaptionStyle'
import { createPagePath, editPagePath } from '../lib/comicEditor'
import { MAX_FRAMES, useComicStore, type ComicFrame, type OverlayPosition } from '../stores/useComicStore'

const PLACEHOLDER_TEXT = 'Your text here'

const overlayFontStyle: React.CSSProperties = {
  fontFamily: COMIC_CAPTION_FONT_FAMILY,
  fontWeight: 'bold',
}

const btnPrimary = 'min-h-[44px] px-4 py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function EditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const frameId = searchParams.get('frame') ?? ''

  const { frames, addFrames, updateFrame, publishedSlug, editorHydrated, editorHydrateError } = useComicStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)
  const [processingFiles, setProcessingFiles] = useState(false)

  const currentIndex = frames.findIndex((f) => f.id === frameId)
  const frame: ComicFrame | undefined = frames[currentIndex]
  const [editingOnImage, setEditingOnImage] = useState(false)
  const overlayInputRef = useRef<HTMLTextAreaElement>(null)
  const styleToolbarRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const overlayBoxRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const dragMovedRef = useRef(false)
  const toolbarInteractionRef = useRef(false)
  const [savedOverlayWidth, setSavedOverlayWidth] = useState<number | null>(null)

  useEffect(() => {
    setSavedOverlayWidth(null)
  }, [frameId])

  const clampPosition = useCallback(
    (x: number, y: number, containerRect: DOMRect, boxRect: DOMRect): OverlayPosition => {
      const boxW = boxRect.width
      const boxH = boxRect.height
      const minX = (boxW / 2 / containerRect.width) * 100
      const maxX = 100 - minX
      const minY = (boxH / 2 / containerRect.height) * 100
      const maxY = 100 - minY
      return {
        x: Math.max(minX, Math.min(maxX, x)),
        y: Math.max(minY, Math.min(maxY, y)),
      }
    },
    []
  )

  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!frame || !previewContainerRef.current || !overlayBoxRef.current) return
      if (editingOnImage) return
      e.preventDefault()
      dragMovedRef.current = false
      const container = previewContainerRef.current
      const box = overlayBoxRef.current
      const rect = container.getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      const boxCenterX = (boxRect.left - rect.left + boxRect.width / 2) / rect.width
      const boxCenterY = (boxRect.top - rect.top + boxRect.height / 2) / rect.height
      const startXPercent = boxCenterX * 100
      const startYPercent = boxCenterY * 100
      dragStartRef.current = {
        x: startXPercent,
        y: startYPercent,
        startX: e.clientX,
        startY: e.clientY,
      }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [frame, editingOnImage]
  )

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!frame || !dragStartRef.current || !previewContainerRef.current || !overlayBoxRef.current)
        return
      const rect = previewContainerRef.current.getBoundingClientRect()
      const deltaX = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100
      const deltaY = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) dragMovedRef.current = true
      const box = overlayBoxRef.current
      const boxRect = box.getBoundingClientRect()
      const newX = dragStartRef.current.x + deltaX
      const newY = dragStartRef.current.y + deltaY
      const clamped = clampPosition(newX, newY, rect, boxRect)
      updateFrame(frame.id, { overlayPosition: { ...clamped } })
      dragStartRef.current = {
        ...dragStartRef.current,
        x: clamped.x,
        y: clamped.y,
        startX: e.clientX,
        startY: e.clientY,
      }
    },
    [frame, clampPosition, updateFrame]
  )

  const handleOverlayPointerUp = useCallback(
    (e: React.PointerEvent) => {
      // Only enter edit mode on actual pointer up (click), not on pointer leave/cancel
      if (e.type === 'pointerup' && !dragMovedRef.current && frame && overlayBoxRef.current) {
        setSavedOverlayWidth(overlayBoxRef.current.getBoundingClientRect().width)
        setEditingOnImage(true)
        setTimeout(() => overlayInputRef.current?.focus(), 0)
      }
      dragStartRef.current = null
    },
    [frame]
  )

  const handleOverlayPointerLeaveOrCancel = useCallback(() => {
    dragStartRef.current = null
  }, [])

  const goToFrame = useCallback(
    (index: number) => {
      const target = frames[index]
      if (target) setSearchParams({ frame: target.id })
    },
    [frames, setSearchParams]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (editingOnImage) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToFrame(Math.max(0, currentIndex - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToFrame(Math.min(frames.length - 1, currentIndex + 1))
      } else if (e.key === 'Home') {
        e.preventDefault()
        goToFrame(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        goToFrame(frames.length - 1)
      }
    },
    [editingOnImage, goToFrame, currentIndex, frames.length]
  )

  const handleSelectFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      const fileList = Array.from(files)
      e.target.value = ''
      const remaining = MAX_FRAMES - frames.length
      const toProcess = fileList.slice(0, remaining)
      setProcessingFiles(true)
      try {
        const converted = await Promise.all(toProcess.map((f) => prepareImage(f)))
        addFrames(converted)
      } finally {
        setProcessingFiles(false)
      }
    },
    [frames.length, addFrames]
  )

  const openFileInput = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const images = getImagesFromClipboard(e.clipboardData)
      if (images.length === 0) return

      e.preventDefault()
      setProcessingFiles(true)
      try {
        const remaining = MAX_FRAMES - frames.length
        if (frameId && frames.some((f) => f.id === frameId)) {
          const converted = await prepareImage(images[0])
          updateFrame(frameId, {
            imageFile: converted,
            imageUrl: URL.createObjectURL(converted),
          })
        } else {
          const toProcess = images.slice(0, remaining)
          const converted = await Promise.all(toProcess.map((f) => prepareImage(f)))
          addFrames(converted)
        }
      } finally {
        setProcessingFiles(false)
      }
    },
    [frames, frameId, updateFrame, addFrames]
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  if (!editorHydrated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh]">
        <div className="h-10 w-10 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
        <p className="text-sm text-gray-600 mt-3">Loading comic…</p>
      </div>
    )
  }

  if (editorHydrateError && frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-gray-600 mb-4">{editorHydrateError}</p>
        <Link to={createPagePath(publishedSlug)} className={btnPrimary + ' inline-flex items-center justify-center'}>
          ← Back to Create
        </Link>
      </div>
    )
  }

  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-gray-600 mb-4">No frames yet. Add photos on the create page.</p>
        <Link to={createPagePath(publishedSlug)} className={btnPrimary + ' inline-flex items-center justify-center'}>
          ← Back to Create
        </Link>
      </div>
    )
  }

  if (!frame && frames.length > 0) {
    return <Navigate replace to={editPagePath(frames[0].id, publishedSlug)} />
  }
  if (!frame) return null

  const canAddMore = frames.length < MAX_FRAMES

  return (
    <div
      className="flex flex-col min-h-0 w-full max-w-xl mx-auto overflow-x-hidden relative"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
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
          <p className="text-sm font-medium text-gray-700">Adding images…</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        onChange={handleSelectFiles}
        className="hidden"
        aria-label="Add more photos"
      />
      <ComicFlowHeader
        variant="edit"
        backTo={createPagePath(publishedSlug)}
        previewReturnTo={editPagePath(frameId, publishedSlug)}
      />

      <section
        className="shrink-0 w-full relative rounded-lg overflow-hidden "
        aria-label="Frame preview"
      >
        <div
          ref={previewContainerRef}
          className="relative w-full flex flex-col items-center"
        >
          <div className="relative inline-block max-w-full max-h-[70vh]">
            <img
              src={frame.imageUrl}
              alt=""
              className="max-w-full max-h-[70vh] w-auto h-auto object-contain block"
              draggable={false}
              decoding="async"
            />
            {editingOnImage ? (
              <div
                className="absolute flex flex-col items-center"
                style={{
                  left: `${frame.overlayPosition.x}%`,
                  top: `${frame.overlayPosition.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div
                  ref={styleToolbarRef}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 w-[80px] mb-1.5 flex flex-col gap-1.5 rounded-lg bg-white/95 backdrop-blur border border-gray-200 p-1.5 shadow-md"
                  onPointerDown={() => { toolbarInteractionRef.current = true }}
                >
                  <button
                    type="button"
                    onClick={() => colorInputRef.current?.click()}
                    className="w-7 h-7 rounded-full border border-gray-300 cursor-pointer shrink-0 overflow-hidden p-0 mx-auto"
                    style={{ backgroundColor: frame.fontColor }}
                    title="Pick text color"
                    aria-label="Pick text color"
                  />
                  <input
                    ref={colorInputRef}
                    type="color"
                    value={frame.fontColor}
                    onChange={(e) => updateFrame(frame.id, { fontColor: e.target.value })}
                    className="sr-only"
                    aria-hidden
                  />
                </div>
                <div
                  ref={overlayBoxRef}
                  className="cursor-text border-2 border-gray-400 rounded-lg p-2 min-w-[220px] max-w-[640px] min-h-[40px] flex items-center justify-center"
                  style={{
                    ...(savedOverlayWidth != null ? { width: `${savedOverlayWidth}px` } : {}),
                  }}
                >
                  <textarea
                    ref={overlayInputRef}
                    value={frame.caption}
                    onChange={(e) => {
                      updateFrame(frame.id, { caption: e.target.value })
                      const el = e.target
                      el.style.height = 'auto'
                      el.style.height = `${Math.max(28, el.scrollHeight)}px`
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const focusInToolbar = styleToolbarRef.current?.contains(document.activeElement)
                        if (!focusInToolbar && !toolbarInteractionRef.current) {
                          if (overlayBoxRef.current) {
                            setSavedOverlayWidth(overlayBoxRef.current.getBoundingClientRect().width)
                          }
                          setEditingOnImage(false)
                        }
                        toolbarInteractionRef.current = false
                      }, 120)
                    }}
                    placeholder={PLACEHOLDER_TEXT}
                    className="w-full min-w-[200px] min-h-[28px] bg-transparent border-0 outline-none resize-none overflow-hidden text-center placeholder-gray-400 py-0"
                    style={{
                      fontSize: `${frame.fontSize}px`,
                      color: frame.fontColor,
                      ...overlayFontStyle,
                      textShadow: COMIC_TEXT_STROKE_SHADOW,
                    }}
                    rows={1}
                    aria-label="Edit text on image"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            ) : (
              <div
                ref={overlayBoxRef}
                role="img"
                aria-label="Text on image - tap to edit"
                className="cursor-grab active:cursor-grabbing select-none touch-none border-2 border-transparent hover:border-gray-400 active:border-gray-400 transition-colors absolute rounded-lg p-2 min-w-[220px] max-w-[640px] min-h-[40px] flex items-center justify-center"
                style={{
                  left: `${frame.overlayPosition.x}%`,
                  top: `${frame.overlayPosition.y}%`,
                  transform: 'translate(-50%, -50%)',
                  ...(savedOverlayWidth != null ? { width: `${savedOverlayWidth}px` } : {}),
                }}
                onPointerDown={handleOverlayPointerDown}
                onPointerMove={handleOverlayPointerMove}
                onPointerUp={handleOverlayPointerUp}
                onPointerLeave={handleOverlayPointerLeaveOrCancel}
                onPointerCancel={handleOverlayPointerLeaveOrCancel}
              >
                <span
                  className="pointer-events-none whitespace-pre-wrap break-words text-center"
                  style={{
                    fontSize: `${frame.fontSize}px`,
                    color: frame.fontColor,
                    ...overlayFontStyle,
                    textShadow: COMIC_TEXT_STROKE_SHADOW,
                  }}
                >
                  {frame.caption.trim() || PLACEHOLDER_TEXT}
                </span>
                <svg
                  className="absolute bottom-0 right-0 w-4 h-4 text-gray-500 pointer-events-none"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zM8 16h2v2H8v-2zm6 0h2v2h-2v-2z" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </section>

      {frames.length >= 2 && (
        <div
          className="flex gap-2 overflow-x-auto overflow-y-hidden py-3 min-h-0 items-center min-w-0"
          role="tablist"
          aria-label="All frames"
        >
          {frames.map((f, index) => (
            <button
              key={f.id}
              type="button"
              onClick={() => goToFrame(index)}
              className={`shrink-0 w-[80px] h-[80px] rounded-lg overflow-hidden bg-gray-100 border-2 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors ${
                f.id === frameId ? 'border-gray-900 ring-2 ring-gray-400 ring-offset-2' : 'border-transparent hover:border-gray-300'
              }`}
              aria-label={`Frame ${index + 1}${f.id === frameId ? ', selected' : ''}`}
              aria-selected={f.id === frameId}
            >
              <img
                src={f.imageUrl}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                draggable={false}
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
          {canAddMore && (
            <button
              type="button"
              onClick={openFileInput}
              disabled={processingFiles}
              className="shrink-0 w-[80px] h-[80px] rounded-lg border-2 border-dashed border-gray-400 bg-gray-50 hover:border-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none"
              aria-label="Add more photos"
            >
              <span className="text-2xl font-light text-gray-500 leading-none" aria-hidden>+</span>
            </button>
          )}
        </div>
      )}

      {canAddMore && frames.length < 2 && (
        <div className="py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={openFileInput}
            disabled={processingFiles}
            className="btn-primary w-full max-w-[200px] mx-auto block"
          >
            + Add more photos
          </button>
        </div>
      )}

    </div>
  )
}
