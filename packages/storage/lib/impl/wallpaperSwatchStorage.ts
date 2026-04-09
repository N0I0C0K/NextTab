import type { BaseStorage } from '../base/types'
import { createIndexedDBStorage } from '../base/indexeddb'

export type SemanticSwatchRole = 'Vibrant' | 'Muted' | 'DarkVibrant' | 'DarkMuted' | 'LightVibrant' | 'LightMuted'

export type CachedWallpaperSwatches = Partial<Record<SemanticSwatchRole, string>>

export type WallpaperSwatchCache = Record<string, CachedWallpaperSwatches>

type WallpaperSwatchStorage = BaseStorage<WallpaperSwatchCache> & {
  getSwatches: (cacheKey: string) => Promise<CachedWallpaperSwatches | null>
  setSwatches: (cacheKey: string, swatches: CachedWallpaperSwatches) => Promise<void>
}

const storage = createIndexedDBStorage<WallpaperSwatchCache>(
  'wallpaper-swatches',
  {},
  {
    dbName: 'nexttab-wallpaper-swatches',
    storeName: 'swatches',
    version: 1,
  },
)

export const wallpaperSwatchStorage: WallpaperSwatchStorage = {
  ...storage,
  getSwatches: async cacheKey => {
    const cache = await storage.get()
    return cache[cacheKey] ?? null
  },
  setSwatches: async (cacheKey, swatches) => {
    await storage.set(prev => ({
      ...prev,
      [cacheKey]: swatches,
    }))
  },
}
