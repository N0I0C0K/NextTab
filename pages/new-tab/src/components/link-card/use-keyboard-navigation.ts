import { useHotkeys } from 'react-hotkeys-hook'
import { useState, useCallback, useEffect } from 'react'
import type { RefObject } from 'react'
import type { QuickUrlItem } from '@extension/storage'

// Vertical alignment tolerance in pixels for detecting items on the same row
const ROW_DETECTION_THRESHOLD = 5

interface UseKeyboardNavigationOptions {
  items: QuickUrlItem[]
  enabled: boolean
  /**
   * Container ref to calculate actual grid columns dynamically.
   * If provided, the hook will calculate the real column count based on the grid layout.
   */
  containerRef?: RefObject<HTMLElement>
}

export const useKeyboardNavigation = ({ items, enabled, containerRef }: UseKeyboardNavigationOptions) => {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)
  const [actualCols, setActualCols] = useState<number>(6) // Default fallback

  // Reset selection when items change or disabled
  useEffect(() => {
    if (!enabled || items.length === 0) {
      setSelectedIndex(-1)
    }
  }, [enabled, items.length])

  // Scroll selected item into view
  // Note: containerRef is stable and doesn't trigger re-renders, but we include it
  // in dependencies for clarity and to ensure the effect runs when ref is initially set
  useEffect(() => {
    if (!containerRef?.current || selectedIndex === -1) return

    const container = containerRef.current
    const selectedElement = container.children[selectedIndex] as HTMLElement

    if (selectedElement) {
      selectedElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }, [selectedIndex, containerRef])

  // Calculate actual column count from grid layout
  useEffect(() => {
    if (!containerRef?.current) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const calculateColumns = () => {
      const container = containerRef.current
      if (!container) return

      const children = container.children
      if (children.length < 2) {
        setActualCols(1)
        return
      }

      // Get the position of first two items to calculate columns
      const firstChild = children[0] as HTMLElement
      const secondChild = children[1] as HTMLElement

      if (!firstChild || !secondChild) return

      const firstRect = firstChild.getBoundingClientRect()
      const secondRect = secondChild.getBoundingClientRect()

      // If second item is on the same row (same top position), they're in different columns
      if (Math.abs(firstRect.top - secondRect.top) < ROW_DETECTION_THRESHOLD) {
        // Count how many items are on the first row
        let cols = 1
        for (let i = 1; i < children.length; i++) {
          const rect = (children[i] as HTMLElement).getBoundingClientRect()
          if (Math.abs(rect.top - firstRect.top) < ROW_DETECTION_THRESHOLD) {
            cols++
          } else {
            break
          }
        }
        setActualCols(cols)
      } else {
        // Items are stacked vertically, only 1 column
        setActualCols(1)
      }
    }

    // Debounced version for resize observer
    const debouncedCalculateColumns = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => {
        calculateColumns()
      }, 100) // 100ms debounce delay
    }

    // Initial calculation (not debounced)
    calculateColumns()

    // Recalculate on window resize with debouncing
    const resizeObserver = new ResizeObserver(() => {
      debouncedCalculateColumns()
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
    // Note: containerRef is stable and doesn't change, but we include items.length
    // to recalculate when items are added/removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  const handleNavigation = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      if (!enabled || items.length === 0) return

      setSelectedIndex(prev => {
        // If nothing selected, start at first item
        if (prev === -1) {
          return 0
        }

        let newIndex = prev
        const maxIndex = items.length - 1

        switch (direction) {
          case 'left':
            newIndex = prev > 0 ? prev - 1 : prev
            break
          case 'right':
            newIndex = prev < maxIndex ? prev + 1 : prev
            break
          case 'up':
            newIndex = Math.max(prev - actualCols, 0)
            break
          case 'down':
            newIndex = Math.min(prev + actualCols, maxIndex)
            break
        }

        return newIndex
      })
    },
    [enabled, items.length, actualCols],
  )

  const handleEnter = useCallback(() => {
    if (!enabled || selectedIndex === -1 || !items[selectedIndex]) return

    const item = items[selectedIndex]
    // Open URL in current tab with error handling
    chrome.tabs.update({ url: item.url }).catch(error => {
      console.error(
        `Failed to open quick URL "${item.title}" (${item.url}). ` +
          `This may be due to Chrome API permissions or an invalid URL format.`,
        error,
      )
    })
  }, [enabled, selectedIndex, items])

  // Bind arrow keys - prevent conflicts with command input
  // Using a combined handler to reduce duplication
  const handleArrowKey = useCallback(
    (e: KeyboardEvent, direction: 'up' | 'down' | 'left' | 'right') => {
      e.preventDefault()
      handleNavigation(direction)
    },
    [handleNavigation],
  )

  // Note: We must call useHotkeys separately for each key (hooks can't be in loops)
  useHotkeys('ArrowLeft', e => handleArrowKey(e, 'left'), { enabled, enableOnFormTags: false }, [handleArrowKey])
  useHotkeys('ArrowRight', e => handleArrowKey(e, 'right'), { enabled, enableOnFormTags: false }, [handleArrowKey])
  useHotkeys('ArrowUp', e => handleArrowKey(e, 'up'), { enabled, enableOnFormTags: false }, [handleArrowKey])
  useHotkeys('ArrowDown', e => handleArrowKey(e, 'down'), { enabled, enableOnFormTags: false }, [handleArrowKey])

  // Enter to open selected item
  useHotkeys(
    'Enter',
    e => {
      if (selectedIndex !== -1) {
        e.preventDefault()
        handleEnter()
      }
    },
    { enabled, enableOnFormTags: false },
    [handleEnter, selectedIndex],
  )

  // ESC to clear selection
  useHotkeys(
    'Escape',
    () => {
      setSelectedIndex(-1)
    },
    { enabled },
    [],
  )

  return {
    selectedIndex,
    setSelectedIndex,
  }
}
