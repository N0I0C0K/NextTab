import { useState } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/shared'
import { t } from '@/utils/i18n'
import {
  ACTIVITY_SNAPSHOT_MESSAGE,
  ACTIVITY_WINDOW_MS,
  ACTIVITY_RETENTION_MS,
  ACTIVITY_BYTE_BUDGET,
  type ActivitySnapshot,
} from '@/utils/page-activity/model'
import { ACTIVITY_SCORING } from '@/utils/page-activity/scoring'
import { OPEN_TAB_MULTIPLIER, normalizePageUrl, queryProfileTabs } from '../../services/return-pages'

/** Mounted only in development/test builds; exports the Profile's retained raw records. */
export function EventExportButton() {
  const [exporting, setExporting] = useState(false)
  const exportEvents = async () => {
    setExporting(true)
    try {
      const snapshot: ActivitySnapshot | undefined = await chrome.runtime.sendMessage({
        type: ACTIVITY_SNAPSHOT_MESSAGE,
        incognito: chrome.extension?.inIncognitoContext,
      })
      if (!Array.isArray(snapshot?.pages) || !Array.isArray(snapshot?.events) || !Number.isFinite(snapshot?.now))
        throw new Error('Activity unavailable')
      // Keep current tab state separate so the multiplier can be reproduced without guessing from events.
      const openTabs = await queryProfileTabs().catch(() => null)
      const exportedAt = new Date().toISOString()
      const data = {
        format: 'nexttab-page-activity',
        version: 1,
        exportedAt,
        activityWindowMs: ACTIVITY_WINDOW_MS,
        retentionMs: ACTIVITY_RETENTION_MS,
        byteBudget: ACTIVITY_BYTE_BUDGET,
        scoringParameters: { ...ACTIVITY_SCORING, openTabMultiplier: OPEN_TAB_MULTIPLIER },
        openTabs:
          openTabs
            ?.filter(tab => normalizePageUrl(tab.url ?? tab.pendingUrl ?? ''))
            .map(tab => ({ url: tab.url ?? tab.pendingUrl, title: tab.title })) ?? null,
        snapshot,
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      try {
        link.href = url
        link.download = `nexttab-events-${exportedAt.replace(/[:.]/g, '-')}.json`
        document.body.appendChild(link)
        link.click()
      } finally {
        link.remove()
        URL.revokeObjectURL(url)
      }
    } catch {
      toast.error(t('returnExportEventsFailed'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={exporting}
      aria-busy={exporting}
      data-testid="return-export-events"
      onClick={() => void exportEvents()}>
      <Download size={14} aria-hidden="true" />
      {t(exporting ? 'returnExportingEvents' : 'returnExportEvents')}
    </Button>
  )
}
