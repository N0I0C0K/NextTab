import type { Size } from '@newtab/lib/utils'
import type { QuickUrlItem } from '@extension/storage'
import { cn } from '@extension/ui'
import React, { type FC, useEffect, useMemo, useState } from 'react'
import type { Layouts } from 'react-grid-layout'
import { commonCols, commonBreakpoints, commonMaxRowsForEachPage, sortItemByLayouts } from './link-card-group'
import { ReactGridLayout } from './ReactGridLayout'
import { LinkCardItem } from './link-card-item'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

export const LinkCardPage: FC<{
  boxSize: Size
  urlItems: QuickUrlItem[]
  onUrlItemDragStart?: () => void
  onUrlItemDragEnd?: () => void
  onUrlItemOrderChange?: (urlItems: QuickUrlItem[]) => void
}> = ({ boxSize, urlItems, onUrlItemDragEnd, onUrlItemDragStart, onUrlItemOrderChange }) => {
  const [currentCols, setCols] = useState<number>(12)
  const [mounted, setMounted] = useState(false)
  const [urlItemsState, setUrlItems] = useState(urlItems)

  const layouts = useMemo<Layouts>(() => {
    return Object.fromEntries(
      Object.entries(commonCols).map(([bk, col]) => [
        bk,
        urlItemsState.map((val, idx) => ({
          i: val.id,
          x: idx % col,
          y: Math.floor(idx / col),
          w: 1,
          h: 1,
          isResizable: false,
        })),
      ]),
    )
  }, [urlItemsState])
  const maxRows = useMemo(() => {
    return Math.min(Math.ceil(urlItemsState.length / currentCols), commonMaxRowsForEachPage)
  }, [currentCols, urlItemsState])

  useEffect(() => {
    // use to calculate the current cols for the initial layout
    const [, width] = boxSize
    const curBp = Object.entries(commonBreakpoints).find(([, bpSize]) => bpSize <= width)
    setCols(commonCols[(curBp?.[0] ?? 'md') as keyof typeof commonCols])
    setMounted(true)
  }, [boxSize])

  useEffect(() => {
    setUrlItems(urlItems)
  }, [urlItems, urlItemsState])

  return (
    <ReactGridLayout
      className={cn('w-full', mounted ? 'transition-transform' : 'transition-none')}
      layouts={layouts}
      breakpoints={commonBreakpoints}
      cols={commonCols}
      compactType={'horizontal'}
      draggableHandle="#drag-area"
      onBreakpointChange={(nb, nc) => {
        setCols(nc)
      }}
      onLayoutChange={layout => {
        setUrlItems(val => sortItemByLayouts(layout, val))
        onUrlItemOrderChange?.(urlItemsState)
      }}
      rowHeight={120}
      width={boxSize[1]}
      useCSSTransforms={false}
      maxRows={maxRows}
      onDragStart={onUrlItemDragStart}
      onDragStop={() => {
        onUrlItemDragEnd?.()
      }}>
      {urlItemsState.map(val => (
        <LinkCardItem {...val} key={val.id} />
      ))}
    </ReactGridLayout>
  )
}
