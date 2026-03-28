import { Stack, Text, ThemeToggle, Separator, Button } from '@extension/ui'
import { SunMoon, Image as WallpaperIcon } from 'lucide-react'
import type { FC } from 'react'
import { t } from '@extension/i18n'
import { SettingItem } from './SettingItem'
import { useWallpaperPanel } from '@src/provider'

export const AppearanceSettings: FC = () => {
  const { open } = useWallpaperPanel()
  return (
    <Stack direction={'column'} className={'gap-2 w-full'}>
      <Text gray level="s">
        {t('configureAppearanceSettings')}
      </Text>
      <SettingItem
        IconClass={SunMoon}
        title={t('theme')}
        description={t('themeDescription')}
        control={<ThemeToggle />}
      />
      <Separator className="my-2" />
      <SettingItem
        IconClass={WallpaperIcon}
        title={t('wallpaperTab')}
        description={t('wallpaperSettingsDescription')}
        control={
          <Button variant="outline" size="sm" onClick={open}>
            {t('openWallpaperPanel')}
          </Button>
        }
      />
    </Stack>
  )
}

