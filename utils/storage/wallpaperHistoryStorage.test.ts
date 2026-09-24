import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  addWallpaperHistory,
  clearWallpaperHistory,
  removeWallpaperHistory,
  wallpaperHistoryStorage,
} from '@/utils/storage'

describe('wallpaper history storage', () => {
  beforeEach(() => fakeBrowser.reset())

  it('keeps the newest ten wallpapers', async () => {
    for (let index = 0; index < 12; index++) {
      await addWallpaperHistory(`https://example.com/${index}.jpg`, `https://example.com/${index}-thumb.jpg`)
    }

    const { history } = await wallpaperHistoryStorage.getValue()
    expect(history).toHaveLength(10)
    expect(history.map(item => item.url)).toEqual(
      Array.from({ length: 10 }, (_, index) => `https://example.com/${11 - index}.jpg`),
    )
  })

  it('moves a duplicate to the front and updates its thumbnail', async () => {
    await addWallpaperHistory('https://example.com/first.jpg', 'https://example.com/old-thumb.jpg')
    await addWallpaperHistory('https://example.com/second.jpg', 'https://example.com/second-thumb.jpg')
    await addWallpaperHistory('https://example.com/first.jpg', 'https://example.com/new-thumb.jpg')

    const { history } = await wallpaperHistoryStorage.getValue()
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({
      url: 'https://example.com/first.jpg',
      thumbnailUrl: 'https://example.com/new-thumb.jpg',
    })
  })

  it('removes one wallpaper or clears the complete history', async () => {
    await addWallpaperHistory('https://example.com/first.jpg', 'https://example.com/first-thumb.jpg')
    await addWallpaperHistory('https://example.com/second.jpg', 'https://example.com/second-thumb.jpg')

    await removeWallpaperHistory('https://example.com/first.jpg')
    expect((await wallpaperHistoryStorage.getValue()).history.map(item => item.url)).toEqual([
      'https://example.com/second.jpg',
    ])

    await clearWallpaperHistory()
    expect(await wallpaperHistoryStorage.getValue()).toEqual({ history: [] })
  })
})
