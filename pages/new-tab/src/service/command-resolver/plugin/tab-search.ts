import type { ICommandResolver } from '../protocol'
import { t } from '@extension/i18n'
import { Columns } from 'lucide-react'

export const tabSearchResolver: ICommandResolver = {
  properties: {
    name: 'tabs',
    displayName: t('commandPluginTabs'),
    description: t('commandPluginTabsDescription'),
    icon: Columns,
  },
  resolve: async params => {
    if (params.query.length === 0) return null
    const result = await chrome.tabs.query({
      title: `*${params.query}*`,
    })
    if (result.length === 0) return null
    return result.map(it => {
      return {
        id: it.id!.toString(),
        title: it.title!,
        description: it.url!,
        iconUrl: it.favIconUrl!,
        onSelect: () => {
          chrome.windows.update(it.windowId, {
            focused: true,
          })
          chrome.tabs.update(it.id!, {
            active: true,
          })
        },
      }
    })
  },
}
