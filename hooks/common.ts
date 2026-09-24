import type { DependencyList } from 'react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

export function useDebounce<T>(val: T, delay: number = 200): T {
  const [delayVal, setDelayVal] = useState(val)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDelayVal(val)
    }, delay)
    return () => {
      clearTimeout(timer)
    }
  }, [val, delay])
  return delayVal
}

export function useEffectMemo<T>(func: () => T, defaultVal: T, deps?: DependencyList): T {
  const [val, setVal] = useState<T>(defaultVal)
  useEffect(() => {
    setVal(func())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return val
}

export function useMouseDownTime(ref?: HTMLElement | null, intervalTimeout: number = 100): number {
  const [downing, setDowning] = useState(false)
  const [downTime, setDownTime] = useState<number | undefined>()
  const [time, setTime] = useState(0)
  useEffect(() => {
    if (downing && downTime) {
      const interval = setInterval(() => {
        setTime(Date.now() - downTime)
      }, intervalTimeout)
      return () => clearInterval(interval)
    }
    setTime(0)
    return undefined
  }, [downing, downTime, intervalTimeout])

  const mouseDownCallback = useCallback(() => {
    setDowning(true)
    setDownTime(Date.now())
  }, [])

  const mouseUpCallback = useCallback(() => {
    setDowning(false)
  }, [])

  useEffect(() => {
    ref?.addEventListener('mousedown', mouseDownCallback)
    ref?.addEventListener('mouseup', mouseUpCallback)
    ref?.addEventListener('mouseleave', mouseUpCallback)

    return () => {
      ref?.removeEventListener('mousedown', mouseDownCallback)
      ref?.removeEventListener('mouseup', mouseUpCallback)
      ref?.removeEventListener('mouseleave', mouseUpCallback)
    }
  }, [mouseDownCallback, mouseUpCallback, ref])
  return time
}

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (callback: () => void) => {
      const matchMedia = window.matchMedia(query)

      matchMedia.addEventListener('change', callback)
      return () => {
        matchMedia.removeEventListener('change', callback)
      }
    },
    [query],
  )

  const getSnapshot = () => {
    return window.matchMedia(query).matches
  }

  const getServerSnapshot = () => {
    throw Error('useMediaQuery is a client-only hook')
  }

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
