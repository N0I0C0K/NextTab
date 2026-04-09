import { useCallback, useEffect, useRef } from 'react'
import { getSwatchesSync } from 'colorthief'
import { useStorage } from '@extension/shared'
import { wallpaperSwatchStorage, settingStorage } from '@extension/storage'
import type { SwatchRole, SwatchData } from '@extension/storage'

/**
 * Priority order for auto-selecting a swatch role.
 * DarkMuted → DarkVibrant are preferred because wallpaper backgrounds tend to
 * be lighter overall, so dark swatches produce better-contrasting text colors.
 */
const AUTO_PRIORITY: SwatchRole[] = ['DarkMuted', 'DarkVibrant', 'Vibrant', 'Muted', 'LightVibrant', 'LightMuted']

/**
 * Resolves the active swatch from the cache, given a user-selected role (or null for auto).
 */
export function resolveActiveSwatch(
  swatches: Partial<Record<SwatchRole, SwatchData | null>>,
  selectedRole: SwatchRole | null,
): SwatchData | null {
  if (selectedRole) {
    return swatches[selectedRole] ?? null
  }
  // Auto: pick the first available swatch in priority order
  for (const role of AUTO_PRIORITY) {
    const swatch = swatches[role]
    if (swatch) return swatch
  }
  return null
}

/**
 * Hook that extracts semantic swatches from the current wallpaper image and
 * caches the result. Re-extracts only when the wallpaper source changes.
 */
export function useWallpaperSwatches(wallpaperSrc: string) {
  const swatchCache = useStorage(wallpaperSwatchStorage)
  const settings = useStorage(settingStorage)
  const extractingRef = useRef(false)

  const extractSwatches = useCallback(
    async (src: string) => {
      if (extractingRef.current) return
      extractingRef.current = true

      try {
        const img = new Image()
        img.crossOrigin = 'anonymous'

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('Failed to load image for swatch extraction'))
          img.src = src
        })

        const swatchMap = getSwatchesSync(img)

        const serialised: Partial<Record<SwatchRole, SwatchData | null>> = {}
        for (const [role, swatch] of Object.entries(swatchMap)) {
          if (swatch) {
            serialised[role as SwatchRole] = {
              role: role as SwatchRole,
              colorHex: swatch.color.hex(),
              titleTextColorHex: swatch.titleTextColor.hex(),
              bodyTextColorHex: swatch.bodyTextColor.hex(),
            }
          } else {
            serialised[role as SwatchRole] = null
          }
        }

        await wallpaperSwatchStorage.setCache(src, serialised)
      } catch (err) {
        console.warn('Wallpaper swatch extraction failed:', err)
      } finally {
        extractingRef.current = false
      }
    },
    [],
  )

  useEffect(() => {
    if (!wallpaperSrc) return
    // Only re-extract if wallpaper changed
    if (swatchCache.wallpaperId === wallpaperSrc) return
    extractSwatches(wallpaperSrc)
  }, [wallpaperSrc, swatchCache.wallpaperId, extractSwatches])

  const activeSwatch = resolveActiveSwatch(swatchCache.swatches, settings.selectedSwatchRole)

  return {
    swatchCache,
    activeSwatch,
  }
}
