import { Stack, Text, ThemeToggle } from '@/components/shared'
import type { FC } from 'react'
import { t } from '@/utils/i18n'

export const AppearanceSettings: FC = () => {
  return (
    <Stack direction={'column'} className={'gap-2 w-full'} data-testid="appearance-settings">
      <Text gray level="s">
        {t('configureAppearanceSettings')}
      </Text>
      <ThemeToggle />
    </Stack>
  )
}
