import { useStorage } from '@extension/shared'
import { settingStorage } from '@extension/storage'
import { Stack, Text, Switch, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@extension/ui'
import { History, Bookmark, NotebookTabs, Folder } from 'lucide-react'
import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { t } from '@extension/i18n'
import { SettingItem } from './SettingItem'
import { getBookmarkFolders } from '@/lib/bookmarks'

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
      settingStorage.update({ bookmarkFolderId: null })
    }
  }, [settings.bookmarkFolderId, bookmarkFolders])

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
      {settings.showBookmarksInQuickUrlMenu && (
        <SettingItem
          IconClass={Folder}
          title={t('bookmarkFolder')}
          description={t('bookmarkFolderDescription')}
          control={
            <Select
              value={settings.bookmarkFolderId || 'all'}
              onValueChange={val => settingStorage.update({ bookmarkFolderId: val === 'all' ? null : val })}>
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
            checked={settings.showOpenTabsInQuickUrlMenu}
            onCheckedChange={val => settingStorage.update({ showOpenTabsInQuickUrlMenu: val })}
          />
        }
      />
    </Stack>
  )
}
