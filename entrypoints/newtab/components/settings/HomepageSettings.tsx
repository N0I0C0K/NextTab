import { useStorage } from '@/utils'
import { settingStorage, updateSettings, returnPagePreferencesStorage } from '@/utils/storage'
import { Stack, Text, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared'
import { Bookmark, NotebookTabs, Folder, History } from 'lucide-react'
import { Button } from '@/components/shared'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { t } from '@/utils/i18n'
import { SettingItem } from './SettingItem'
import { getBookmarkFolders } from '@/entrypoints/newtab/lib/bookmarks'

// Cache folders to avoid repeated API calls
let cachedBookmarkFolders: chrome.bookmarks.BookmarkTreeNode[] | null = null

export const HomepageSettings: FC = () => {
  const settings = useStorage(settingStorage)
  const [bookmarkFolders, setBookmarkFolders] = useState<chrome.bookmarks.BookmarkTreeNode[]>([])

  useEffect(() => {
    if (!settings.showBookmarksInQuickUrlMenu) return

    let isMounted = true

    if (cachedBookmarkFolders) {
      setBookmarkFolders(cachedBookmarkFolders)
    } else {
      getBookmarkFolders().then(folders => {
        if (!isMounted) return
        cachedBookmarkFolders = folders
        setBookmarkFolders(folders)
      })
    }

    return () => {
      isMounted = false
    }
  }, [settings.showBookmarksInQuickUrlMenu])

  // Normalize bookmarkFolderId if it's invalid (folder was deleted)
  useEffect(() => {
    if (!settings.bookmarkFolderId || bookmarkFolders.length === 0) return

    const folderExists = bookmarkFolders.some(folder => folder.id === settings.bookmarkFolderId)
    if (!folderExists) {
      // Reset to "All Bookmarks" if the selected folder no longer exists
      updateSettings({ bookmarkFolderId: null })
    }
  }, [settings.bookmarkFolderId, bookmarkFolders])

  return (
    <Stack direction={'column'} className={'gap-2 w-full'} data-testid="homepage-settings">
      <Text gray level="s">
        {t('configureHomepageSettings')}
      </Text>
      <SettingItem
        IconClass={History}
        title={t('showReturnPages')}
        description={t('showReturnPagesDescription')}
        control={
          <Switch
            data-testid="show-return-pages"
            aria-label={t('showReturnPages')}
            checked={settings.showRecentPages ?? true}
            onCheckedChange={value => updateSettings({ showRecentPages: value })}
          />
        }
      />
      <SettingItem
        IconClass={History}
        title={t('resetReturnPages')}
        description={t('resetReturnPagesDescription')}
        control={
          <Button
            variant="outline"
            size="sm"
            data-testid="reset-return-pages"
            onClick={() => returnPagePreferencesStorage.setValue({ hiddenUrls: [], excludedHosts: [] })}>
            {t('resetAction')}
          </Button>
        }
      />
      <SettingItem
        IconClass={Bookmark}
        title={t('showBookmarksInQuickUrlMenu')}
        description={t('showBookmarksInQuickUrlMenuDescription')}
        control={
          <Switch
            aria-label={t('showBookmarksInQuickUrlMenu')}
            checked={settings.showBookmarksInQuickUrlMenu}
            onCheckedChange={val => updateSettings({ showBookmarksInQuickUrlMenu: val })}
          />
        }
      />
      {settings.showBookmarksInQuickUrlMenu && (
        <SettingItem
          className="nt-setting-item-stacked"
          IconClass={Folder}
          title={t('bookmarkFolder')}
          description={t('bookmarkFolderDescription')}
          control={
            <Select
              value={settings.bookmarkFolderId || 'all'}
              onValueChange={val => updateSettings({ bookmarkFolderId: val === 'all' ? null : val })}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allBookmarks')}</SelectItem>
                {bookmarkFolders.map(folder => (
                  <SelectItem key={folder.id} value={folder.id}>
                    {folder.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}
      <SettingItem
        IconClass={NotebookTabs}
        title={t('showOpenTabsInQuickUrlMenu')}
        description={t('showOpenTabsInQuickUrlMenuDescription')}
        control={
          <Switch
            aria-label={t('showOpenTabsInQuickUrlMenu')}
            checked={settings.showOpenTabsInQuickUrlMenu}
            onCheckedChange={val => updateSettings({ showOpenTabsInQuickUrlMenu: val })}
          />
        }
      />
    </Stack>
  )
}
