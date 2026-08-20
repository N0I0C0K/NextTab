import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  exampleThemeStorage,
  importAllDataFromText,
  quickUrlItemsStorage,
  settingStorage,
  updateSettings,
} from '@/utils/storage'

describe('settings import', () => {
  beforeEach(() => fakeBrowser.reset())

  it('deep-merges partial legacy settings and normalizes device-local wallpaper mode', async () => {
    await updateSettings({
      autoFocusCommandInput: true,
      mqttSettings: { username: 'preserved-user' },
    })

    const result = await importAllDataFromText(
      JSON.stringify({
        version: '0.1.0',
        settings: {
          useHistorySuggestion: true,
          wallpaperType: 'local',
          mqttSettings: { enabled: true },
        },
      }),
    )

    expect(result.warnings).toEqual([])
    expect(await settingStorage.getValue()).toMatchObject({
      useHistorySuggestion: true,
      autoFocusCommandInput: true,
      wallpaperType: 'url',
      mqttSettings: { enabled: true, username: 'preserved-user' },
    })
  })

  it('imports valid sections while warning about invalid independent sections', async () => {
    const result = await importAllDataFromText(
      JSON.stringify({
        theme: 'dark',
        settings: { useHistorySuggestion: 'yes' },
        quickUrls: [{ id: 'invalid', title: 'Invalid URL', url: 'not a URL' }],
      }),
    )

    expect(await exampleThemeStorage.getValue()).toBe('dark')
    expect(await quickUrlItemsStorage.getValue()).toEqual([])
    expect((await settingStorage.getValue()).useHistorySuggestion).toBe(false)
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings[0]).toContain('settings:')
    expect(result.warnings[1]).toContain('quickUrls:')
  })

  it.each([
    ['malformed JSON', '{'],
    ['an array', '[]'],
    ['an unrelated object', JSON.stringify({ unknown: true })],
  ])('rejects %s at the file boundary', async (_label, content) => {
    await expect(importAllDataFromText(content)).rejects.toThrow('Failed to parse import file:')
  })
})
