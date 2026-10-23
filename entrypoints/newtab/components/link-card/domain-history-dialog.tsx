import { getDefaultIconUrl } from '@/entrypoints/newtab/lib/url'
import { command, Text } from '@/components/shared'
import { t } from '@/utils/i18n'
import { useMemo, useState, useEffect, type FC } from 'react'
import { cn } from '@/entrypoints/newtab/lib/utils'
import { useDebounce } from '@/utils'
import moment from 'moment'
import { X } from 'lucide-react'
import { Command } from 'cmdk'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItem, setSelectedItem] = useState('')
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    let cancelled = false
    const fetchDomainHistory = async () => {
      try {
        setLoading(true)
        setSelectedItem('')
        // Combine domain and search query for Chrome history search
        const searchText = debouncedSearchQuery ? `${domain} ${debouncedSearchQuery}` : domain

        // Search for all history items from this domain
        const allHistory = await chrome.history.search({
          text: searchText,
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

        if (!cancelled) {
          setHistoryItems(domainHistory)
          setSelectedItem(domainHistory[0]?.id ?? '')
        }
      } catch (error) {
        console.error('Failed to fetch domain history:', error)
        if (!cancelled) {
          setHistoryItems([])
          setSelectedItem('')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDomainHistory()
    return () => {
      cancelled = true
    }
  }, [domain, debouncedSearchQuery])

  return (
    <Command
      label={t('domainHistory')}
      shouldFilter={false}
      value={selectedItem}
      onValueChange={setSelectedItem}
      className="flex w-full min-w-0 flex-col gap-4 h-[min(36rem,calc(100dvh-10rem))]"
      data-testid="domain-history-dialog">
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <Text level="md" className="font-semibold truncate">
          {domain}
        </Text>
        <Text level="s" className="text-muted-foreground flex-shrink-0">
          ({historyItems.length} {historyItems.length === 1 ? t('historyItem') : t('historyItems')})
        </Text>
      </div>

      {/* Search input */}
      <div className="relative shrink-0">
        <command.CommandInput
          data-testid="domain-history-search"
          aria-label={t('searchInDomain')}
          placeholder={t('searchInDomain')}
          value={searchQuery}
          onValueChange={setSearchQuery}
          className="pr-9 placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label={t('clearSearch')}
            onClick={() => setSearchQuery('')}
            onKeyDown={e => e.stopPropagation()}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground
              transition-colors">
            <X className="size-4" />
          </button>
        )}
      </div>

      <Command.List
        label={t('domainHistory')}
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto scroll-py-1 outline-none">
        {loading ? (
          <div className="flex items-center justify-center min-h-40">
            <Text className="text-muted-foreground">{t('loading')}</Text>
          </div>
        ) : historyItems.length === 0 ? (
          <div className="flex items-center justify-center min-h-40">
            <Text className="text-muted-foreground">{t('noHistoryFound')}</Text>
          </div>
        ) : (
          historyItems.map(item => <DomainHistoryItem key={item.id} {...item} />)
        )}
      </Command.List>
    </Command>
  )
}

const DomainHistoryItem: FC<DomainHistoryItem> = ({ id, title, url, lastVisitTime, visitCount }) => {
  const relativeTime = useMemo(() => {
    if (!lastVisitTime) return ''
    return moment(lastVisitTime).fromNow()
  }, [lastVisitTime])

  const handleClickCapture = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault()
      ev.stopPropagation()
      chrome.tabs.create({ url: url, active: true })
    }
  }

  return (
    <Command.Item
      value={id}
      data-testid="domain-history-item"
      className={cn(
        `grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-3 px-3 cursor-pointer group
        sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:py-3.5`,
        'hover:bg-muted data-[selected=true]:bg-muted rounded-md outline-none transition-colors duration-200',
      )}
      onClickCapture={handleClickCapture}
      onSelect={() => chrome.tabs.update({ url })}>
      <img
        src={getDefaultIconUrl(url)}
        alt=""
        className="size-5 rounded-sm flex-shrink-0"
        onError={e => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <div className="flex flex-col min-w-0 gap-1">
        <Text level="s" className="font-medium truncate" title={title}>
          {title}
        </Text>
        <Text level="xs" className="text-muted-foreground truncate" title={url}>
          {url}
        </Text>
      </div>
      <div
        className="col-start-2 flex items-center gap-3 sm:col-start-3 sm:row-start-1 sm:flex-col sm:items-end
          sm:gap-0.5">
        <Text level="xs" className="text-muted-foreground whitespace-nowrap">
          {relativeTime}
        </Text>
        {visitCount && visitCount > 1 && (
          <Text level="xs" className="text-muted-foreground/70 whitespace-nowrap">
            {visitCount} {t('visits')}
          </Text>
        )}
      </div>
    </Command.Item>
  )
}
