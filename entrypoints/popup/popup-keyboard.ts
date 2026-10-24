import type { PopupPage } from './popup-pages'

export type PopupModifiers = { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }
export const plainModifiers: PopupModifiers = { ctrlKey: false, metaKey: false, shiftKey: false }

export function popupAction(page: PopupPage, modifiers: PopupModifiers) {
  const control = modifiers.ctrlKey || modifiers.metaKey
  if (modifiers.shiftKey) return control ? 'popupOpenAdjacent' : 'popupOpenWindow'
  if (control) return 'popupOpenTab'
  return page.tabId !== undefined ? 'popupSwitch' : page.id.startsWith('history:') ? 'popupReopen' : 'popupOpen'
}

export function nextPopupIndex(
  key: string,
  index: number,
  count: number,
  gridCount: number,
  columns: number,
  pageRows: number,
): number {
  if (!count) return -1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === 'PageUp' || key === 'PageDown') {
    const step = Math.max(1, pageRows) * (gridCount ? columns : 1)
    return Math.max(0, Math.min(count - 1, Math.max(0, index) + (key === 'PageDown' ? step : -step)))
  }
  if (index < 0) return key === 'ArrowUp' ? count - 1 : 0
  if (key === 'ArrowLeft' || key === 'ArrowRight')
    return Math.max(0, Math.min(gridCount - 1, index + (key === 'ArrowRight' ? 1 : -1)))
  if (key === 'ArrowUp') return Math.max(-1, index < gridCount ? index - columns : index - 1)
  if (index < gridCount) {
    if (Math.floor(index / columns) < Math.ceil(gridCount / columns) - 1)
      return Math.min(gridCount - 1, index + columns)
    return gridCount < count ? gridCount : index
  }
  return Math.min(count - 1, index + 1)
}
