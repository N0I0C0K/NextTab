import { useState, useEffect, type FC } from 'react'
import { Stack, Text, ScrollArea } from '@extension/ui'
import { quickUrlItemsStorage } from '@extension/storage'
import { useStorage } from '@extension/shared'
import { t } from '@extension/i18n'
import { Link } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StepNavigationProps, TopSiteItem } from '../types'
import { StepHeader, StepContainer, StepNavigationButtons, CheckboxIndicator } from '../components'

/** Maximum number of top sites to display */
const MAX_TOP_SITES = 10

/**
 * Extract hostname from URL for comparison
 */
const getHostname = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/**
 * Get favicon URL for a given page URL using Chrome's favicon service
 */
const getFaviconUrl = (pageUrl: string, size = 32): string => {
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=${size}`
}

export const QuickLinksStep: FC<StepNavigationProps> = ({ onNext, onBack }) => {
  const [topSites, setTopSites] = useState<TopSiteItem[]>([])
  const [loading, setLoading] = useState(true)
  const existingQuickUrls = useStorage(quickUrlItemsStorage)

  useEffect(() => {
    // Get existing quick URL hostnames for comparison
    const existingHostnames = new Set(existingQuickUrls.map(item => getHostname(item.url)))

    chrome.topSites.get().then(sites => {
      setTopSites(
        sites.slice(0, MAX_TOP_SITES).map(site => {
          const hostname = getHostname(site.url)
          const alreadyExists = existingHostnames.has(hostname)
          return {
            url: site.url,
            title: site.title || hostname,
            // Default to unselected if already exists
            selected: !alreadyExists,
            alreadyExists,
          }
        }),
      )
      setLoading(false)
    })
  }, [existingQuickUrls])

  const toggleSite = (url: string) => {
    setTopSites(prev => prev.map(site => (site.url === url ? { ...site, selected: !site.selected } : site)))
  }

  const handleImport = async () => {
    const selectedSites = topSites.filter(site => site.selected)
    for (const site of selectedSites) {
      await quickUrlItemsStorage.add({
        id: crypto.randomUUID(),
        title: site.title,
        url: site.url,
      })
    }
    onNext()
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="w-full h-[200px] flex items-center justify-center">
          <Text gray>{t('loading')}</Text>
        </div>
      )
    }

    if (topSites.length === 0) {
      return (
        <div className="w-full h-[200px] flex items-center justify-center">
          <Text gray>{t('onboardingNoTopSites')}</Text>
        </div>
      )
    }

    return (
      <ScrollArea className="w-full h-[30rem] max-h-[50vh] [&>div>div]:!block">
        <Stack direction="column" className="gap-2">
          {topSites.map(site => (
            <button
              key={site.url}
              onClick={() => toggleSite(site.url)}
              role="checkbox"
              aria-checked={site.selected}
              aria-label={`${site.title} - ${getHostname(site.url)}`}
              className={cn('flex items-center gap-3 p-3 rounded-lg border transition-colors text-left w-full')}>
              <img
                src={getFaviconUrl(site.url)}
                alt=""
                className="size-6 rounded shrink-0"
                onError={e => {
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <Stack direction="column" className="flex-1 min-w-0">
                <Text level="s" className="max-w-full truncate">
                  {site.title}
                </Text>
                <Stack className="gap-1 items-center">
                  <Text level="xs" gray className="max-w-[8rem] truncate">
                    {getHostname(site.url)}
                  </Text>
                  {site.alreadyExists && (
                    <Text level="xs" className="text-yellow-600 dark:text-yellow-500 shrink-0">
                      {t('onboardingUrlHostAlreadyExists')}
                    </Text>
                  )}
                </Stack>
              </Stack>
              <CheckboxIndicator checked={site.selected} />
            </button>
          ))}
        </Stack>
      </ScrollArea>
    )
  }

  return (
    <StepContainer className="w-full">
      <StepHeader
        icon={<Link className="size-8 text-primary" />}
        title={t('onboardingQuickLinksTitle')}
        description={t('onboardingQuickLinksDescription')}
      />

      {renderContent()}

      <StepNavigationButtons
        onBack={onBack}
        onNext={handleImport}
        onSkip={onNext}
        nextLabel={t('onboardingImportSelected')}
        nextDisabled={!topSites.some(s => s.selected)}
      />
    </StepContainer>
  )
}
