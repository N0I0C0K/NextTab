import { Link, ArrowRight, Plus } from 'lucide-react'
import { t } from '@/utils/i18n'
import { getDisplayQuickUrls, quickUrlItemsStorage, settingStorage } from '@/utils/storage'
import { openSavedUrl, searchQuickLinks } from '@/utils/quick-link-search'
import { getDefaultIconUrl } from '../../../lib/url'
import type { ICommandResolver, ICommandResult } from '../protocol'

export const quickLinksResolver: ICommandResolver = {
  properties: {
    name: 'quickLinks',
    displayName: t('commandPluginQuickLinks'),
    description: t('commandPluginQuickLinksDescription'),
    icon: Link,
  },
  settings: { active: true, includeInGlobal: true, activeKey: 'q', priority: 3 },
  async resolve(params) {
    const [items, settings] = await Promise.all([quickUrlItemsStorage.getValue(), settingStorage.getValue()])
    const matches = searchQuickLinks(getDisplayQuickUrls(items, settings.quickUrlSortMode), params.query)
    const results: ICommandResult[] = matches.slice(0, 8).map(item => ({
      id: `quick-link-${item.id}`,
      title: item.title,
      supportsNewTab: true,
      description: item.url,
      iconUrl: getDefaultIconUrl(item.url),
      onSelect: options => openSavedUrl(item.url, options?.newTab),
    }))
    if (!items.length && params.resolverName === 'quickLinks')
      results.push({
        id: 'quick-links-add',
        title: t('quickLinksEmpty'),
        description: t('addSite'),
        IconType: Plus,
        onSelect: () => params.addQuickLink?.(),
      })
    if (matches.length > 8)
      results.push({
        id: 'quick-links-all',
        title: t('quickLinksViewAll', String(matches.length)),
        IconType: ArrowRight,
        onSelect: () => params.openQuickLinks?.(params.query),
      })
    return results
  },
}
