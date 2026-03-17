import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'

/**
 * Maximum number of wallpapers to keep in history.
 * Older items are automatically removed when this limit is exceeded.
 */
const MAX_HISTORY_SIZE = 10

/**
 * Represents a single wallpaper history entry.
 * @property url - The full resolution wallpaper URL
 * @property thumbnailUrl - The thumbnail URL for preview display
 * @property addedAt - Unix timestamp when the wallpaper was added/last used
 */
export type WallpaperHistoryItem = {
  url: string
  thumbnailUrl: string
  addedAt: number
}

/**
 * The shape of the wallpaper history storage data.
 */
export type WallpaperHistoryProps = {
  history: WallpaperHistoryItem[]
}

/**
 * Extended storage type with wallpaper history management methods.
 */
type WallpaperHistoryStorage = BaseStorage<WallpaperHistoryProps> & {
  /**
   * Adds a wallpaper to history. If the wallpaper already exists,
   * it is moved to the front (most recent). History is limited to MAX_HISTORY_SIZE items.
   */
  addToHistory: (url: string, thumbnailUrl: string) => Promise<void>
  /**
   * Removes a specific wallpaper from history by its URL.
   */
  removeFromHistory: (url: string) => Promise<void>
  /**
   * Clears all wallpaper history.
   */
  clearHistory: () => Promise<void>
}

const defaultHistory: WallpaperHistoryProps = {
  history: [],
}

const storage = createStorage<WallpaperHistoryProps>('wallpaper-history-storage', defaultHistory, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
})

/**
 * Storage module for managing recently used wallpapers.
 * Stores up to 10 wallpapers with automatic deduplication.
 * When a duplicate is added, it moves to the front of the list.
 */
export const wallpaperHistoryStorage: WallpaperHistoryStorage = {
  ...storage,
  addToHistory: async (url: string, thumbnailUrl: string) => {
    const current = await storage.get()
    // Remove duplicate if exists (will be re-added at the front)
    const filtered = current.history.filter(item => item.url !== url)
    // Add new item at the beginning with current timestamp
    const newHistory = [{ url, thumbnailUrl, addedAt: Date.now() }, ...filtered].slice(0, MAX_HISTORY_SIZE)
    await storage.set({ history: newHistory })
  },
  removeFromHistory: async (url: string) => {
    const current = await storage.get()
    const filtered = current.history.filter(item => item.url !== url)
    await storage.set({ history: filtered })
  },
  clearHistory: async () => {
    await storage.set({ history: [] })
  },
}
