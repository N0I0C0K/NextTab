import { AddCurrentPageButton } from './AddCurrentPageButton'

export const PopupToolbar = () => {
  return (
    <div className="popup-toolbar flex items-start justify-center gap-2 px-3 py-3">
      <AddCurrentPageButton />
      {/* Add more tool buttons here */}
    </div>
  )
}
