import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { PopupPage } from '../popup-pages'

export type PopupScrollListHandle = { focusItem: (index: number) => void }

/** Native scrolling, with bounded rendering for long lists and a retained focused row. */
export const PopupScrollList = forwardRef<
  PopupScrollListHandle,
  {
    items: PopupPage[]
    tiles: boolean
    scroll: RefObject<HTMLElement>
    renderItem: (item: PopupPage, tile: boolean, index: number) => ReactNode
  }
>(function PopupScrollList({ items, tiles, scroll, renderItem }, ref) {
  const root = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<number>()
  const measuredLayout = useRef('')
  const [focused, setFocused] = useState<number>()
  const [viewport, setViewport] = useState({ top: 0, height: 400, columns: tiles ? 4 : 1, step: 52 })
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element) return
    element.scrollTop = 0
    const measure = () => {
      const style = getComputedStyle(element)
      const columns = tiles ? Number(style.getPropertyValue('--popup-columns')) || 4 : 1
      const step = Number(style.getPropertyValue(tiles ? '--popup-grid-step' : '--popup-row-step')) || 52
      const layout = `${columns}:${step}:${element.clientHeight}`
      if (measuredLayout.current !== layout) {
        const active = document.activeElement as HTMLElement | null
        if (active && root.current?.contains(active) && active.dataset.popupIndex !== undefined)
          pendingFocus.current = Number(active.dataset.popupIndex)
        measuredLayout.current = layout
      }
      setViewport(previous =>
        previous.top === element.scrollTop &&
        previous.height === element.clientHeight &&
        previous.columns === columns &&
        previous.step === step
          ? previous
          : { top: element.scrollTop, height: element.clientHeight, columns, step },
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
  const rowCount = Math.ceil(items.length / columns)
  const renderAll = items.length <= (tiles ? 60 : 20)
  const first = renderAll ? 0 : Math.max(0, Math.floor(top / step) - 2)
  const last = renderAll ? rowCount : Math.min(rowCount, Math.ceil((top + height) / step) + 2)
  const rows = new Set(Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index))
  if (focused !== undefined && focused < items.length) rows.add(Math.floor(focused / columns))

  useImperativeHandle(
    ref,
    () => ({
      focusItem(index) {
        const element = scroll.current
        if (!element || index < 0 || index >= items.length) return
        const itemTop = Math.floor(index / columns) * step
        if (itemTop < element.scrollTop) element.scrollTop = itemTop
        else if (itemTop + step > element.scrollTop + element.clientHeight)
          element.scrollTop = itemTop + step - element.clientHeight
        pendingFocus.current = index
        setFocused(index)
        setViewport(previous => ({ ...previous, top: element.scrollTop }))
      },
    }),
    [columns, step, scroll, items.length],
  )
  useLayoutEffect(() => {
    if (pendingFocus.current === undefined) return
    const button = root.current?.querySelector<HTMLButtonElement>(`[data-popup-index="${pendingFocus.current}"]`)
    if (button) {
      button.focus({ preventScroll: true })
      button.scrollIntoView({ block: 'nearest' })
      pendingFocus.current = undefined
    }
  })
  return (
    <div
      ref={root}
      className="popup-scroll-list"
      style={{ height: Math.max(0, rowCount * step - (tiles ? 6 : 0)) }}
      onFocusCapture={event => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-popup-index]')
        if (button) setFocused(Number(button.dataset.popupIndex))
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(undefined)
      }}>
      {[...rows]
        .sort((a, b) => a - b)
        .map(row => (
          <div
            key={row}
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
