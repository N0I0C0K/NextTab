import { cn } from '@/lib/utils'
import { useStorage } from '@extension/shared'
import { localWallpaperStorage, settingStorage, wallpaperHistoryStorage } from '@extension/storage'
import type { WallhavenSortMode, WallpaperType } from '@extension/storage'
import {
  Button,
  Stack,
  Text,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@extension/ui'
import { Check, Loader2, RefreshCw, History, Trash2, X, Link, Image as WallpaperIcon } from 'lucide-react'
import { type FC, useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@extension/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { useWallpaperPanel } from '@src/provider'
import { WallpaperImage } from '../settings/WallpaperImage'
import { LocalWallpaperSection } from '../settings/LocalWallpaperSection'

// Scroll threshold in pixels to trigger loading more wallpapers
const SCROLL_THRESHOLD = 100

// Minimum time between API requests in milliseconds (to avoid rate limiting)
const API_REQUEST_THROTTLE = 1000

interface WallhavenThumb {
  large: string
  original: string
  small: string
}

interface WallhavenWallpaper {
  id: string
  path: string
  thumbs: WallhavenThumb
  resolution: string
  colors: string[]
}

interface WallhavenResponse {
  data: WallhavenWallpaper[]
  meta: {
    current_page: number
    last_page: number
    per_page: number
    total: number
  }
}

const WallpaperCard: FC<{
  wallpaper: WallhavenWallpaper
  isSelected: boolean
  onSelect: (url: string, thumbnailUrl: string) => void
}> = ({ wallpaper, isSelected, onSelect }) => {
  return (
    <button
      type="button"
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all hover:scale-[1.02] w-full',
        isSelected ? 'border-primary ring-2 ring-primary/50' : 'border-transparent hover:border-muted-foreground/30',
      )}
      onClick={() => onSelect(wallpaper.path, wallpaper.thumbs.small)}>
      <WallpaperImage src={wallpaper.thumbs.small} alt={`Wallpaper (${wallpaper.resolution})`} />
      {isSelected && (
        <div className="absolute right-1 top-1 rounded-full bg-primary p-1">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
        <Text level="xs" className="text-white">
          {wallpaper.resolution}
        </Text>
      </div>
    </button>
  )
}

const HistoryWallpaperCard: FC<{
  url: string
  thumbnailUrl: string
  isSelected: boolean
  onSelect: (url: string, thumbnailUrl: string) => void
  onDelete: (url: string) => void
}> = ({ url, thumbnailUrl, isSelected, onSelect, onDelete }) => {
  const handleDelete = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation()
      onDelete(url)
    },
    [onDelete, url],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleDelete(e)
      } else if (e.key === ' ') {
        e.preventDefault()
        handleDelete(e)
      }
    },
    [handleDelete],
  )

  return (
    <div
      className={cn(
        'relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all hover:scale-[1.02] w-full group',
        isSelected ? 'border-primary ring-2 ring-primary/50' : 'border-transparent hover:border-muted-foreground/30',
      )}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(url, thumbnailUrl)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(url, thumbnailUrl)
      }}>
      <WallpaperImage src={thumbnailUrl} alt="History wallpaper" />
      {isSelected && (
        <div className="absolute right-1 top-1 rounded-full bg-primary p-1">
          <Check className="size-3 text-primary-foreground" />
        </div>
      )}
      <button
        type="button"
        className="absolute left-1 top-1 rounded-full bg-destructive/80 p-1 opacity-0 transition-opacity
          group-hover:opacity-100"
        onClick={handleDelete}
        onKeyDown={handleKeyDown}
        aria-label="Delete from history">
        <X className="size-3 text-destructive-foreground" />
      </button>
    </div>
  )
}

