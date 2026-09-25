import './App.css'
import { withErrorBoundary, withSuspense } from '@/utils'
import { PopupQuickUrlGrid, PopupToolbar } from './components'
import { t } from '@/utils/i18n'

const Popup = () => {
  return (
    <div className="popup-container flex flex-col">
      <header className="popup-header flex items-center justify-between px-4 py-4">
        <div className="nt-brand">
          <span className="nt-brand-mark" aria-hidden="true" />
          <span>NextTab</span>
        </div>
        <span className="text-xs text-muted-foreground">{t('quickLinksHeading')}</span>
      </header>
      <main className="popup-content min-h-0 flex-1 overflow-y-auto" aria-label={t('quickLinksHeading')}>
        <PopupQuickUrlGrid />
      </main>
      <PopupToolbar />
    </div>
  )
}

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>)
