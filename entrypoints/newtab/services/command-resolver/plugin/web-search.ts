import type { ICommandResolver, ICommandResult } from '../protocol'
import { Search, Settings2 } from 'lucide-react'
import { t } from '@/utils/i18n'
import { searchEnginesStorage } from '@/utils/storage'
import { buildSearchUrl, usableSearchEngines } from '@/utils/search-engines'

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
    const query = params.query.trim()
    if (!query)
      return [
        {
          id: 'manage-search-engines',
          title: t('engineEnterQuery'),
          description: t('engineManage'),
          IconType: Settings2,
          onSelect: () => params.openSearchEngines?.(),
        },
      ]
    const results: ICommandResult[] = [
      {
        id: `search-unique-key`,
        title: t('engineSearchWith', t('engineBrowserDefault')),
        description: query,
        IconType: Search,
        onSelect: async () => {
          await chrome.search.query({ text: query, disposition: 'NEW_TAB' })
        },
      },
    ]
    try {
      const engines = await searchEnginesStorage.getValue()
      for (const engine of usableSearchEngines(engines).filter(item => item.enabled))
        results.push({
          id: `search-engine-${engine.id}`,
          title: t('engineSearchWith', engine.name),
          description: buildSearchUrl(engine.url, query),
          IconType: Search,
          onSelect: async () => {
            await chrome.tabs.create({ url: buildSearchUrl(engine.url, query), active: true })
          },
        })
    } catch {
      results.push({
        id: 'retry-search-engines',
        title: t('navigationReadFailed'),
        description: t('retryAction'),
        keepOpen: true,
        onSelect: () => params.retry?.(),
      })
    }
    return results
  },
}
