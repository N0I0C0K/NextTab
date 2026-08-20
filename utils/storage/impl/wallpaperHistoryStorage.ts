import { storage } from 'wxt/utils/storage'
import { updateStorageItem } from '../core'

const MAX_HISTORY_SIZE = 10

export type WallpaperHistoryItem = { url: string; thumbnailUrl: string; addedAt: number }
export type WallpaperHistoryProps = { history: WallpaperHistoryItem[] }

export const wallpaperHistoryStorage = storage.defineItem<WallpaperHistoryProps>('local:wallpaper-history-storage', {
  fallback: { history: [] },
})

export async function addWallpaperHistory(url: string, thumbnailUrl: string): Promise<void> {
  await updateStorageItem(wallpaperHistoryStorage, current => ({
    history: [{ url, thumbnailUrl, addedAt: Date.now() }, ...current.history.filter(item => item.url !== url)].slice(
      0,
      MAX_HISTORY_SIZE,
    ),
  }))
}

export async function removeWallpaperHistory(url: string): Promise<void> {
  await updateStorageItem(wallpaperHistoryStorage, current => ({
    history: current.history.filter(item => item.url !== url),
  }))
}

export const clearWallpaperHistory = () => wallpaperHistoryStorage.setValue({ history: [] })
