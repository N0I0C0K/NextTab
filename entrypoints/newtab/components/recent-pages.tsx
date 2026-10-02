import { useEffect, useState, type MouseEvent } from 'react'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
import { useStorage } from '@/utils'
import { t } from '@/utils/i18n'
import { quickUrlItemsStorage } from '@/utils/storage'
import { collectRecentPages, selectRecentPages, type RecentPage } from '../recent-page-recommendations'

const CACHE_KEY = 'recent-page-recommendations-v1'
const CACHE_DURATION = 6 * 60 * 60 * 1000

interface RecentPageCache {
  date: string
  updatedAt: number
  pages: RecentPage[]
}

function isCache(value: unknown): value is RecentPageCache {
  if (!value || typeof value !== 'object') return false
  const cache = value as Partial<RecentPageCache>
  return typeof cache.date === 'string' && typeof cache.updatedAt === 'number' && Array.isArray(cache.pages)
}

function siteLabel(host: string): string {
  const parts = host.replace(/^www\./, '').split('.')
  const firstPart = ['app', 'web', 'home', 'portal'].includes(parts[0]) && parts.length > 2 ? parts[1] : parts[0]
  return firstPart.charAt(0).toLocaleUpperCase() + firstPart.slice(1)
}

export function RecentPages() {
  const quickLinks = useStorage(quickUrlItemsStorage)
  const [candidates, setCandidates] = useState<RecentPage[]>([])

  useEffect(() => {
    let active = true
    async function load() {
      const today = new Date().toDateString()
      let cached: RecentPageCache | undefined
      try {
        const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY]
        if (isCache(stored)) cached = stored
      } catch {
        // Recommendations can still be computed when the cache is unavailable.
      }
      if (!active) return
      if (cached && Date.now() - cached.updatedAt < 2 * CACHE_DURATION) setCandidates(cached.pages)
      if (cached?.date === today && Date.now() - cached.updatedAt < CACHE_DURATION) return

      try {
        const pages = await collectRecentPages()
        if (!active) return
        setCandidates(pages)
        await chrome.storage.local.set({
          [CACHE_KEY]: { date: today, updatedAt: Date.now(), pages } satisfies RecentPageCache,
        })
      } catch (error) {
        console.warn('Could not update recent page suggestions', error)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const pages = selectRecentPages(
    candidates,
    quickLinks.map(link => link.url),
    6,
    1,
  )
  if (pages.length === 0) return null

  function openPage(event: MouseEvent<HTMLButtonElement>, url: string) {
    if (event.ctrlKey || event.metaKey) {
      void chrome.tabs.create({ url, active: true })
    } else {
      void chrome.tabs.update({ url })
    }
  }

  return (
    <section className="nt-recent-section" aria-labelledby="nt-recent-title" data-testid="recent-pages-section">
      <div className="nt-section-heading">
        <h2 id="nt-recent-title">{t('recentPagesHeading')}</h2>
        <span className="nt-recent-source">{t('recentPagesSource')}</span>
      </div>
      <div className="nt-recent-strip">
        {pages.map(page => (
          <button
            className="nt-recent-item"
            type="button"
            key={page.url}
            data-testid="recent-page-card"
            title={`${page.title}\n${page.url}`}
            aria-label={`${siteLabel(page.host)} — ${page.title}`}
            onClick={event => openPage(event, page.url)}
            onKeyDown={event => {
              // Keep the quick-link grid's global shortcuts from taking over a focused card.
              if (['Enter', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
                event.stopPropagation()
              }
            }}>
            <QuickLinkIcon url={page.url} title={siteLabel(page.host)} className="nt-link-icon" />
            <span className="nt-recent-label">{siteLabel(page.host)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
