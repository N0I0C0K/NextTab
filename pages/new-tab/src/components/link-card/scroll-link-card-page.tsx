import { cn } from '@/lib/utils'
import { type FC, useState, useRef, useEffect, useCallback } from 'react'
import { DndLinkCardPage } from './dnd-link-card-page'
import { ScrollArea } from '@extension/ui'
import { AddButton } from '@/src/components/add-button'
import { motion } from 'framer-motion'
import { useStorage } from '@extension/shared'
import { quickUrlItemsStorage, type QuickUrlItem } from '@extension/storage'

import './scroll-link-card-page.css'

const ROW_HEIGHT = 130
const MAX_ROWS = 6 // Maximum expanded height in rows

export const ScrollLinkCardPage: FC<{ className?: string; maxRow?: number }> = ({ className, maxRow = 2 }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const quickUrlItems = useStorage(quickUrlItemsStorage) as QuickUrlItem[]

  // Calculate the number of rows needed to show all content
  const calculateRowsNeeded = useCallback(() => {
    // Assuming auto-fit grid with minmax(6.5rem, 1fr), we need to estimate columns
    // For a rough estimate, assume average 8-10 items per row depending on container width
    const itemsCount = quickUrlItems.length
    const estimatedItemsPerRow = 8 // Conservative estimate
    const rowsNeeded = Math.ceil(itemsCount / estimatedItemsPerRow)
    return Math.min(rowsNeeded, MAX_ROWS)
  }, [quickUrlItems])

  // Handle scroll event
  const handleScroll = useCallback((event: Event) => {
    const target = event.target as HTMLElement
    if (target && target.scrollTop > 0 && !isExpanded) {
      setIsExpanded(true)
    }
  }, [isExpanded])

  useEffect(() => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollViewport) {
      scrollViewport.addEventListener('scroll', handleScroll)
      return () => {
        scrollViewport.removeEventListener('scroll', handleScroll)
      }
    }
    return undefined
  }, [handleScroll])

  const currentHeight = ROW_HEIGHT * maxRow
  const expandedHeight = ROW_HEIGHT * Math.max(calculateRowsNeeded(), maxRow)

  return (
    <motion.div
      className={cn(className, 'inner-shadow')}
      initial={{ height: currentHeight }}
      animate={{ height: isExpanded ? expandedHeight : currentHeight }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}>
      <div ref={scrollAreaRef} className="h-full">
        <ScrollArea className="w-full h-full" scrollHideDelay={200}>
          <DndLinkCardPage />
          <AddButton className="absolute bottom-2 right-2" />
        </ScrollArea>
      </div>
    </motion.div>
  )
}
