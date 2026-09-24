import { describe, expect, it } from 'vitest'
import { stripTriggerKeyForPlugin } from './utils'

describe('command trigger keys', () => {
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
