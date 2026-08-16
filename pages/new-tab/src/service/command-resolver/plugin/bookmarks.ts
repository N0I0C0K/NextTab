import { getDefaultIconUrl } from '@newtab/lib/url'
import type { ICommandResolver, ICommandResult } from '../protocol'
import { Star } from 'lucide-react'
import { t } from '@extension/i18n'

function convertBookmarkToCommandResult(item: chrome.bookmarks.BookmarkTreeNode): ICommandResult {
  return {
    id: item.id,
    title: item.title,
    description: item.url,
    iconUrl: item.url ? getDefaultIconUrl(item.url) : undefined,
    IconType: item.url ? undefined : Star,
    onSelect: () => {
      if (item.url) {
        chrome.tabs.update({ url: item.url })
      }
    },
  }
}

const ACTIVE_KEY = 'b'

export const bookmarksResolver: ICommandResolver = {
  settings: {
    active: true,
    activeKey: ACTIVE_KEY,
    priority: 5,
    includeInGlobal: true,
  },
  properties: {
    name: 'bookmarks',
    displayName: t('commandPluginBookmarks'),
    description: t('commandPluginBookmarksDescription'),
    icon: Star,
  },
  resolve: async params => {
    if (params.query.length === 0) {
      return (await chrome.bookmarks.getRecent(10)).map(convertBookmarkToCommandResult)
    }

    const result = await chrome.bookmarks.search({ query: params.query })
    if (result.length === 0) return null
    return result.slice(0, 10).map(convertBookmarkToCommandResult)
  },
}
