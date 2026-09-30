import { getDefaultIconUrl } from '@/entrypoints/newtab/lib/url'
import type { ICommandResolver, ICommandResult } from '../protocol'
import moment from 'moment'
import { t } from '@/utils/i18n'
import { Clock } from 'lucide-react'

function convertHistoryItemToCommandResult(item: chrome.history.HistoryItem): ICommandResult {
  const formatLastDate = moment(item.lastVisitTime).format('MM/DD HH:mm')
  return {
    id: item.id,
    title: `${item.title!}`,
    description: `${formatLastDate} ${item.url!}`,
    iconUrl: getDefaultIconUrl(item.url!),
    onSelect: () => {
      chrome.tabs.update({ url: item.url })
    },
  }
}

export const historyResolver: ICommandResolver = {
  settings: {
    active: true,
    activeKey: 'h',
  },
  properties: {
    name: 'history',
    displayName: t('commandPluginHistory'),
    description: t('commandPluginHistoryDescription'),
    icon: Clock,
  },
  resolve: async params => {
    if (params.query.trim().length === 0) return null
    const result = await chrome.history.search({
      text: params.query,
      maxResults: 10,
      // startTime: moment().add(-2, 'month').valueOf(),
    })
    if (result.length === 0) return null
    return result.map(convertHistoryItemToCommandResult)
  },
}
