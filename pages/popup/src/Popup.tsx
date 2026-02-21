import '@src/Popup.css'
import { withErrorBoundary, withSuspense } from '@extension/shared'
import { PopupQuickUrlGrid, PopupToolbar } from './components'

const Popup = () => {
  return (
    <div className="popup-container flex flex-col">
      <div className="flex-1 overflow-hidden">
        <PopupQuickUrlGrid />
      </div>
      <PopupToolbar />
    </div>
  )
}

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>)
