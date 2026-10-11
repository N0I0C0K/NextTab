import { describe, expect, it } from 'vitest'
import { matchesTriggerKey, stripTriggerKeyForPlugin } from './utils'

describe('command trigger keys', () => {
  it('requires a space after textual prefixes and keeps ordinary words intact', () => {
    expect(matchesTriggerKey('b', 'b')).toBe(false)
    expect(matchesTriggerKey('b ', 'b')).toBe(true)
    expect(matchesTriggerKey('b nexttab', 'b')).toBe(true)
    expect(matchesTriggerKey('beta', 'b')).toBe(false)
    expect(matchesTriggerKey('github', 'g')).toBe(false)
    expect(matchesTriggerKey('history', 'h')).toBe(false)
    expect(stripTriggerKeyForPlugin('beta', 'b')).toBe('beta')
    expect(stripTriggerKeyForPlugin('github', 'g')).toBe('github')
  })

  it('requires a space after equals and supports custom prefixes and existing trailing separators', () => {
    expect(matchesTriggerKey('=', '=')).toBe(false)
    expect(matchesTriggerKey('=1+1', '=')).toBe(false)
    expect(matchesTriggerKey('= ', '=')).toBe(true)
    expect(matchesTriggerKey('= 1+1', '=')).toBe(true)
    expect(stripTriggerKeyForPlugin('=1+1', '=')).toBe('=1+1')
    expect(stripTriggerKeyForPlugin('= 1+1', '=')).toBe('1+1')
    expect(matchesTriggerKey('calc 1+1', 'calc')).toBe(true)
    expect(matchesTriggerKey('calculator', 'calc')).toBe(false)
    expect(matchesTriggerKey('calc 1+1', 'calc ')).toBe(true)
    expect(matchesTriggerKey('anything', '')).toBe(false)
  })

  it('removes the matching trigger and one separator space', () => {
    expect(stripTriggerKeyForPlugin('rmb 123.45', 'rmb')).toBe('123.45')
  })

  it('preserves additional spaces after the first separator', () => {
    expect(stripTriggerKeyForPlugin('calc   1 + 1', 'calc')).toBe('  1 + 1')
  })

  it('leaves queries with no matching trigger unchanged', () => {
    expect(stripTriggerKeyForPlugin('1 + 1', 'calc')).toBe('1 + 1')
    expect(stripTriggerKeyForPlugin('calculator 1 + 1', 'calc ')).toBe('calculator 1 + 1')
  })
})
