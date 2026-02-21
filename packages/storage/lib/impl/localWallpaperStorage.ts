import type { BaseStorage } from '../base/types'
import { createIndexedDBStorage } from '../base/indexeddb'

export type LocalWallpaperData = {
  imageData: string | null
}

type LocalWallpaperStorage = BaseStorage<LocalWallpaperData> & {
  /** Sets or clears the local wallpaper image data. Pass null to clear. */
  setImageData: (imageData: string | null) => Promise<void>
}

const storage = createIndexedDBStorage<LocalWallpaperData>(
  'local-wallpaper',
  { imageData: null },
  {
    dbName: 'nexttab-local-wallpaper',
    storeName: 'wallpaper',
    version: 1,
  },
)

/**
 * IndexedDB-backed storage for the user's local (device-specific) wallpaper.
 *
 * Intentionally NOT based on chrome.storage so that:
 *  1. Large base64 blobs do not eat into the ~10 MB chrome.storage.local quota.
 *  2. The image is never accidentally synced via chrome.storage.sync.
 */
export const localWallpaperStorage: LocalWallpaperStorage = {
  ...storage,
  setImageData: imageData => storage.set({ imageData }),
}
