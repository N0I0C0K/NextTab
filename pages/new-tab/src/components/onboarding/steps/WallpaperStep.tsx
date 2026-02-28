import { useState, useEffect, type FC } from 'react'
import { Text } from '@extension/ui'
import { settingStorage } from '@extension/storage'
import { t } from '@extension/i18n'
import { Image, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepNavigationProps, PresetWallpaper, WallhavenResponse } from '../types'
import { FALLBACK_WALLPAPERS } from '../types'
import { StepHeader, StepContainer, StepNavigationButtons } from '../components'

/** Number of wallpapers to display in the selection grid */
const WALLPAPER_COUNT = 6

export const WallpaperStep: FC<StepNavigationProps> = ({ onNext, onBack }) => {
  const [wallpapers, setWallpapers] = useState<PresetWallpaper[]>([])
  const [selectedWallpaper, setSelectedWallpaper] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const fetchWallpapers = async () => {
      try {
        const apiUrl = 'https://wallhaven.cc/api/v1/search?purity=100&topRange=1M&sorting=toplist'
        const response = await fetch(apiUrl, { signal: controller.signal })

        if (!response.ok) {
          throw new Error('Failed to fetch wallpapers')
        }

        const data: WallhavenResponse = await response.json()
        const fetchedWallpapers: PresetWallpaper[] = data.data.slice(0, WALLPAPER_COUNT).map(wp => ({
          id: wp.id,
          url: wp.path,
          thumbnail: wp.thumbs.small,
        }))

        setWallpapers(fetchedWallpapers)
        setError(null)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        console.error('Failed to fetch wallpapers from Wallhaven:', err)
        // Use fallback wallpapers if API fails
        setWallpapers(FALLBACK_WALLPAPERS)
        setError(t('onboardingWallpaperFetchError'))
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchWallpapers()

    return () => {
      controller.abort()
    }
  }, [])

  const handleSelect = (url: string) => {
    setSelectedWallpaper(url)
    settingStorage.update({ wallpaperUrl: url, wallpaperType: 'url' })
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="w-full h-[200px] flex items-center justify-center">
          <Text gray>{t('loading')}</Text>
        </div>
      )
    }

    return (
      <>
        {error && (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-500 text-sm mb-2">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3 w-full" role="radiogroup" aria-label={t('onboardingWallpaperTitle')}>
          {wallpapers.map(wallpaper => (
            <button
              key={wallpaper.id}
              onClick={() => handleSelect(wallpaper.url)}
              role="radio"
              aria-checked={selectedWallpaper === wallpaper.url}
              aria-label={`${t('onboardingWallpaperOption')} ${wallpaper.id}`}
              className={cn(
                'relative aspect-video rounded-lg overflow-hidden border-2 transition-all',
                selectedWallpaper === wallpaper.url
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-muted hover:border-muted-foreground/50',
              )}>
              <img src={wallpaper.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
              {selectedWallpaper === wallpaper.url && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <Check className="size-6 text-primary-foreground drop-shadow-md" aria-hidden="true" />
                </div>
              )}
            </button>
          ))}
        </div>
      </>
    )
  }

  return (
    <StepContainer>
      <StepHeader
        icon={<Image className="size-8 text-primary" />}
        title={t('onboardingWallpaperTitle')}
        description={t('onboardingWallpaperDescription')}
      />

      {renderContent()}

      <StepNavigationButtons onBack={onBack} onNext={onNext} onSkip={onNext} />
    </StepContainer>
  )
}
