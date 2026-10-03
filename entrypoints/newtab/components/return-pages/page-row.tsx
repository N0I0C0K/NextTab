import { useRef, useState, type MouseEvent } from 'react'
import { ArrowUpRight, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/shared'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/ui/dropdown-menu'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
import { setReturnPagePreference } from '@/utils/storage'
import { t } from '@/utils/i18n'
import { matchingPageTabs, normalizePageUrl, switchToPageTab, type ReturnPage } from '../../services/return-pages'
import { formatPageTime } from './page-format'
import { PageDetailsDialog } from './page-details-dialog'

export function PageRow({
  page,
  tabs,
  matchingTabs,
  frequent = false,
  feedback = false,
  tabId,
  onTabClosed,
}: {
  page: ReturnPage
  tabs: chrome.tabs.Tab[]
  matchingTabs: chrome.tabs.Tab[]
  frequent?: boolean
  feedback?: boolean
  tabId?: number
  onTabClosed?: (tabId: number) => void
}) {
  // Mount dialogs on first use, then keep them for close animations and focus restoration.
  const [choices, setChoices] = useState<chrome.tabs.Tab[] | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState<boolean | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [closingTab, setClosingTab] = useState(false)
  const normalized = normalizePageUrl(page.url)!
  const host = new URL(page.url).hostname
  const openedTab = tabId === undefined ? undefined : matchingTabs.find(tab => tab.id === tabId)
  const isOpen = tabId === undefined ? matchingTabs.length > 0 : !!openedTab
  const action = t(isOpen ? 'returnSwitchTab' : 'returnOpenPage')
  const open = async (event: MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget
    try {
      if (event.ctrlKey || event.metaKey) {
        await chrome.tabs.create({ url: page.url, active: true })
        return
      }
      // Resolve at click time, so a tab closed since the snapshot does not break the action.
      const matches = (await matchingPageTabs(page.url)).filter(tab => tabId === undefined || tab.id === tabId)
      if (matches.length > 1) setChoices(matches)
      else if (matches.length) await switchToPageTab(matches[0])
      else await chrome.tabs.update({ url: page.url })
    } catch {
      toast.error(t('returnOpenFailed'))
    }
  }
  const closeTab = async () => {
    if (tabId === undefined || closingTab) return
    setClosingTab(true)
    try {
      await chrome.tabs.remove(tabId)
      onTabClosed?.(tabId)
      toast.success(t('returnTabClosed'))
    } catch {
      setClosingTab(false)
      toast.error(t('returnCloseTabFailed'))
      moreRef.current?.focus()
    }
  }
  const hide = async (field: 'hiddenUrls' | 'excludedHosts', value: string) => {
    await setReturnPagePreference(field, value, true)
    toast(t(field === 'hiddenUrls' ? 'returnHidden' : 'returnExcluded'), {
      action: { label: t('undoAction'), onClick: () => void setReturnPagePreference(field, value, false) },
    })
  }
  return (
    <div
      className="nt-return-row"
      data-testid="return-page-row"
      data-page-url={page.url}
      data-tab-id={tabId}
      data-interacting={menuOpen || detailsOpen || (choices?.length ?? 0) > 0 || closingTab || undefined}>
      <Tooltip disabled={menuOpen || !!detailsOpen || (choices?.length ?? 0) > 0 || closingTab}>
        <TooltipTrigger
          delay={350}
          render={
            <button type="button" className="nt-return-open" onClick={open} aria-label={`${page.title} — ${action}`} />
          }>
          <QuickLinkIcon url={page.url} title={page.title} className="nt-link-icon" />
          <span className="nt-return-copy">
            <span className="nt-return-title">{page.title}</span>
            <span className="nt-return-meta">
              {host} ·{' '}
              {frequent
                ? t('returnVisitDays', String(page.activeDays))
                : page.lastVisitTime > 0
                  ? `${isOpen ? `${t('returnAlreadyOpen')} · ` : ''}${formatPageTime(page.lastVisitTime)}`
                  : t(isOpen ? 'returnAlreadyOpen' : 'returnSaved')}
              {openedTab && matchingTabs.length > 1 && (
                <>
                  {' '}
                  ·{' '}
                  {t(
                    'tabWindow',
                    String([...new Set(tabs.map(tab => tab.windowId))].indexOf(openedTab.windowId) + 1),
                  )}{' '}
                  · {t('tabPosition', String(openedTab.index + 1))}
                </>
              )}
            </span>
          </span>
          <span className="nt-return-hint" aria-hidden="true">
            {action} <ArrowUpRight size={14} />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm flex-col items-start gap-1 break-words">
          <span>{page.title}</span>
          <span>{action}</span>
        </TooltipContent>
      </Tooltip>
      <DropdownMenu onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <button
              ref={moreRef}
              type="button"
              className="nt-return-more"
              aria-label={t('returnPageActions', page.title)}
            />
          }>
          <MoreHorizontal size={16} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" finalFocus={closingTab || detailsOpen ? false : undefined}>
          <DropdownMenuItem onClick={() => setDetailsOpen(true)}>{t('returnDetails')}</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              void navigator.clipboard.writeText(page.url).then(
                () => toast.success(t('returnLinkCopied')),
                () => toast.error(t('returnCopyFailed'), { description: page.url }),
              )
            }}>
            {t('returnCopyLink')}
          </DropdownMenuItem>
          {openedTab && (
            <DropdownMenuItem variant="destructive" disabled={closingTab} onClick={() => void closeTab()}>
              {t('returnCloseTab')}
            </DropdownMenuItem>
          )}
          {feedback && (
            <>
              <DropdownMenuItem onClick={() => void hide('hiddenUrls', normalized)}>
                {t('returnHidePage')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void hide('excludedHosts', host)}>
                {t('returnExcludeSite')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {detailsOpen !== null && (
        <PageDetailsDialog
          page={page}
          frequent={frequent}
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          finalFocus={moreRef}
        />
      )}
      {choices !== null && (
        <Dialog
          open={choices.length > 0}
          onOpenChange={value => {
            if (!value) setChoices([])
          }}>
          <DialogContent className="nt-page-choice-dialog" finalFocus={triggerRef}>
            <DialogTitle>{t('chooseOpenTab')}</DialogTitle>
            <DialogDescription>{t('chooseOpenTabDescription')}</DialogDescription>
            <div className="nt-page-choice-list">
              {choices.map(tab => (
                <button
                  type="button"
                  key={tab.id}
                  className="nt-tab-choice"
                  onClick={() => {
                    void switchToPageTab(tab).then(
                      () => setChoices([]),
                      () => {
                        setChoices([])
                        toast.error(t('returnOpenFailed'))
                      },
                    )
                  }}>
                  <span>{tab.title || page.title}</span>
                  <span className="nt-return-meta">
                    {t('tabWindow', String([...new Set(choices.map(item => item.windowId))].indexOf(tab.windowId) + 1))}{' '}
                    · {t('tabPosition', String(tab.index + 1))}
                  </span>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
