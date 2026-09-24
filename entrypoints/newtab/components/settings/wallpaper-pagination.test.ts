import { describe, expect, it } from 'vitest'
import { isNearScrollBottom } from './wallpaper-pagination'

describe('wallpaper pagination', () => {
  it('loads when the viewport reaches the bottom threshold', () => {
    expect(isNearScrollBottom({ scrollTop: 600, scrollHeight: 1000, clientHeight: 300 }, 100)).toBe(true)
  })

  it('does not load while the viewport is above the bottom threshold', () => {
    expect(isNearScrollBottom({ scrollTop: 599, scrollHeight: 1000, clientHeight: 300 }, 100)).toBe(false)
  })

  it('loads when scrolling has passed the calculated bottom', () => {
    expect(isNearScrollBottom({ scrollTop: 710, scrollHeight: 1000, clientHeight: 300 }, 100)).toBe(true)
  })
})
