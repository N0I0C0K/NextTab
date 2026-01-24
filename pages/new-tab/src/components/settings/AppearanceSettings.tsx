import { Stack, Text, ThemeToggle, Separator } from '@extension/ui'
import { SunMoon } from 'lucide-react'
import type { FC } from 'react'
import { t } from '@extension/i18n'
import { SettingItem } from '../setting-pannel'
import { WallpaperSettings } from './WallpaperSettings'

export const AppearanceSettings: FC = () => {
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
      <WallpaperSettings />
    </Stack>
  )
}
