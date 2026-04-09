import { StorageEnum } from '../base/enums'
import { createStorage } from '../base/base'
import type { BaseStorage } from '../base/types'

/**
 * Semantic swatch role names matching colorthief's SwatchRole type.
 */
export type SwatchRole = 'Vibrant' | 'Muted' | 'DarkVibrant' | 'DarkMuted' | 'LightVibrant' | 'LightMuted'

export const SWATCH_ROLES: SwatchRole[] = ['Vibrant', 'Muted', 'DarkVibrant', 'DarkMuted', 'LightVibrant', 'LightMuted']

/**
 * Serialised swatch data (hex strings to avoid storing complex Color objects).
 */
export type SwatchData = {
  role: SwatchRole
  colorHex: string
  titleTextColorHex: string
  bodyTextColorHex: string
}

/**
 * Cached swatch extraction result for the current wallpaper.
 */
export type WallpaperSwatchCache = {
  /** Identifier of the wallpaper this cache belongs to (URL or 'local') */
  wallpaperId: string | null
  /** Extracted semantic swatches (null entries mean the role had no match) */
  swatches: Partial<Record<SwatchRole, SwatchData | null>>
}

type WallpaperSwatchStorage = BaseStorage<WallpaperSwatchCache> & {
  /** Replace the entire cache for a new wallpaper */
  setCache: (wallpaperId: string, swatches: Partial<Record<SwatchRole, SwatchData | null>>) => Promise<void>
  /** Clear the cache */
  clearCache: () => Promise<void>
}

const defaultCache: WallpaperSwatchCache = {
  wallpaperId: null,
  swatches: {},
}

const storage = createStorage<WallpaperSwatchCache>('wallpaper-swatch-cache', defaultCache, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
})

export const wallpaperSwatchStorage: WallpaperSwatchStorage = {
  ...storage,
  setCache: async (wallpaperId, swatches) => {
    await storage.set({ wallpaperId, swatches })
  },
  clearCache: async () => {
    await storage.set(defaultCache)
  },
}
