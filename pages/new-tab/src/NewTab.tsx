import '@src/NewTab.css'
import { Center, Text, Heading, Stack } from '@extension/ui'
import { useEffect, useRef, useState } from 'react'
import { CommandModule, SettingPanel, ScrollLinkCardPage, OnboardingDialog } from './components'
import type { CommandModuleRef } from './components/command'

import '@/src/style/placeholder.css'
import { HistoryArea } from './components/history-area'
import { settingStorage, DEFAULT_WALLPAPER_URL, localWallpaperStorage } from '@extension/storage'
import type { WallpaperType } from '@extension/storage'
import { useStorage } from '@extension/shared'
import { useWallpaperSemanticColors } from './hooks/useWallpaperSemanticColors'

const TimeDisplay = ({ wallpaperSrc, wallpaperType }: { wallpaperSrc: string; wallpaperType: WallpaperType }) => {
  const [time, setTime] = useState<Date>(new Date())
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)
  const colors = useWallpaperSemanticColors(wallpaperSrc, wallpaperType)

  useEffect(() => {
    const timeNow = new Date()
    setTime(timeNow)

    const offset = 60000 - (timeNow.getTime() % 60000)
    const timerId = setTimeout(() => {
      setRefreshTrigger(val => val + 1)
    }, offset)

    return () => {
      clearTimeout(timerId)
    }
  }, [refreshTrigger])

  return (
    <Stack direction={'column'} className="items-center gap-2 md:gap-3">
      <Stack className="items-end">
        <Heading
          className="select-none font-extralight leading-none text-[clamp(5rem,12vw,10rem)] 2xl:font-light"
          style={{ color: colors.time }}>
          {time?.getHours().toString().padStart(2, '0')}
        </Heading>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 6 24"
          fill="none"
          stroke="currentColor"
          className="mx-1 h-[clamp(4rem,10vw,6rem)] w-[clamp(0.75rem,1vw,1rem)] fill-current stroke-10"
          style={{ color: colors.time }}>
          <circle cx="3" cy="17" r="1" />
          <circle cx="3" cy="7" r="1" />
        </svg>
        <Heading
          className="select-none font-extralight leading-none text-[clamp(5rem,12vw,10rem)] 2xl:font-light"
          style={{ color: colors.time }}>
          {time?.getMinutes().toString().padStart(2, '0')}
        </Heading>
      </Stack>
      <Text
        className="select-none font-medium text-[clamp(0.95rem,1.6vw,1.25rem)]"
        style={{ color: colors.date }}>
        {time.toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long' })}
      </Text>
    </Stack>
  )
}

function getEffectiveWallpaperType(
  wallpaperType: WallpaperType,
  localWallpaperImageData: string | null,
  wallpaperSrc: string,
): WallpaperType {
  return wallpaperType === 'local' && localWallpaperImageData && wallpaperSrc === localWallpaperImageData ? 'local' : 'url'
}

const NewTab = () => {
  const settings = useStorage(settingStorage)
  const localWallpaper = useStorage(localWallpaperStorage)
  const [wallpaperSrc, setWallpaperSrc] = useState<string>(() => {
    // Initialize wallpaper source from settings
    if (settings.wallpaperType === 'local' && localWallpaper.imageData) {
      return localWallpaper.imageData
    } else {
      return settings.wallpaperUrl ?? DEFAULT_WALLPAPER_URL
    }
  })
  const commandModuleRef = useRef<CommandModuleRef>(null)
  const effectiveWallpaperType = getEffectiveWallpaperType(settings.wallpaperType, localWallpaper.imageData, wallpaperSrc)

  useEffect(() => {
    // Update wallpaper source when settings change
    if (settings.wallpaperType === 'local' && localWallpaper.imageData) {
      setWallpaperSrc(localWallpaper.imageData)
    } else {
      setWallpaperSrc(settings.wallpaperUrl ?? DEFAULT_WALLPAPER_URL)
    }
  }, [settings.wallpaperType, localWallpaper.imageData, settings.wallpaperUrl])

  function handleBackgroundDoubleClick() {
    if (settings.doubleClickBackgroundFocusCommand) {
      commandModuleRef.current?.focus()
    }
  }

  return (
    <>
      <div
        className={'flex h-screen w-screen max-w-full flex-col justify-center gap-4 relative overflow-hidden'}
        onDoubleClick={handleBackgroundDoubleClick}>
        <Center column className="flex-1">
          <TimeDisplay wallpaperSrc={wallpaperSrc} wallpaperType={effectiveWallpaperType} />
        </Center>
        <Stack direction={'column'} className="flex-1">
          <Center className="mb-8 h-10">
            <CommandModule
              ref={commandModuleRef}
              className="w-[40%] min-w-[20rem] max-w-[40rem] h-auto absolute z-[1]"
            />
          </Center>
          <Center>
            <div className="relative min-w-[20rem] w-[50%] z-0">
              <ScrollLinkCardPage
                className="relative backdrop-blur-2xl rounded-2xl shadow-md dark:backdrop-brightness-75 w-full
                  overflow-hidden bg-white/20 dark:bg-black/20 z-0"
              />
              {/* <DndLinkCardPage className="relative backdrop-blur-2xl rounded-2xl shadow-md dark:backdrop-brightness-75 w-full overflow-hidden bg-slate-50/20 dark:bg-slate-700/20" /> */}
            </div>
          </Center>
        </Stack>
        {settings.useHistorySuggestion ? (
          <Stack direction={'column'} className="flex-1 flex flex-col justify-end">
            <HistoryArea
              className="backdrop-blur-2xl rounded-t-xl shadow-md dark:backdrop-brightness-75 bg-slate-50/20
                dark:bg-slate-700/20"
            />
          </Stack>
        ) : (
          <div style={{ flexGrow: 0.7 }} />
        )}
      </div>
      <img
        className="x-bg-img h-screen w-screen fixed top-0 left-0 -z-10 scale-105 brightness-90 dark:brightness-75
          object-cover select-none"
        src={wallpaperSrc}
        alt="background wallpaper"
        onError={() => {
          console.log('background image error')
          // Only fallback to default if not already using it
          if (wallpaperSrc !== DEFAULT_WALLPAPER_URL) {
            setWallpaperSrc(DEFAULT_WALLPAPER_URL)
          }
        }}
      />
      <SettingPanel className="fixed top-2 right-2" />
      <OnboardingDialog />
    </>
  )
}

export default NewTab
