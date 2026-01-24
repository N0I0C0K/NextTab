import { useStorage } from '@extension/shared'
import { settingStorage } from '@extension/storage'
import { Stack, Text, Switch } from '@extension/ui'
import { History, Pointer, MousePointerClick, Bookmark, NotebookTabs, Keyboard } from 'lucide-react'
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
        IconClass={Pointer}
        title={t('autoFocusCommandInput')}
        description={t('autoFocusCommandInputDescription')}
        control={
          <Switch
            checked={settings.autoFocusCommandInput}
            onCheckedChange={val => settingStorage.update({ autoFocusCommandInput: val })}
          />
        }
      />
      <SettingItem
        IconClass={MousePointerClick}
        title={t('doubleClickBackgroundFocusCommand')}
        description={t('doubleClickBackgroundFocusCommandDescription')}
        control={
          <Switch
            checked={settings.doubleClickBackgroundFocusCommand}
            onCheckedChange={val => settingStorage.update({ doubleClickBackgroundFocusCommand: val })}
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
      <SettingItem
        IconClass={Keyboard}
        title={t('enableQuickUrlKeyboardNav')}
        description={t('enableQuickUrlKeyboardNavDescription')}
        control={
          <Switch
            checked={settings.enableQuickUrlKeyboardNav}
            onCheckedChange={val => settingStorage.update({ enableQuickUrlKeyboardNav: val })}
          />
        }
      />
    </Stack>
  )
}
