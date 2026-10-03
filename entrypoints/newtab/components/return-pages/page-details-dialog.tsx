import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/shared'
import { QuickLinkIcon } from '@/components/shared/custom/quick-link-icon'
import { t } from '@/utils/i18n'
import { fetchPageDetails, type PageDetails } from '../../services/page-details'
import type { ReturnPage } from '../../services/return-pages'
import { formatDuration, formatPageTime } from './page-format'

function PageTime({ value }: { value: number }) {
  if (!value) return <>—</>
  return (
    <>
      <span>{formatPageTime(value)}</span>
      <time dateTime={new Date(value).toISOString()}>
        {new Intl.DateTimeFormat(chrome.i18n.getUILanguage(), { dateStyle: 'medium', timeStyle: 'short' }).format(
          value,
        )}
      </time>
    </>
  )
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="nt-page-detail-metric">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function DetailInfo({
  label,
  children,
  open,
  onOpenChange,
}: {
  label: string
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Tooltip open={open} onOpenChange={onOpenChange}>
      <TooltipTrigger
        delay={250}
        closeOnClick={false}
        render={<button type="button" className="nt-return-info" aria-label={label} />}
        onClick={() => onOpenChange(true)}>
        <Info size={14} aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="nt-return-rules">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export function PageDetailsDialog({
  page,
  frequent,
  open,
  onOpenChange,
  finalFocus,
}: {
  page: ReturnPage
  frequent: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  finalFocus: RefObject<HTMLButtonElement>
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [result, setResult] = useState<PageDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [info, setInfo] = useState<'usage' | 'history' | null>(null)
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setLoading(true)
    setResult(null)
    setError(false)
    setInfo(null)
    void fetchPageDetails(page, frequent, controller.signal).then(
      value => {
        if (!controller.signal.aborted) {
          setResult(value)
          setLoading(false)
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setError(true)
          setLoading(false)
        }
      },
    )
    return () => controller.abort()
  }, [open, page, frequent])

  const activity = result?.activity
  const history = result?.history
  const number = (value: number | undefined) =>
    value === undefined ? '—' : new Intl.NumberFormat(chrome.i18n.getUILanguage()).format(value)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="nt-page-details-dialog"
        data-testid="page-details-dialog"
        onKeyDownCapture={event => {
          // A hover-opened tooltip can be dismissed while focus remains on the dialog title.
          // Handle this before the dialog's Escape handler so only the explanation closes.
          if (event.key === 'Escape' && info) {
            event.preventDefault()
            event.stopPropagation()
            setInfo(null)
          }
        }}
        initialFocus={titleRef}
        finalFocus={finalFocus}>
        <DialogTitle
          render={
            <h2 ref={titleRef} tabIndex={-1} className="outline-none">
              {t('returnDetails')}
            </h2>
          }>
          {t('returnDetails')}
        </DialogTitle>
        <DialogDescription className="sr-only">{t('returnDetailsDescription')}</DialogDescription>
        <div className="nt-page-details-body" aria-busy={loading}>
          <div className="nt-page-details-identity">
            <QuickLinkIcon url={page.url} title={page.title} className="nt-link-icon nt-page-details-icon" />
            <div>
              <h3>{page.title}</h3>
              <p>{new URL(page.url).hostname}</p>
            </div>
          </div>
          {loading ? (
            <div className="nt-page-details-loading" role="status">
              <span className="sr-only">{t('loading')}</span>
              {Array.from({ length: 8 }, (_, index) => (
                <span key={index} className="nt-return-skeleton" aria-hidden="true" />
              ))}
            </div>
          ) : error ? (
            <p role="status">{t('returnHistoryError')}</p>
          ) : (
            <>
              <section aria-labelledby="nt-detail-activity-title">
                <h3 id="nt-detail-activity-title">
                  {t('returnDetailsForeground')}
                  <DetailInfo
                    label={t('returnDetailsUsageHelp')}
                    open={info === 'usage'}
                    onOpenChange={next => setInfo(current => (next ? 'usage' : current === 'usage' ? null : current))}>
                    <p>{t('returnDetailsActivityNote')}</p>
                  </DetailInfo>
                </h3>
                <dl className="nt-page-details-metrics">
                  <Metric label={t('returnDetailsViews')}>{number(activity?.views)}</Metric>
                  <Metric label={t('returnDetailsSwitches')}>{number(activity?.tabSwitches)}</Metric>
                  <Metric label={t('returnDetailsTotalTime')}>
                    {activity ? formatDuration(activity.totalSeconds) : '—'}
                  </Metric>
                  <Metric label={t('returnDetailsMedianTime')}>
                    {activity?.views ? formatDuration(activity.medianSeconds) : '—'}
                  </Metric>
                  <Metric label={t('returnDetailsActiveDays')}>{number(activity?.activeDays)}</Metric>
                  <Metric label={t('returnDetailsLastUsed')}>
                    <PageTime value={activity?.lastUsedAt ?? 0} />
                  </Metric>
                </dl>
                {!activity && (
                  <p className="nt-page-details-note" role="status">
                    {t(result?.activityUnavailable ? 'returnDetailsActivityError' : 'returnDetailsNoActivity')}
                  </p>
                )}
              </section>
              <section aria-labelledby="nt-detail-history-title">
                <h3 id="nt-detail-history-title">
                  {t('returnDetailsHistory', String(result?.historyDays ?? 7))}
                  <DetailInfo
                    label={t('returnDetailsHistoryHelp')}
                    open={info === 'history'}
                    onOpenChange={next =>
                      setInfo(current => (next ? 'history' : current === 'history' ? null : current))
                    }>
                    <p>{t(history?.limited ? 'returnDetailsHistoryLimited' : 'returnDetailsHistoryNote')}</p>
                  </DetailInfo>
                </h3>
                <dl className="nt-page-details-metrics">
                  <Metric label={t('returnDetailsHistoryVisits')}>{number(history?.visits)}</Metric>
                  <Metric label={t('returnDetailsLastVisit')}>
                    <PageTime value={history?.lastVisitTime ?? 0} />
                  </Metric>
                </dl>
                {!history && (
                  <p className="nt-page-details-note" role="status">
                    {t('returnDetailsHistoryError')}
                  </p>
                )}
              </section>
              {result && (
                <p className="nt-page-details-asof">
                  {t(
                    'returnDetailsAsOf',
                    new Intl.DateTimeFormat(chrome.i18n.getUILanguage(), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(result.evaluatedAt),
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
