import { cn } from '@/lib/utils'
import { useStorage } from '@extension/shared'
import { settingStorage, localWallpaperStorage } from '@extension/storage'
import { Button, Stack, Text } from '@extension/ui'
import { Check, Upload, Trash2 } from 'lucide-react'
import { useCallback, useRef, useState, type FC } from 'react'
import { t } from '@extension/i18n'
import { WallpaperImage } from './WallpaperImage'

/** Maximum allowed file size for local wallpaper upload (5 MB). */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/** Accepted image MIME types for the file picker. */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      const result = e.target?.result
      typeof result === 'string' ? resolve(result) : reject(new Error('Unexpected FileReader result type'))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Self-contained section for managing a local (device-specific) wallpaper.
 *
 * - File selection, validation, and upload are handled entirely here.
 * - Image data is persisted in IndexedDB via `localWallpaperStorage`,
 *   keeping it out of the chrome.storage quota.
 * - `settingStorage.wallpaperType` is updated to reflect the active source.
 */
export const LocalWallpaperSection: FC = () => {
  const settings = useStorage(settingStorage)
  const localWallpaper = useStorage(localWallpaperStorage)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isSelected = settings.wallpaperType === 'local'

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset immediately so the same file can be re-selected next time
    e.target.value = ''
    if (!file) return

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError(t('localWallpaperInvalidType'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(t('localWallpaperTooLarge'))
      return
    }

    setError(null)
    try {
      const imageData = await readFileAsDataURL(file)
      await localWallpaperStorage.setImageData(imageData)
      await settingStorage.update({ wallpaperType: 'local' })
    } catch (err) {
      console.error('Failed to save local wallpaper:', err)
      setError(t('localWallpaperStorageError'))
    }
  }, [])

  const handleSelect = useCallback(async () => {
    await settingStorage.update({ wallpaperType: 'local' })
  }, [])

  const handleClear = useCallback(async () => {
    await localWallpaperStorage.setImageData(null)
    await settingStorage.update({ wallpaperType: 'url' })
  }, [])

  return (
    <>
      <Stack direction={'row'} className="items-center justify-between">
        <Stack direction={'row'} className="items-center gap-1">
          <Upload className="size-4 text-muted-foreground" />
          <Text gray level="s">
            {t('localWallpaper')}
          </Text>
        </Stack>
        <Stack direction={'row'} className="items-center gap-1">
          {localWallpaper.imageData && (
            <Button variant="ghost" size="sm" onClick={handleClear} aria-label={t('clearLocalWallpaper')}>
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleUploadClick}>
            <Upload className="size-4 mr-1" />
            {t('uploadLocalWallpaper')}
          </Button>
        </Stack>
      </Stack>

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={handleFileChange}
      />

      {error && (
        <div className="rounded-md bg-destructive/10 p-3">
          <Text level="s" className="text-destructive">
            {error}
          </Text>
        </div>
      )}

      {localWallpaper.imageData && (
        <div
          className={cn(
            `relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all hover:scale-[1.02] w-full
            max-w-[200px]`,
            isSelected
              ? 'border-primary ring-2 ring-primary/50'
              : 'border-transparent hover:border-muted-foreground/30',
          )}
          role="button"
          tabIndex={0}
          aria-label={t('selectLocalWallpaper')}
          onClick={handleSelect}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleSelect()
            }
          }}>
          <WallpaperImage src={localWallpaper.imageData} alt="Local wallpaper" />
          {isSelected && (
            <div className="absolute right-1 top-1 rounded-full bg-primary p-1">
              <Check className="size-3 text-primary-foreground" />
            </div>
          )}
        </div>
      )}
    </>
  )
}
