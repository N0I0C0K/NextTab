import { describe, expect, it } from 'vitest'
import { getBundledMessage } from './bundled-message'

describe('bundled i18n fallback', () => {
  it.each([
    ['en-US', 'Delete "Github"?'],
    ['zh-CN', '删除“Github”？'],
    ['zh-TW', '刪除「Github」？'],
    ['de-DE', '„Github“ löschen?'],
  ])('uses the matching language and replaces the name for %s', (locale, expected) => {
    expect(getBundledMessage('deleteQuickItemConfirm', locale, 'Github')).toBe(expected)
  })

  it('inserts names containing replacement tokens literally', () => {
    expect(getBundledMessage('deleteQuickItemConfirm', 'zh-CN', 'A$&B')).toBe('删除“A$&B”？')
  })
})
