import type { ComicFrame, FontFamilyId, OverlayPosition } from '../stores/useComicStore'

const DRAFT_KEY = 'comic-draft'
const DRAFT_VERSION = 1
const IDB_NAME = 'comic-draft-db'
const IDB_STORE = 'draft'
const IDB_KEY = 'current'

export interface DraftFrameMeta {
  id: string
  caption: string
  overlayText: string
  overlayPosition: OverlayPosition
  textMode: ComicFrame['textMode']
  fontSize: number
  fontColor: string
  fontFamily?: FontFamilyId
}

/** Frame as stored in IndexedDB (includes Blob for image). */
export interface DraftFrameStored extends DraftFrameMeta {
  imageBlob: Blob
}

export interface DraftPayloadStored {
  version: number
  title?: string
  frames: DraftFrameStored[]
}

/** Legacy localStorage frame shape (base64 data URL). */
export interface DraftFrameLegacy extends DraftFrameMeta {
  imageDataUrl: string
}

export interface DraftPayloadLegacy {
  version: number
  title?: string
  frames: DraftFrameLegacy[]
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
  })
  return dbPromise
}

export async function getDraft(): Promise<DraftPayloadStored | null> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const req = store.get(IDB_KEY)
      req.onsuccess = () => {
        const data = req.result as DraftPayloadStored | undefined
        if (!data || data.version !== DRAFT_VERSION || !Array.isArray(data.frames)) {
          resolve(null)
          return
        }
        resolve(data)
      }
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('IndexedDB quota exceeded when reading draft.')
    }
    return null
  }
}

export async function setDraft(payload: DraftPayloadStored): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.put(payload, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('Draft too large for IndexedDB; some data may not be saved.')
    }
    throw e
  }
}

export async function clearDraft(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      store.delete(IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}

/** Convert a data URL to a Blob (for migrating from localStorage). */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => r.blob())
}

/** Get legacy draft from localStorage if present (sync). */
export function getLegacyDraft(): DraftPayloadLegacy | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as DraftPayloadLegacy
    if (data.version !== DRAFT_VERSION || !Array.isArray(data.frames)) return null
    return data
  } catch {
    return null
  }
}

/** Remove legacy draft from localStorage after migration. */
export function clearLegacyDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    // ignore
  }
}
