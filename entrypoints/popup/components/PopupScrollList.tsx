import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { PopupPage } from '../popup-pages'

export type PopupScrollListHandle = { scrollToItem: (index: number) => void }

/** Keep the active descendant mounted without moving input focus or fighting wheel scrolling. */
export const PopupScrollList = forwardRef<
  PopupScrollListHandle,
  {
    items: PopupPage[]
    tiles: boolean
    listbox: boolean
    activeIndex: number
    scroll: RefObject<HTMLElement>
    renderItem: (item: PopupPage, tile: boolean, index: number) => ReactNode
  }
>(function PopupScrollList({ items, tiles, listbox, activeIndex, scroll, renderItem }, ref) {
  const [viewport, setViewport] = useState({ ready: false, top: 0, height: 400, columns: tiles ? 4 : 1, step: 52 })
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element) return
    const measure = () => {
      const style = getComputedStyle(element)
      const columns = tiles ? Number(style.getPropertyValue('--popup-columns')) || 4 : 1
      const step = Number(style.getPropertyValue(tiles ? '--popup-grid-step' : '--popup-row-step')) || 52
      setViewport(previous =>
        previous.ready &&
        previous.top === element.scrollTop &&
        previous.height === element.clientHeight &&
        previous.columns === columns &&
        previous.step === step
          ? previous
          : { ready: true, top: element.scrollTop, height: element.clientHeight, columns, step },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    element.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', measure)
    }
  }, [scroll, tiles])
  const { columns, step, height, top } = viewport
  const lastSelectionLayout = useRef('')
  const activeId = items[activeIndex]?.id
  const scrollToItem = useCallback(
    (index: number) => {
      const element = scroll.current
      if (!element || index < 0 || index >= items.length) return
      const itemTop = Math.floor(index / columns) * step
      if (itemTop < element.scrollTop) element.scrollTop = itemTop
      else if (itemTop + step > element.scrollTop + element.clientHeight)
        element.scrollTop = itemTop + step - element.clientHeight
      setViewport(previous => (previous.top === element.scrollTop ? previous : { ...previous, top: element.scrollTop }))
    },
    [columns, step, scroll, items.length],
  )
  useImperativeHandle(ref, () => ({ scrollToItem }), [scrollToItem])
  useLayoutEffect(() => {
    if (!viewport.ready) return
    // A disappearing retry notice changes content height without a window resize.
    const layout = `${activeId}:${columns}:${step}:${window.innerHeight}`
    if (lastSelectionLayout.current === layout) return
    const initial = !lastSelectionLayout.current
    lastSelectionLayout.current = layout
    // The parent owns initial scroll, including restoring search's previous position.
    if (!initial) scrollToItem(activeIndex)
  }, [activeId, activeIndex, columns, step, scrollToItem, height, viewport.ready])
  const rowCount = Math.ceil(items.length / columns)
  const renderAll = items.length <= (tiles ? 60 : 20)
  const first = renderAll ? 0 : Math.max(0, Math.floor(top / step) - 2)
  const last = renderAll ? rowCount : Math.min(rowCount, Math.ceil((top + height) / step) + 2)
  const rows = new Set(Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index))
  if (activeIndex >= 0 && activeIndex < items.length) rows.add(Math.floor(activeIndex / columns))
  return (
    <div
      className="popup-scroll-list"
      style={{ height: Math.max(0, rowCount * step - (tiles ? 6 : 0)) }}
      role="presentation">
      {[...rows]
        .sort((a, b) => a - b)
        .map(row => (
          <div
            key={row}
            role={listbox ? 'presentation' : 'row'}
            aria-rowindex={listbox ? undefined : row + 1}
            className={tiles ? 'popup-scroll-row quick-url-grid' : 'popup-scroll-row'}
            style={{ top: row * step }}>
            {items
              .slice(row * columns, (row + 1) * columns)
              .map((item, index) => renderItem(item, tiles, row * columns + index))}
          </div>
        ))}
    </div>
  )
})
