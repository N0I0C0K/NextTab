import { describe, expect, it } from 'vitest'
import { nextPopupIndex, plainModifiers, popupAction } from './popup-keyboard'

describe('popup keyboard navigation', () => {
  it.each([
    ['ArrowDown', -1, 12, 8, 4, 0],
    ['ArrowRight', 0, 12, 8, 4, 1],
    ['ArrowDown', 1, 12, 8, 4, 5],
    ['ArrowDown', 5, 12, 8, 4, 8],
    ['ArrowUp', 8, 12, 8, 4, 7],
    ['ArrowUp', 1, 12, 8, 4, -1],
    ['ArrowDown', 1, 10, 6, 3, 4],
    ['ArrowDown', 4, 10, 6, 3, 6],
    ['ArrowDown', 11, 14, 14, 4, 13],
    ['ArrowDown', 13, 14, 14, 4, 13],
    ['ArrowDown', 0, 25, 0, 4, 1],
    ['End', 0, 1025, 0, 4, 1024],
    ['Home', 1024, 1025, 0, 4, 0],
    ['PageDown', 0, 1025, 0, 4, 5],
    ['PageUp', 25, 1000, 1000, 4, 5],
    ['ArrowDown', -1, 0, 0, 4, -1],
  ])('%s from %i follows the visible layout', (key, index, count, grid, columns, expected) => {
    expect(nextPopupIndex(String(key), Number(index), Number(count), Number(grid), Number(columns), 5)).toBe(expected)
  })
  it('previews existing open modes without changing the target', () => {
    const page = { id: 'tab:3', tabId: 3, title: 'Opened', url: 'https://example.com/' }
    expect(popupAction(page, plainModifiers)).toBe('popupSwitch')
    expect(popupAction(page, { ...plainModifiers, metaKey: true })).toBe('popupOpenTab')
    expect(popupAction(page, { ...plainModifiers, shiftKey: true })).toBe('popupOpenWindow')
    expect(popupAction(page, { ...plainModifiers, ctrlKey: true, shiftKey: true })).toBe('popupOpenAdjacent')
    expect(popupAction({ ...page, id: 'history:a', tabId: undefined }, plainModifiers)).toBe('popupReopen')
  })
})
