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
    const tabs = (await chrome.tabs.query({})).filter(
      tab => Boolean(tab.incognito) === Boolean(chrome.extension?.inIncognitoContext),
    )
    const identity = (tab: chrome.tabs.Tab) => JSON.stringify([tab.title ?? '', tab.url ?? tab.pendingUrl ?? ''])
    const duplicates = new Map<string, number>()
    for (const tab of tabs) duplicates.set(identity(tab), (duplicates.get(identity(tab)) ?? 0) + 1)
    const windowOrder = new Map(
      [...new Set(tabs.map(tab => tab.windowId))].sort((a, b) => a - b).map((id, index) => [id, index + 1]),
    )
    const result = tabs.filter(tab => matchesSearch(query, tab.title ?? '', tab.url ?? tab.pendingUrl ?? ''))
    if (result.length === 0) return null
    return result.map(it => {
      return {
        id: it.id!.toString(),
        url: it.url ?? it.pendingUrl,
        supportsNewTab: Boolean(it.url ?? it.pendingUrl),
        title: it.title || it.url || it.pendingUrl || '',
        description:
          (duplicates.get(identity(it)) ?? 0) > 1 && Number.isInteger(it.index)
            ? `${t('commandTabLocation', [String(windowOrder.get(it.windowId)), String(it.index + 1)])} · ${it.url ?? it.pendingUrl ?? ''}`
            : (it.url ?? it.pendingUrl),
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
