import { useEffect, useRef, useState, type RefObject } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, Input } from '@/components/shared'
import { useDebounce } from '@/utils'
import { openSavedUrl } from '@/utils/quick-link-search'
import { t } from '@/utils/i18n'
import { NavigationList, focusNavigationFromSearch, type NavigationItem } from './navigation-list'
import { loadSearchResults } from '../../services/search-results'

export type SearchResultsRequest = { source: 'history' | 'bookmarks'; query: string }

export function SearchResultsDialog({
  request,
  onClose,
  finalFocus,
}: {
  request: SearchResultsRequest | null
  onClose: () => void
  finalFocus: RefObject<HTMLInputElement>
}) {
  // Remount per opening so an old source/query never flashes its previous results.
  return request ? <SearchResultsContent request={request} onClose={onClose} finalFocus={finalFocus} /> : null
}

function SearchResultsContent({
  request,
  onClose,
  finalFocus,
}: {
  request: SearchResultsRequest
  onClose: () => void
  finalFocus: RefObject<HTMLInputElement>
}) {
  const [query, setQuery] = useState(request.query)
  const delayedQuery = useDebounce(query, 200)
  const [snapshot, setSnapshot] = useState<{ query: string; items: NavigationItem[] }>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let current = true
    setLoading(true)
    setFailed(false)
    if (query !== delayedQuery) return
    void loadSearchResults(request.source, delayedQuery).then(
      items => {
        if (!current) return
        setSnapshot({ query: delayedQuery, items })
        setLoading(false)
      },
      () => {
        if (!current) return
        setFailed(true)
        setLoading(false)
      },
    )
    return () => {
      current = false
    }
  }, [request.source, query, delayedQuery, retry])
  const title = t(request.source === 'history' ? 'commandPluginHistory' : 'commandPluginBookmarks')
  const placeholder = t(request.source === 'history' ? 'commandHistoryPlaceholder' : 'commandBookmarksPlaceholder')
  const items = snapshot?.query === query ? snapshot.items : []
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}>
      <DialogContent
        className="nt-navigation-dialog"
        data-testid="search-results-dialog"
        initialFocus={input}
        finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t(request.source === 'history' ? 'commandHistoryLimit' : 'commandBookmarksAllDescription')}
          </DialogDescription>
        </DialogHeader>
        <Input
          ref={input}
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={focusNavigationFromSearch}
        />
        {loading && <p role="status">{t('commandResultsLoading')}</p>}
        {failed && (
          <p role="alert">
            {t('commandResultsFailed')}{' '}
            <button type="button" onClick={() => setRetry(value => value + 1)}>
              {t('retryAction')}
            </button>
          </p>
        )}
        <NavigationList
          items={items}
          resetKey={query}
          unknown={loading || (failed && snapshot?.query !== query)}
          onOpen={(item, newTab) => openSavedUrl(item.url, newTab)}
        />
      </DialogContent>
    </Dialog>
  )
}
