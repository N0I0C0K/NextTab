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

// Keep enough palette depth for vibrant/muted pairs while staying fast on large wallpapers by
// sampling every fifth pixel during extraction.
const SEMANTIC_SWATCH_COLOR_COUNT = 8
const SEMANTIC_SWATCH_QUALITY = 5
const FNV1A_OFFSET_BASIS = 0x811c9dc5
const FNV1A_PRIME = 0x01000193

type LoadedSwatchImage = {
  image: HTMLImageElement
  cleanup?: () => void
}

function serializeSwatches(swatches: SwatchMap): CachedWallpaperSwatches {
  return SWATCH_ROLES.reduce<CachedWallpaperSwatches>((serializedSwatches, role) => {
    const swatch = swatches[role]

    if (!swatch) {
      return serializedSwatches
    }

    serializedSwatches[role] = swatch.color.toString()
    return serializedSwatches
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

async function loadSwatchImage(src: string, wallpaperType: WallpaperType): Promise<LoadedSwatchImage> {
  if (wallpaperType === 'url') {
    try {
      const response = await fetch(src)

      if (response.ok) {
        const objectUrl = URL.createObjectURL(await response.blob())

        return {
          image: await loadImageForSwatches(objectUrl, 'local'),
          cleanup: () => URL.revokeObjectURL(objectUrl),
        }
      }
    } catch (error) {
      console.warn('Failed to fetch wallpaper blob for swatch extraction, falling back to direct image loading:', error)
    }
  }

  return {
    image: await loadImageForSwatches(src, wallpaperType),
  }
}

// FNV-1a provides a tiny deterministic fallback hash for cache keys when Web Crypto is unavailable.
function createFallbackHash(input: string): string {
  let hash = FNV1A_OFFSET_BASIS

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, FNV1A_PRIME)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

async function createCacheKey(wallpaperSrc: string, wallpaperType: WallpaperType): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return `fnv1a:${wallpaperType}:${createFallbackHash(wallpaperSrc)}`
  }

  const encoded = new TextEncoder().encode(`${wallpaperType}:${wallpaperSrc}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)

  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Resolves semantic time/date colors for the active wallpaper.
 *
 * `wallpaperVersion` is incremented when the visible wallpaper image finishes loading so this hook
 * can re-run extraction against the newly loaded wallpaper instead of stale image state.
 */
export function useWallpaperSemanticColors(wallpaperSrc: string, wallpaperType: WallpaperType, wallpaperVersion: number) {
  const { realTheme } = useTheme()
  const [swatches, setSwatches] = useState<CachedWallpaperSwatches | null>(null)

  useEffect(() => {
    let isActive = true

    const readSwatches = async () => {
      setSwatches(null)

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

        // The calling effect guards stale updates with `isActive`; loaded image objects are short-lived
        // and any blob URLs created here are revoked in the cleanup block below.
        const { image, cleanup } = await loadSwatchImage(wallpaperSrc, wallpaperType)

        try {
          const extractedSwatches = serializeSwatches(
            await getSwatches(image, {
              colorCount: SEMANTIC_SWATCH_COLOR_COUNT,
              quality: SEMANTIC_SWATCH_QUALITY,
            }),
          )

          if (!isActive) {
            return
          }

          setSwatches(extractedSwatches)

          if (Object.keys(extractedSwatches).length > 0) {
            await wallpaperSwatchStorage.setSwatches(cacheKey, extractedSwatches)
          }
        } finally {
          cleanup?.()
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
  }, [wallpaperSrc, wallpaperType, wallpaperVersion])

  return selectColors(swatches, realTheme)
}
