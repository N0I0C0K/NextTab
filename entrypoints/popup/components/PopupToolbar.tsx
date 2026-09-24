import { AddCurrentPageButton } from './AddCurrentPageButton'

export const PopupToolbar = () => {
  return (
    <div className="flex items-start justify-center gap-2 px-3 py-2 border-t border-border">
      <AddCurrentPageButton />
      {/* Add more tool buttons here */}
    </div>
  )
}
