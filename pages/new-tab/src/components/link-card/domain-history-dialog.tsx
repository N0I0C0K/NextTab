import { getDefaultIconUrl } from '@/lib/url'
import { ScrollArea, Text } from '@extension/ui'
import { t } from '@extension/i18n'
import { useMemo, useState, useEffect, type FC } from 'react'
import { cn } from '@/lib/utils'
import moment from 'moment'

interface DomainHistoryItem {
  id: string
  title: string
  url: string
  lastVisitTime?: number
  visitCount?: number
}

interface DomainHistoryDialogProps {
  domain: string
}

/**
 * Check if an item's domain matches the target domain
 * Handles www subdomain variations
 */
const matchesDomain = (itemDomain: string, targetDomain: string): boolean => {
  return itemDomain === targetDomain || itemDomain === `www.${targetDomain}` || `www.${itemDomain}` === targetDomain
}

/**
 * DomainHistoryDialog - Displays recent history for a specific domain
 */
export const DomainHistoryDialog: FC<DomainHistoryDialogProps> = ({ domain }) => {
  const [historyItems, setHistoryItems] = useState<DomainHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDomainHistory = async () => {
      try {
        setLoading(true)
        // Search for all history items from this domain
        const allHistory = await chrome.history.search({
          text: domain,
          maxResults: 100,
          startTime: moment().add(-6, 'month').valueOf(),
        })

        // Filter to only include items from the exact domain
        const domainHistory = allHistory
          .filter(item => {
            if (!item.url) return false
            try {
              const itemDomain = new URL(item.url).hostname
              return matchesDomain(itemDomain, domain)
            } catch {
              return false
            }
          })
          .map((item, index) => ({
            id: item.id ?? (item.url ? `${item.url}-${item.lastVisitTime ?? ''}` : `index-${index}`),
            title: item.title || item.url || '',
            url: item.url || '',
            lastVisitTime: item.lastVisitTime,
            visitCount: item.visitCount,
          }))
          // Sort by last visit time (most recent first)
          .sort((a, b) => (b.lastVisitTime || 0) - (a.lastVisitTime || 0))

        setHistoryItems(domainHistory)
      } catch (error) {
        console.error('Failed to fetch domain history:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDomainHistory()
  }, [domain])

  return (
    <div className="flex flex-col gap-3 max-w-[50rem]">
      <div className="flex items-center gap-2 min-w-0">
        <Text level="md" className="font-semibold truncate">
          {domain}
        </Text>
        <Text level="s" className="text-muted-foreground flex-shrink-0">
          ({historyItems.length} {historyItems.length === 1 ? t('historyItem') : t('historyItems')})
        </Text>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Text className="text-muted-foreground">{t('loading')}</Text>
        </div>
      ) : historyItems.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Text className="text-muted-foreground">{t('noHistoryFound')}</Text>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col items-center">
            {historyItems.map(item => (
              <DomainHistoryItem key={item.id} {...item} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

interface DomainHistoryItemProps extends DomainHistoryItem {}

const DomainHistoryItem: FC<DomainHistoryItemProps> = ({ title, url, lastVisitTime, visitCount }) => {
  const relativeTime = useMemo(() => {
    if (!lastVisitTime) return ''
    return moment(lastVisitTime).fromNow()
  }, [lastVisitTime])

  const handleClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (ev.ctrlKey || ev.metaKey) {
      chrome.tabs.create({ url: url, active: true })
    } else {
      chrome.tabs.update({ url: url })
    }
  }

  const handleKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      chrome.tabs.update({ url: url })
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'flex items-center gap-3 py-2.5 px-3 cursor-pointer group w-full',
        'hover:bg-accent/50 rounded-md transition-colors duration-200',
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}>
      <img
        src={getDefaultIconUrl(url)}
        alt="favicon"
        className="size-5 rounded-sm flex-shrink-0"
        onError={e => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <div className="flex flex-col flex-1 min-w-0 gap-0.5 max-w-full">
        <Text level="s" className="font-medium truncate">
          {title}
        </Text>
        <Text level="xs" className="text-muted-foreground truncate">
          {url}
        </Text>
      </div>
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
        <Text level="xs" className="text-muted-foreground whitespace-nowrap">
          {relativeTime}
        </Text>
        {visitCount && visitCount > 1 && (
          <Text level="xs" className="text-muted-foreground/70 whitespace-nowrap">
            {visitCount} {t('visits')}
          </Text>
        )}
      </div>
    </div>
  )
}