const WallpaperPanelContent: FC = () => {
  const settings = useStorage(settingStorage)
  const historyData = useStorage(wallpaperHistoryStorage)
  const [wallpapers, setWallpapers] = useState<WallhavenWallpaper[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  // Use refs to track loading state and last request time to prevent race conditions
  const isLoadingRef = useRef(false)
  const lastRequestTimeRef = useRef(0)

  // Use ref to track current sort mode to avoid stale closures
  const sortModeRef = useRef(settings.wallhavenSortMode)
  sortModeRef.current = settings.wallhavenSortMode

  // Toast confirmation state refs
  const pendingToastRef = useRef<string | number | null>(null)
  const toastActionTakenRef = useRef(false)

  const fetchWallpapers = useCallback(async (page: number, append = false) => {
    if (isLoadingRef.current) return

    const now = Date.now()
    if (now - lastRequestTimeRef.current < API_REQUEST_THROTTLE) return

    isLoadingRef.current = true
    lastRequestTimeRef.current = now

    if (page === 1) {
      setIsLoading(true)
    } else {
      setIsLoadingMore(true)
    }
    setError(null)

    try {
      const currentSortMode = sortModeRef.current
      let apiUrl = `https://wallhaven.cc/api/v1/search?purity=100&page=${page}`

      if (currentSortMode === 'toplist') {
        apiUrl += '&topRange=1M&sorting=toplist'
      } else {
        apiUrl += '&sorting=random'
      }

      const response = await fetch(apiUrl)

      if (response.status === 429) {
        setError(t('wallpaperRateLimitError'))
        return
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch wallpapers: ${response.statusText}`)
      }
      const data: WallhavenResponse = await response.json()
      if (append) {
        setWallpapers(prev => [...prev, ...data.data])
      } else {
        setWallpapers(data.data)
      }
      setCurrentPage(data.meta.current_page)
      setHasMore(data.meta.current_page < data.meta.last_page)
    } catch (err) {
      console.error('Failed to fetch wallpapers:', err)
      setError(t('wallpaperFetchError'))
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
      isLoadingRef.current = false
    }
  }, [])

  useEffect(() => {
    fetchWallpapers(1)
  }, [fetchWallpapers])

  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

  const hasMoreRef = useRef(hasMore)
  hasMoreRef.current = hasMore

  const getViewport = useCallback(() => {
    return scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement | null
  }, [])

  const handleScroll = useCallback(() => {
    if (isLoadingRef.current || !hasMoreRef.current) return

    const container = viewportRef.current ?? getViewport()
    if (!container) return

    const scrollTop = container.scrollTop
    const scrollHeight = container.scrollHeight
    const clientHeight = container.clientHeight

    if (scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD) {
      fetchWallpapers(currentPageRef.current + 1, true)
    }
  }, [fetchWallpapers, getViewport])

  useEffect(() => {
    const attachScrollListener = () => {
      const nextViewport = getViewport()
      if (!nextViewport || viewportRef.current === nextViewport) return

      if (viewportRef.current) {
        viewportRef.current.removeEventListener('scroll', handleScroll)
      }

      nextViewport.addEventListener('scroll', handleScroll)
      viewportRef.current = nextViewport
    }

    attachScrollListener()

    const frameId = window.requestAnimationFrame(attachScrollListener)

    return () => {
      window.cancelAnimationFrame(frameId)
      if (viewportRef.current) {
        viewportRef.current.removeEventListener('scroll', handleScroll)
        viewportRef.current = null
      }
    }
  }, [getViewport, handleScroll, isLoading, wallpapers.length])

  const handleRefresh = useCallback(() => {
    setCurrentPage(1)
    setHasMore(true)
    fetchWallpapers(1)
  }, [fetchWallpapers])

  const handleSortModeChange = useCallback(
    async (mode: WallhavenSortMode) => {
      await settingStorage.update({ wallhavenSortMode: mode })
      setCurrentPage(1)
      setHasMore(true)
      setWallpapers([])
      sortModeRef.current = mode
      fetchWallpapers(1, false)
    },
    [fetchWallpapers],
  )

  const showConfirmationToast = useCallback(
    (url: string, thumbnailUrl: string, previousWallpaperUrl: string | null, previousWallpaperType: WallpaperType) => {
      // Dismiss any existing confirmation toast
      if (pendingToastRef.current !== null) {
        toast.dismiss(pendingToastRef.current)
      }
      toastActionTakenRef.current = false

      const addToHistory = () => {
        wallpaperHistoryStorage.addToHistory(url, thumbnailUrl)
      }
      const revert = () => {
        settingStorage.update({ wallpaperUrl: previousWallpaperUrl, wallpaperType: previousWallpaperType })
      }

      const toastId = toast(t('wallpaperKeepOrUndo'), {
        position: 'top-center',
        duration: 8000,
        actionButtonStyle: {
          borderRadius: '9999px',
          paddingInline: '12px',
          fontWeight: 600,
        },
        cancelButtonStyle: {
          borderRadius: '9999px',
          paddingInline: '12px',
          fontWeight: 600,
          background: 'rgba(220, 38, 38, 0.18)',
          color: 'rgb(254, 226, 226)',
          border: '1px solid rgba(248, 113, 113, 0.45)',
        },
        action: {
          label: t('wallpaperKeep'),
          onClick: () => {
            toastActionTakenRef.current = true
            addToHistory()
            pendingToastRef.current = null
          },
        },
        cancel: {
          label: t('wallpaperUndo'),
          onClick: () => {
            toastActionTakenRef.current = true
            revert()
            pendingToastRef.current = null
          },
        },
        onAutoClose: () => {
          if (!toastActionTakenRef.current) {
            addToHistory()
          }
          pendingToastRef.current = null
        },
        onDismiss: () => {
          if (!toastActionTakenRef.current) {
            addToHistory()
          }
          pendingToastRef.current = null
        },
      })

      pendingToastRef.current = toastId
    },
    [],
  )

  const handleSelectWallpaper = useCallback(
    async (url: string, thumbnailUrl: string) => {
      try {
        const urlObj = new URL(url)
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          setError(t('wallpaperInvalidUrlError'))
          return
        }
      } catch {
        setError(t('wallpaperInvalidUrlError'))
        return
      }

      const currentSettings = await settingStorage.get()
      const prevUrl = currentSettings.wallpaperUrl
      const prevType = currentSettings.wallpaperType

      await settingStorage.update({ wallpaperUrl: url, wallpaperType: 'url' })
      showConfirmationToast(url, thumbnailUrl, prevUrl, prevType)
    },
    [showConfirmationToast],
  )

  const handleClearHistory = useCallback(async () => {
    await wallpaperHistoryStorage.clearHistory()
  }, [])

  const handleDeleteHistoryItem = useCallback(async (url: string) => {
    await wallpaperHistoryStorage.removeFromHistory(url)
  }, [])

  return (
    <Stack direction={'column'} className={'gap-3 w-full pb-2'}>
      <div className="rounded-xl border border-white/10 bg-white/10 dark:bg-black/15 backdrop-blur-md p-3 shadow-sm">
        <Stack direction={'row'} className="items-center gap-2">
          <Link className="size-4 text-white/70" />
          <Text level="s" className="text-white/80">
            {t('customWallpaperUrl')}
          </Text>
        </Stack>
        <Input
          className="mt-2 bg-white/10 border-white/20 text-white placeholder:text-white/40"
          placeholder={t('enterWallpaperUrl')}
          value={settings.wallpaperUrl || ''}
          onChange={e => {
            const newUrl = e.target.value
            if (newUrl && settings.wallpaperType === 'local') {
              settingStorage.update({ wallpaperUrl: newUrl, wallpaperType: 'url' })
            } else {
              settingStorage.update({ wallpaperUrl: newUrl })
            }
          }}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/10 dark:bg-black/15 backdrop-blur-md p-3 shadow-sm">
        <Stack direction={'row'} className="items-start justify-between gap-3">
          <div>
            <Text level="s" className="text-white/80">
              {t('wallpaperSettingsDescription')}
            </Text>
          </div>
          <Stack direction={'row'} className="items-center gap-2">
            <Select
              value={settings.wallhavenSortMode}
              onValueChange={value => handleSortModeChange(value as WallhavenSortMode)}
              disabled={isLoading}>
              <SelectTrigger className="h-9 w-[128px] bg-white/15 border-white/20 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="toplist">{t('wallhavenToplist')}</SelectItem>
                <SelectItem value="random">{t('wallhavenRandom')}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="bg-white/15 border-white/20 text-white">
              <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
            </Button>
          </Stack>
        </Stack>

        {error && (
          <div className="mt-2 rounded-xl bg-destructive/20 p-3 text-center">
            <Text level="s" className="text-destructive">
              {error}
            </Text>
          </div>
        )}

        {isLoading && wallpapers.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea ref={scrollAreaRef} className="mt-3 h-52 pr-2">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {wallpapers.map(wallpaper => (
                <WallpaperCard
                  key={wallpaper.id}
                  wallpaper={wallpaper}
                  isSelected={settings.wallpaperType === 'url' && settings.wallpaperUrl === wallpaper.path}
                  onSelect={handleSelectWallpaper}
                />
              ))}
            </div>
            {isLoadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {!hasMore && wallpapers.length > 0 && (
              <div className="py-4 text-center">
                <Text gray level="xs">
                  {t('noMoreWallpapers')}
                </Text>
              </div>
            )}
          </ScrollArea>
        )}
      </div>

      {historyData.history.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/10 dark:bg-black/15 backdrop-blur-md p-3 shadow-sm">
          <Stack direction={'row'} className="items-center justify-between">
            <Stack direction={'row'} className="items-center gap-1">
              <History className="size-4 text-white/70" />
              <Text level="s" className="text-white/80">
                {t('historyWallpapers')}
              </Text>
            </Stack>
            <Button variant="ghost" size="sm" onClick={handleClearHistory}>
              <Trash2 className="size-4" />
            </Button>
          </Stack>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
            {historyData.history.map(item => (
              <HistoryWallpaperCard
                key={item.url}
                url={item.url}
                thumbnailUrl={item.thumbnailUrl}
                isSelected={settings.wallpaperType === 'url' && settings.wallpaperUrl === item.url}
                onSelect={handleSelectWallpaper}
                onDelete={handleDeleteHistoryItem}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/10 dark:bg-black/15 backdrop-blur-md p-3 shadow-sm">
        <LocalWallpaperSection />
      </div>
    </Stack>
  )
}

export const WallpaperPanel: FC = () => {
  const { isOpen, close } = useWallpaperPanel()
  const localWallpaper = useStorage(localWallpaperStorage)
  const settings = useStorage(settingStorage)

  const currentThumbnail =
    settings.wallpaperType === 'local' && localWallpaper.imageData ? localWallpaper.imageData : settings.wallpaperUrl

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="wallpaper-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-40 bg-transparent"
            aria-label="Close wallpaper panel"
            onClick={close}
          />

          <motion.div
            key="wallpaper-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[50vh] w-[min(48rem,calc(100vw-1rem))] flex-col
              overflow-hidden rounded-t-2xl backdrop-blur-2xl bg-black/30 dark:bg-black/40 shadow-2xl border-t border-x
              border-white/15">
            <div className="flex items-center justify-between px-4 py-3">
              <Stack direction={'row'} className="items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-xl bg-white/15 text-white">
                  <WallpaperIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <Text className="font-semibold text-sm text-white">{t('wallpaperTab')}</Text>
                  <Text level="xs" className="mt-0.5 text-white/60">
                    {t('wallpaperPreviewHint')}
                  </Text>
                </div>
                {currentThumbnail && (
                  <div className="hidden h-9 w-14 overflow-hidden rounded-lg border border-white/20 sm:block">
                    <img src={currentThumbnail} alt="current wallpaper" className="h-full w-full object-cover" />
                  </div>
                )}
              </Stack>
              <Button
                variant="ghost"
                size="icon"
                onClick={close}
                className="rounded-full text-white/70 hover:text-white hover:bg-white/15">
                <X className="size-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 px-3 pb-3 sm:px-4 max-h-[40vh]">
              <WallpaperPanelContent />
            </ScrollArea>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
