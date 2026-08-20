import type { ICommandResolver } from '../protocol'
import { Search } from 'lucide-react'
import { t } from '@/utils/i18n'

export const webSearchResolver: ICommandResolver = {
  settings: {
    priority: 100,
    active: true,
    includeInGlobal: true,
    activeKey: 'g',
  },
  properties: {
    name: 'webSearch',
    displayName: t('commandPluginWebSearch'),
    description: t('commandPluginWebSearchDescription'),
    icon: Search,
  },
  resolve: async params => {
    if (params.query.length === 0) return null
    return [
      {
        id: `search-unique-key`,
        title: t('commandPluginWebSearchTitle').replace('{query}', params.query),
        description: t('commandPluginWebSearchDescription'),
        IconType: Search,
        onSelect: () => {
          chrome.search.query({ text: params.query, disposition: 'NEW_TAB' })
        },
      },
    ]
  },
}
