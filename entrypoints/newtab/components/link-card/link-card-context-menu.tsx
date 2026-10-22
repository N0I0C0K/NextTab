import { getDefaultIconUrl } from '@/entrypoints/newtab/lib/url'
import { QuickItemEditForm } from '@/entrypoints/newtab/components/quick-item-edit-form'
import { putQuickUrlById, removeQuickUrlById } from '@/utils/storage'
import {
  ContextMenuItem,
  ContextMenuItemWitchIcon,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuGroup,
} from '@/components/shared/ui/context-menu'
import type { GlobalDialogProps } from '@/entrypoints/newtab/providers'
import { Pencil, Trash, History } from 'lucide-react'
import { t } from '@/utils/i18n'
import type { ReactNode } from 'react'
import type { RecentPage } from '../../recent-page-recommendations'
import { DomainHistoryDialog } from './domain-history-dialog'
import { queryProfileTabs, switchToPageTab } from '../../services/return-pages'
import { toast } from 'sonner'
import { SaveQuickLinkButton } from '../save-quick-link-button'

interface LinkCardContextMenuContentProps {
  id: string
  title: string
  url: string
  relatedBookmarks: chrome.bookmarks.BookmarkTreeNode[]
  bookmarkError: boolean
  showBookmarks: boolean
  relatedTabs: chrome.tabs.Tab[]
  showOpenTabs: boolean
  recommendedPages: RecentPage[]
  globalDialog: GlobalDialogProps
  onShowAll: (source: 'tabs' | 'bookmarks') => void
}

/**
 * Extract domain from URL string
 */
const getDomainFromUrl = (urlString: string): string => {
  try {
    return new URL(urlString).hostname
  } catch {
    return urlString
  }
}

/**
 * LinkCardContextMenuContent - The context menu items (edit, delete, bookmarks, and open tabs)
 * Returns an array of menu items to be placed inside ContextMenuContent
 */
