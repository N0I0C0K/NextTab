import type { ICommandResolver } from '../protocol'
import { t } from '@/utils/i18n'
import { matchesSearch, openSavedUrl } from '@/utils/quick-link-search'
import { Columns } from 'lucide-react'

export const tabSearchResolver: ICommandResolver = {
  settings: {
    priority: 0,
    active: true,
  },
  properties: {
    name: 'tabs',
    displayName: t('commandPluginTabs'),
    description: t('commandPluginTabsDescription'),
    icon: Columns,
  },
  resolve: async params => {
    const query = params.query.trim()
    const result = (await chrome.tabs.query({})).filter(
      tab =>
        Boolean(tab.incognito) === Boolean(chrome.extension?.inIncognitoContext) &&
        matchesSearch(query, tab.title ?? '', tab.url ?? tab.pendingUrl ?? ''),
    )
    if (result.length === 0) return null
    return result.map(it => {
      return {
        id: it.id!.toString(),
        url: it.url ?? it.pendingUrl,
        title: it.title || it.url || it.pendingUrl || '',
        description: it.url ?? it.pendingUrl,
        iconUrl: it.favIconUrl!,
        onSelect: async options => {
          if (options?.newTab) {
            await openSavedUrl((it.url ?? it.pendingUrl)!, true)
            return
          }
          await chrome.tabs.update(it.id!, { active: true })
          await chrome.windows.update(it.windowId, { focused: true })
        },
      }
    })
  },
}
