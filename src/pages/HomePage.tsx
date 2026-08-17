import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { prepareImage } from '../lib/prepareImage'
import { useComicStore } from '../stores/useComicStore'

const MAX_FRAMES = 12

const entryButtonClass =
  'flex-1 min-w-0 min-h-[200px] flex items-center justify-center p-2.5 bg-white border border-dashed border-black hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-muted focus:ring-offset-2 disabled:opacity-50'

export function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)
  const { frames, addFrames } = useComicStore()

  const openFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleSelectFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    const fileList = Array.from(files)
    e.target.value = ''
    const remaining = MAX_FRAMES - frames.length
    const toProcess = fileList.slice(0, remaining)
    if (toProcess.length === 0) {
      navigate('/create')
      return
    }
    setProcessing(true)
    try {
      const converted = await Promise.all(toProcess.map((f) => prepareImage(f)))
      addFrames(converted)
      navigate('/create')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4 self-stretch">
        <h1 className="text-[16px] leading-normal font-bold text-black whitespace-nowrap">
          Sequence, a comic maker
        </h1>
        {user && (
          <Link
            to="/profile"
            aria-label="Go to profile"
            className="w-5 h-5 shrink-0 text-black hover:opacity-70 transition-opacity"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </Link>
        )}
      </header>

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

      <div className="flex items-stretch gap-6 self-stretch">
        <button
          type="button"
          onClick={openFileInput}
          disabled={processing}
          className={entryButtonClass}
          aria-label="Upload photos"
        >
          <span className="text-[16px] leading-normal font-bold text-black whitespace-nowrap">
            {processing ? 'Uploading…' : 'Upload Photos'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/create?view=list&focus=first')}
          disabled={processing}
          className={entryButtonClass}
          aria-label="Describe a feeling"
        >
          <span className="text-[16px] leading-normal font-bold text-black whitespace-nowrap">
            Describe a feeling
          </span>
        </button>
      </div>
    </div>
  )
}