export const LinkCardContextMenuContent = ({
  id,
  title,
  url,
  relatedBookmarks,
  bookmarkError,
  showBookmarks,
  relatedTabs,
  showOpenTabs,
  recommendedPages,
  globalDialog,
  onShowAll,
}: LinkCardContextMenuContentProps): ReactNode => {
  return (
    <>
      <ContextMenuItemWitchIcon
        data-testid="quick-link-edit"
        IconType={Pencil}
        onClick={() => {
          globalDialog.show(
            <QuickItemEditForm
              defaultValue={{ title, url }}
              onSubmit={item => {
                putQuickUrlById(id, {
                  id: id,
                  title: item.title,
                  url: item.url,
                })
                globalDialog.close()
              }}
              submitButtonTitle="Save"
            />,
            'Edit',
          )
        }}>
        {t('editQuickItem')}
      </ContextMenuItemWitchIcon>
      <ContextMenuItemWitchIcon
        data-testid="quick-link-history"
        IconType={History}
        onClick={() => {
          const domain = getDomainFromUrl(url)
          globalDialog.show(
            <DomainHistoryDialog domain={domain} />,
            t('domainHistory'),
            undefined,
            'w-[calc(100%-2rem)] sm:max-w-4xl max-h-[calc(100dvh-2rem)] gap-5 p-5 sm:p-6',
          )
        }}>
        {t('viewRecentHistory')}
      </ContextMenuItemWitchIcon>
      <ContextMenuItemWitchIcon
        data-testid="quick-link-delete"
        className="text-red-800"
        IconType={Trash}
        onClick={() => {
          globalDialog.confirm(t('deleteQuickItemConfirm', title), t('deleteQuickItemWarning'), () => {
            removeQuickUrlById(id)
            globalDialog.close()
          })
        }}>
        {t('deleteQuickItem')}
      </ContextMenuItemWitchIcon>

      {recommendedPages.length > 0 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>{t('domainRecommendedPages')}</ContextMenuLabel>
            {recommendedPages.map(page => (
              <ContextMenuItem
                key={page.url}
                data-testid="domain-recommended-page"
                className="flex min-w-0 items-center gap-2"
                onClick={event => {
                  if (event.ctrlKey || event.metaKey) {
                    void chrome.tabs.create({ url: page.url, active: true })
                  } else {
                    void chrome.tabs.update({ url: page.url })
                  }
                }}>
                <img
                  src={getDefaultIconUrl(page.url)}
                  alt=""
                  className="size-4 shrink-0 rounded-sm"
                  onError={event => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
                <span className="min-w-0 flex-1 truncate" title={`${page.title}\n${page.url}`}>
                  {page.title}
                </span>
                <SaveQuickLinkButton title={page.title} url={page.url} />
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
        </>
      )}

      {/* Related Bookmarks Section */}
      {showBookmarks && (relatedBookmarks.length > 0 || bookmarkError) && (
        <>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>
              {t('relatedBookmarks')} · {bookmarkError ? '—' : relatedBookmarks.length}
            </ContextMenuLabel>
            {relatedBookmarks.slice(0, 5).map(bookmark => (
              <ContextMenuItem
                key={bookmark.id}
                data-testid="related-bookmark"
                data-bookmark-id={bookmark.id}
                onClick={event => {
                  if (bookmark.url) {
                    if (event.ctrlKey || event.metaKey) void chrome.tabs.create({ url: bookmark.url, active: true })
                    else void chrome.tabs.update({ url: bookmark.url })
                  }
                }}
                className="flex items-center gap-2">
                <img
                  src={getDefaultIconUrl(bookmark.url || '')}
                  alt={bookmark.title || bookmark.url || 'Bookmark icon'}
                  className="size-4 rounded-sm flex-shrink-0"
                  onError={e => {
                    // Fallback to hide broken images
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <span className="min-w-0 flex-1 truncate" title={bookmark.title || bookmark.url}>
                  {bookmark.title || bookmark.url}
                </span>
                {bookmark.url && <SaveQuickLinkButton title={bookmark.title} url={bookmark.url} />}
              </ContextMenuItem>
            ))}
            {(relatedBookmarks.length > 5 || bookmarkError) && (
              <ContextMenuItem data-testid="all-site-bookmarks" onClick={() => onShowAll('bookmarks')}>
                {bookmarkError
                  ? t('navigationReadFailed') + ' · ' + t('retryAction')
                  : t('navigationAllBookmarks', String(relatedBookmarks.length))}
              </ContextMenuItem>
            )}
          </ContextMenuGroup>
        </>
      )}

      {/* Related Open Tabs Section */}
      {showOpenTabs && relatedTabs.length > 0 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuLabel>
              {t('relatedOpenTabs')} · {relatedTabs.length}
            </ContextMenuLabel>
            {relatedTabs.slice(0, 5).map(tab => (
              <ContextMenuItem
                key={tab.id}
                data-testid="related-tab"
                data-tab-id={tab.id}
                onClick={() => {
                  void queryProfileTabs()
                    .then(async tabs => {
                      const current = tabs.find(
                        item =>
                          item.id === tab.id &&
                          getDomainFromUrl(item.url ?? item.pendingUrl ?? '') === getDomainFromUrl(url),
                      )
                      if (current) await switchToPageTab(current)
                    })
                    .catch(() => toast.error(t('returnOpenFailed')))
                }}
                className="flex items-center gap-2">
                <img
                  src={tab.favIconUrl || getDefaultIconUrl(tab.url || '')}
                  alt={tab.title || tab.url || 'Tab icon'}
                  className="size-4 rounded-sm flex-shrink-0"
                  onError={e => {
                    // Fallback to hide broken images
                    e.currentTarget.style.display = 'none'
                  }}
                />
                <span className="min-w-0 flex-1 truncate" title={tab.title || tab.url}>
                  {tab.title || tab.url}
                </span>
                {tab.url && <SaveQuickLinkButton title={tab.title || tab.url} url={tab.url} />}
              </ContextMenuItem>
            ))}
            {relatedTabs.length > 5 && (
              <ContextMenuItem data-testid="all-site-tabs" onClick={() => onShowAll('tabs')}>
                {t('navigationAllTabs', String(relatedTabs.length))}
              </ContextMenuItem>
            )}
          </ContextMenuGroup>
        </>
      )}
    </>
  )
}

LinkCardContextMenuContent.displayName = 'LinkCardContextMenuContent'
