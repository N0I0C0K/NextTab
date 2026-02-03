import { useStorage } from '@extension/shared'
import { settingStorage } from '@extension/storage'
import { Stack, Text, Switch } from '@extension/ui'
import { History, Bookmark, NotebookTabs } from 'lucide-react'
import type { FC } from 'react'
import { t } from '@extension/i18n'
import { SettingItem } from '../setting-pannel'

export const HomepageSettings: FC = () => {
  const settings = useStorage(settingStorage)

  return (
    <Stack direction={'column'} className={'gap-2 w-full'}>
      <Text gray level="s">
        {t('configureHomepageSettings')}
      </Text>
      <SettingItem
        IconClass={History}
        title={t('historySuggestion')}
        description={t('historySuggestionDescription')}
        control={
          <Switch
            checked={settings.useHistorySuggestion}
            onCheckedChange={val => settingStorage.update({ useHistorySuggestion: val })}
          />
        }
      />
      <SettingItem
        IconClass={Bookmark}
        title={t('showBookmarksInQuickUrlMenu')}
        description={t('showBookmarksInQuickUrlMenuDescription')}
        control={
          <Switch
            checked={settings.showBookmarksInQuickUrlMenu}
            onCheckedChange={val => settingStorage.update({ showBookmarksInQuickUrlMenu: val })}
          />
        }
      />
      <SettingItem
        IconClass={NotebookTabs}
        title={t('showOpenTabsInQuickUrlMenu')}
        description={t('showOpenTabsInQuickUrlMenuDescription')}
        control={
          <Switch
            checked={settings.showOpenTabsInQuickUrlMenu}
            onCheckedChange={val => settingStorage.update({ showOpenTabsInQuickUrlMenu: val })}
          />
        }
      />
    </Stack>
  )
}
