import { INITIAL_QUICK_URL_ITEMS } from '@/entrypoints/newtab/lib/consts'
import { useSize } from '@/entrypoints/newtab/lib/utils'
import { useDebounce, useStorage } from '@/utils'
import type { QuickUrlItem } from '@/utils/storage'
import { quickUrlItemsStorage, updateQuickUrlPart } from '@/utils/storage'
import { Stack } from '@/components/shared'
import { cn } from '@/utils/cn'
import type { CarouselApi } from '@/components/shared/ui/carousel'
import { Carousel, CarouselContent, CarouselItem, useCarsouselState } from '@/components/shared/ui/carousel'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import type { Layout } from 'react-grid-layout'
import { AddButton } from '../add-button'

import { chunk } from 'lodash'
import { LinkCardPage } from './link-card-page'

export function sortItemByLayouts(layouts: Layout[], urlItems: QuickUrlItem[]) {
  layouts.sort((lv, rv) => lv.x + lv.y * 1000 - (rv.x + rv.y * 1000))
  const ids = layouts.map(val => val.i)
  const idAndPriorityMapping = new Map(ids.map((val, idx) => [val, idx]))
  return urlItems.sort(
    (lv, rv) => (idAndPriorityMapping.get(lv.id) ?? 10000) - (idAndPriorityMapping.get(rv.id) ?? 10000),
  )
}

export type commonLayoutLike = {
  lg: number
  md: number
  sm: number
  xs: number
  xxs: number
}

type PageProps = {
  urlItems: QuickUrlItem[]
  firstItemIndexOfRoot: number
  pageIndex: number
}

// NOTE: MUST BE ORDERED BY SIZE DESC
export const commonBreakpoints: commonLayoutLike = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }
export const commonCols: commonLayoutLike = { lg: 12, md: 10, sm: 8, xs: 6, xxs: 3 }
const commonMaxRows: commonLayoutLike = { lg: 2, md: 2, sm: 2, xs: 3, xxs: 4 }
export const commonMaxRowsForEachPage = 10

const LinkCardFooter: FC<{
  className?: string
  pageNum: number
  currentPage: number
  onSelectClick?: (page: number) => void
}> = ({ className, pageNum, currentPage, onSelectClick }) => {
  return (
    <Stack direction={'row'} className={cn('items-center justify-center gap-2', className)}>
      {Array.from({ length: pageNum }, (_, idx) => {
        return (
          <motion.div
            key={idx}
            className={cn('rounded-full cursor-pointer', idx === currentPage ? 'bg-zinc-100' : 'bg-zinc-500/60')}
            style={{
              height: 8,
            }}
            animate={{
              width: idx === currentPage ? 18 : 8,
            }}
            onClick={() => {
              onSelectClick?.(idx)
            }}
          />
        )
      })}
    </Stack>
  )
}

export const LinkCardGroup: FC = () => {
  const ref = useRef<HTMLDivElement>(null)
  const size = useSize(ref)
  const [hasItemDragging, setHasItemDragging] = useState(false)
  const [currentLayout, setCurrentLayout] = useState<keyof commonLayoutLike>(() => {
    const [, width] = size
    const curBp = Object.entries(commonBreakpoints).find(([, bpSize]) => bpSize <= width)
    return (curBp?.[0] ?? 'md') as keyof commonLayoutLike
  })
  const userStorageItems = useStorage(quickUrlItemsStorage)
  const [carouselApi, setCarouselApi] = useState<CarouselApi>()

  const carouselState = useCarsouselState(carouselApi)

  const pageMaxItems = useMemo(() => {
    return commonCols[currentLayout] * commonMaxRows[currentLayout]
  }, [currentLayout])
  const pages: PageProps[] = useMemo<PageProps[]>(() => {
    const targetItems = userStorageItems.length > 0 ? userStorageItems : INITIAL_QUICK_URL_ITEMS
    return chunk(targetItems, pageMaxItems).map<PageProps>((val, idx) => {
      return {
        urlItems: val,
        firstItemIndexOfRoot: pageMaxItems * idx,
        pageIndex: idx,
      }
    })
  }, [userStorageItems, pageMaxItems])

  const delaySize = useDebounce(size, 50)

  useEffect(() => {
    const [, width] = delaySize
    const curBp = Object.entries(commonBreakpoints).find(([, bpSize]) => bpSize <= width)
    setCurrentLayout((curBp?.[0] ?? 'md') as keyof commonLayoutLike)
  }, [delaySize])

  return (
    <div
      ref={ref}
      className="relative backdrop-blur-2xl rounded-xl shadow-md dark:backdrop-brightness-75 duration-300 w-full
        overflow-hidden">
      <Carousel className="w-full" opts={{ duration: 50, watchDrag: !hasItemDragging }} setApi={setCarouselApi}>
        <CarouselContent>
          {pages.map(page => {
            return (
              <CarouselItem key={page.pageIndex}>
                <LinkCardPage
                  boxSize={size}
                  urlItems={page.urlItems}
                  onUrlItemDragStart={() => {
                    setHasItemDragging(true)
                  }}
                  onUrlItemDragEnd={() => {
                    setHasItemDragging(false)
                  }}
                  onUrlItemOrderChange={pageUrlItems => {
                    updateQuickUrlPart(page.firstItemIndexOfRoot, pageUrlItems)
                  }}
                />
              </CarouselItem>
            )
          })}
        </CarouselContent>
      </Carousel>
      <LinkCardFooter
        currentPage={carouselState.currentIndex}
        pageNum={pages.length}
        className="mb-2 z-10"
        onSelectClick={page => {
          carouselApi?.scrollTo(page)
        }}
      />
      <AddButton className="absolute right-1 bottom-1 size-8" />
    </div>
  )
}
