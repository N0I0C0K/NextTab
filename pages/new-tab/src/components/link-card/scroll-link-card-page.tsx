import { cn } from '@/lib/utils'
import { type FC, useState, useRef, useEffect, useCallback } from 'react'
import { DndLinkCardPage } from './dnd-link-card-page'
import { ScrollArea } from '@extension/ui'
import { AddButton } from '@/src/components/add-button'
import { motion } from 'framer-motion'
import { useStorage } from '@extension/shared'
import { quickUrlItemsStorage } from '@extension/storage'

import './scroll-link-card-page.css'

const ROW_HEIGHT = 130
const MAX_ROWS = 6 // Maximum expanded height in rows
const ESTIMATED_ITEMS_PER_ROW = 8 // Conservative estimate for grid auto-fit calculation

export const ScrollLinkCardPage: FC<{ className?: string; maxRow?: number }> = ({ className, maxRow = 2 }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const quickUrlItems = useStorage(quickUrlItemsStorage)

  // Calculate the number of rows needed to show all content
  const calculateExpandedHeight = useCallback(() => {
    // Get the actual content height if available
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (viewport) {
      const scrollHeight = viewport.scrollHeight
      // Cap at maximum of MAX_ROWS
      const maxHeight = ROW_HEIGHT * MAX_ROWS
      return Math.min(scrollHeight, maxHeight)
    }
    
    // Fallback: estimate based on number of items
    const itemsCount = quickUrlItems?.length ?? 0
    const rowsNeeded = Math.ceil(itemsCount / ESTIMATED_ITEMS_PER_ROW)
    const estimatedRows = Math.min(Math.max(rowsNeeded, maxRow), MAX_ROWS)
    return ROW_HEIGHT * estimatedRows
  }, [quickUrlItems, maxRow])

  // Handle scroll event
  const handleScroll = useCallback((event: Event) => {
    const target = event.target as HTMLElement
    if (target && target.scrollTop > 0 && !isExpanded) {
      setIsExpanded(true)
    }
  }, [isExpanded])

  useEffect(() => {
    const scrollViewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (!scrollViewport) return

    scrollViewport.addEventListener('scroll', handleScroll)
    return () => {
      scrollViewport.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  const currentHeight = ROW_HEIGHT * maxRow
  const expandedHeight = calculateExpandedHeight()

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
          <div ref={contentRef}>
            <DndLinkCardPage />
          </div>
          <AddButton className="absolute bottom-2 right-2" />
        </ScrollArea>
      </div>
    </motion.div>
  )
}
