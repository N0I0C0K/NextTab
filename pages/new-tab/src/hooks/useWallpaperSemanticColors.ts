import { wallpaperSwatchStorage } from '@extension/storage'
import type { CachedWallpaperSwatches, SemanticSwatchRole, WallpaperType } from '@extension/storage'
import { useTheme } from '@extension/ui'
import { getSwatches } from 'colorthief'
import type { SwatchMap } from 'colorthief'
import { useEffect, useState } from 'react'

type TimeDisplayColors = {
  time: string
  date: string
}

const SWATCH_ROLES: SemanticSwatchRole[] = [
  'Vibrant',
  'Muted',
  'DarkVibrant',
  'DarkMuted',
  'LightVibrant',
  'LightMuted',
]

const DEFAULT_COLORS: Record<'dark' | 'light', TimeDisplayColors> = {
  dark: {
    time: '#f8fafc',
    date: '#cbd5e1',
  },
  light: {
    time: '#0f172a',
    date: '#334155',
  },
}

function serializeSwatches(swatches: SwatchMap): CachedWallpaperSwatches {
  return SWATCH_ROLES.reduce<CachedWallpaperSwatches>((result, role) => {
    const swatch = swatches[role]

    if (!swatch) {
      return result
    }

    result[role] = swatch.color.toString()
    return result
  }, {})
}

function selectColors(swatches: CachedWallpaperSwatches | null, theme: 'dark' | 'light'): TimeDisplayColors {
  const preferredPair: { time: SemanticSwatchRole; date: SemanticSwatchRole } =
    theme === 'dark'
      ? { time: 'DarkVibrant', date: 'DarkMuted' }
      : { time: 'LightVibrant', date: 'LightMuted' }
  const fallbackPair: { time: SemanticSwatchRole; date: SemanticSwatchRole } = { time: 'Vibrant', date: 'Muted' }
  const preferredTime = swatches?.[preferredPair.time]
  const preferredDate = swatches?.[preferredPair.date]
  const fallbackTime = swatches?.[fallbackPair.time]
  const fallbackDate = swatches?.[fallbackPair.date]

  if (preferredTime && preferredDate) {
    return {
      time: preferredTime,
      date: preferredDate,
    }
  }

  if (fallbackTime && fallbackDate) {
    return {
      time: fallbackTime,
      date: fallbackDate,
    }
  }

  return DEFAULT_COLORS[theme]
}

function loadImageForSwatches(src: string, wallpaperType: WallpaperType): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'

    if (wallpaperType === 'url') {
      image.crossOrigin = 'anonymous'
      image.referrerPolicy = 'no-referrer'
    }

    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load wallpaper for swatch extraction'))
    image.src = src
  })
}

async function createCacheKey(wallpaperSrc: string, wallpaperType: WallpaperType): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `${wallpaperType}:${wallpaperSrc}`
  }

  const encoded = new TextEncoder().encode(`${wallpaperType}:${wallpaperSrc}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)

  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}

export function useWallpaperSemanticColors(wallpaperSrc: string, wallpaperType: WallpaperType) {
  const { realTheme } = useTheme()
  const [swatches, setSwatches] = useState<CachedWallpaperSwatches | null>(null)

  useEffect(() => {
    let isActive = true

    const readSwatches = async () => {
      try {
        const cacheKey = await createCacheKey(wallpaperSrc, wallpaperType)
        const cachedSwatches = await wallpaperSwatchStorage.getSwatches(cacheKey)

        if (!isActive) {
          return
        }

        if (cachedSwatches) {
          setSwatches(cachedSwatches)
          return
        }

        const image = await loadImageForSwatches(wallpaperSrc, wallpaperType)
        // Use a compact palette size with moderate sampling so wallpaper switches stay responsive
        // while still yielding stable semantic swatches for the time/date pair selection.
        const extractedSwatches = serializeSwatches(await getSwatches(image, { colorCount: 8, quality: 5 }))

        if (!isActive) {
          return
        }

        setSwatches(extractedSwatches)

        if (Object.keys(extractedSwatches).length > 0) {
          await wallpaperSwatchStorage.setSwatches(cacheKey, extractedSwatches)
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        console.warn('Failed to extract wallpaper semantic swatches:', error)
        setSwatches(null)
      }
    }

    void readSwatches()

    return () => {
      isActive = false
    }
  }, [wallpaperSrc, wallpaperType])

  return selectColors(swatches, realTheme)
}
