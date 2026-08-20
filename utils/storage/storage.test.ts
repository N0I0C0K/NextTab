import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { addQuickUrl, exampleThemeStorage, quickUrlItemsStorage, settingStorage, updateSettings } from '@/utils/storage'

describe('WXT storage migration', () => {
  beforeEach(() => fakeBrowser.reset())

  it('keeps the existing raw key and fallback value', async () => {
    expect(await exampleThemeStorage.getValue()).toBe('system')

    await exampleThemeStorage.setValue('dark')

    expect(await fakeBrowser.storage.local.get('theme-storage-key')).toEqual({
      'theme-storage-key': 'dark',
    })
  })

  it('deep-merges partial settings', async () => {
    await updateSettings({ mqttSettings: { enabled: true }, wallpaperType: 'local' })

    const settings = await settingStorage.getValue()
    expect(settings.wallpaperType).toBe('local')
    expect(settings.mqttSettings.enabled).toBe(true)
    expect(settings.mqttSettings.mqttBrokerUrl).toBeTruthy()
  })

  it('updates quick links and emits WXT watch events', async () => {
    const listener = vi.fn()
    const unwatch = quickUrlItemsStorage.watch(listener)

    await addQuickUrl({ id: 'docs', title: 'WXT', url: 'https://wxt.dev/' })

    expect(await quickUrlItemsStorage.getValue()).toEqual([{ id: 'docs', title: 'WXT', url: 'https://wxt.dev/' }])
    expect(listener).toHaveBeenCalledOnce()
    unwatch()
  })
})
