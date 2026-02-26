import { useState, useEffect, type FC } from 'react'
import { Text } from '@extension/ui'
import { settingStorage } from '@extension/storage'
import { t } from '@extension/i18n'
import { Image, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepNavigationProps, PresetWallpaper, WallhavenResponse } from '../types'
import { FALLBACK_WALLPAPERS } from '../types'
import { StepHeader, StepContainer, StepNavigationButtons } from '../components'

const WALLPAPER_COUNT = 6

export const WallpaperStep: FC<StepNavigationProps> = ({ onNext, onBack }) => {
  const [wallpapers, setWallpapers] = useState<PresetWallpaper[]>([])
  const [selectedWallpaper, setSelectedWallpaper] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWallpapers = async () => {
      try {
        const apiUrl = 'https://wallhaven.cc/api/v1/search?purity=100&topRange=1M&sorting=toplist'
        const response = await fetch(apiUrl)

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
      } catch (error) {
        console.error('Failed to fetch wallpapers from Wallhaven:', error)
        // Use fallback wallpapers if API fails
        setWallpapers(FALLBACK_WALLPAPERS)
      } finally {
        setLoading(false)
      }
    }

    fetchWallpapers()
  }, [])

  const handleSelect = (url: string) => {
    setSelectedWallpaper(url)
    settingStorage.update({ wallpaperUrl: url, wallpaperType: 'url' })
  }

  return (
    <StepContainer>
      <StepHeader
        icon={<Image className="size-8 text-primary" />}
        title={t('onboardingWallpaperTitle')}
        description={t('onboardingWallpaperDescription')}
      />

      {loading ? (
        <div className="w-full h-[200px] flex items-center justify-center">
          <Text gray>{t('loading')}</Text>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 w-full">
          {wallpapers.map(wallpaper => (
            <button
              key={wallpaper.id}
              onClick={() => handleSelect(wallpaper.url)}
              className={cn(
                'relative aspect-video rounded-lg overflow-hidden border-2 transition-all',
                selectedWallpaper === wallpaper.url
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-muted hover:border-muted-foreground/50',
              )}>
              <img src={wallpaper.thumbnail} alt={wallpaper.id} className="w-full h-full object-cover" />
              {selectedWallpaper === wallpaper.url && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                  <Check className="size-6 text-primary-foreground drop-shadow-md" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <StepNavigationButtons onBack={onBack} onNext={onNext} />
    </StepContainer>
  )
}
