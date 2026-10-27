import { getDefaultIconUrl } from '@/entrypoints/newtab/lib/url'
import type { ICommandResolver, ICommandResult } from '../protocol'
import { openSavedUrl } from '@/utils/quick-link-search'
import { searchContinuation } from './search-continuation'
import { Star } from 'lucide-react'
import { t } from '@/utils/i18n'

function convertBookmarkToCommandResult(item: chrome.bookmarks.BookmarkTreeNode): ICommandResult {
  return {
    id: item.id,
    url: item.url,
    supportsNewTab: Boolean(item.url),
    title: item.title,
    description: item.url,
    iconUrl: item.url ? getDefaultIconUrl(item.url) : undefined,
    IconType: item.url ? undefined : Star,
    onSelect: options => (item.url ? openSavedUrl(item.url, options?.newTab) : undefined),
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
    const query = params.query.trim()
    const result = (
      query.length === 0 ? await chrome.bookmarks.getRecent(11) : await chrome.bookmarks.search({ query })
    ).filter(item => item.url)
    if (result.length === 0) return null
    const items = result.slice(0, 10).map(convertBookmarkToCommandResult)
    if (result.length > 10) items.push(searchContinuation('bookmarks', params))
    return items
  },
}
