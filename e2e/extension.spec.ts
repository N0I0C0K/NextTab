import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const ONBOARDING_KEY = 'onboarding-completed-key'
const SETTINGS_KEY = 'settings-storage'
const THEME_KEY = 'theme-storage-key'
const QUICK_LINKS_KEY = 'quick-url-item-storage-key'
const COMMAND_SETTINGS_KEY = 'command-settings-storage'
const WALLPAPER_HISTORY_KEY = 'wallpaper-history-storage'
const HISTORY_SUGGESTIONS_KEY = 'history-suggest-url-item-storage-key'
const HISTORY_UPDATE_KEY = 'history-update-key'
const MQTT_STATE_KEY = 'mqtt-state-storage'
const WALLPAPER_THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZpWQAAAAASUVORK5CYII='

function createWallhavenPage(pageNumber: number, sorting: string, lastPage = 3) {
  return {
    data: Array.from({ length: 12 }, (_, index) => {
      const id = `${sorting}-${pageNumber}-${index}`
      return {
        id,
        path: `https://wallhaven.cc/w/${id}.jpg`,
        thumbs: {
          small: WALLPAPER_THUMBNAIL,
          large: WALLPAPER_THUMBNAIL,
          original: WALLPAPER_THUMBNAIL,
        },
        resolution: '1920x1080',
        colors: ['#000000'],
      }
    }),
    meta: {
      current_page: pageNumber,
      last_page: lastPage,
      per_page: 12,
      total: lastPage * 12,
    },
  }
}

async function scrollWallpaperGalleryToBottom(page: Page) {
  await page.getByTestId('wallpaper-gallery').evaluate(element => {
    element.scrollTop = element.scrollHeight
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
}

async function readExtensionStorage<T>(page: Page, key: string): Promise<T> {
  return page.evaluate(async storageKey => {
    const result = await chrome.storage.local.get(storageKey)
    return result[storageKey] as T
  }, key)
}

async function openNewTab(page: Page, extensionId: string, completeOnboarding = true) {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  if (completeOnboarding) {
    await page.evaluate(key => chrome.storage.local.set({ [key]: true }), ONBOARDING_KEY)
    await page.reload()
    await expect(page.getByTestId('command-input')).toBeVisible()
  }
}

async function openSettings(page: Page) {
  await page.getByTestId('settings-trigger').click()
  await expect(page.getByTestId('homepage-settings')).toBeVisible()
}

function collectPageErrors(page: Page) {
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  return errors
}

test('new tab renders and onboarding completes end to end', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  await page.route('https://wallhaven.cc/api/v1/search**', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
  await openNewTab(page, extensionId, false)

  await expect(page).toHaveTitle('New Tab')
  await expect(page.getByTestId('onboarding-start')).toBeVisible()
  await page.getByTestId('onboarding-start').click()
  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-skip-step').click()
  await page.getByTestId('onboarding-skip-step').click()
  await page.getByTestId('onboarding-complete').click()

  await expect(page.getByTestId('settings-trigger')).toBeVisible()
  await expect.poll(() => readExtensionStorage<boolean>(page, ONBOARDING_KEY)).toBe(true)
  await page.reload()
  await expect(page.getByTestId('onboarding-start')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('onboarding preserves selections when navigating back and cannot be dismissed', async ({ page, extensionId }) => {
  await page.route('https://wallhaven.cc/api/v1/search**', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
  await openNewTab(page, extensionId, false)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('onboarding-start')).toBeVisible()
  await page.getByTestId('onboarding-start').click()

  const darkTheme = page.getByTestId('onboarding-theme-dark')
  await darkTheme.click()
  await expect(darkTheme).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('dark')
  await page.getByTestId('onboarding-next').click()

  await expect(page.getByText('Failed to load wallpapers, showing fallback options')).toBeVisible()
  const wallpapers = page.getByRole('radio')
  await expect(wallpapers).toHaveCount(5)
  await wallpapers.nth(1).click()
  await expect(wallpapers.nth(1)).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('onboarding-next').click()

  await page.getByTestId('onboarding-back').click()
  await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('onboarding-back').click()
  await expect(page.getByTestId('onboarding-theme-dark')).toHaveAttribute('aria-pressed', 'true')
})

test('onboarding import reports malformed files and completes with valid data', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId, false)

  const importInput = page.getByTestId('onboarding-import-input')
  await importInput.setInputFiles({
    name: 'malformed.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  await expect(page.getByRole('alert')).toContainText('Failed to parse import file:')

  await importInput.setInputFiles({
    name: 'valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        theme: 'dark',
        quickUrls: [{ id: 'onboarding-import', title: 'Imported During Setup', url: 'https://example.com/' }],
      }),
    ),
  })

  await expect(page.getByTestId('onboarding-start')).toHaveCount(0)
  await expect(page.getByTestId('command-input')).toBeVisible()
  await expect.poll(() => readExtensionStorage<boolean>(page, ONBOARDING_KEY)).toBe(true)
  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('dark')
  await expect
    .poll(() => readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY))
    .toContainEqual(expect.objectContaining({ id: 'onboarding-import' }))
})

test('all settings pages render without runtime errors', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  await openNewTab(page, extensionId)
  await openSettings(page)

  const settingsPages = [
    ['homepage', 'homepage-settings'],
    ['appearance', 'appearance-settings'],
    ['command', 'command-settings'],
    ['server', 'server-settings'],
    ['data', 'data-settings'],
    ['about', 'about-settings'],
  ] as const

  for (const [tab, panel] of settingsPages) {
    await page.getByTestId(`settings-tab-${tab}`).click()
    await expect(page.getByTestId(panel)).toBeVisible()
  }

  expect(pageErrors).toEqual([])
})

test('homepage settings persist after reload', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)

  const switches = page.getByTestId('homepage-settings').getByRole('switch')
  await expect(switches).toHaveCount(3)
  await switches.nth(0).click()
  await switches.nth(1).click()
  await switches.nth(2).click()

  await expect
    .poll(() => readExtensionStorage<Record<string, boolean>>(page, SETTINGS_KEY))
    .toMatchObject({
      useHistorySuggestion: true,
      showBookmarksInQuickUrlMenu: false,
      showOpenTabsInQuickUrlMenu: false,
    })

  await page.reload()
  await openSettings(page)
  const persistedSwitches = page.getByTestId('homepage-settings').getByRole('switch')
  await expect(persistedSwitches.nth(0)).toHaveAttribute('data-state', 'checked')
  await expect(persistedSwitches.nth(1)).toHaveAttribute('data-state', 'unchecked')
  await expect(persistedSwitches.nth(2)).toHaveAttribute('data-state', 'unchecked')
})

test('history suggestions can be added to quick links or dismissed', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(key => localStorage.setItem(key, Date.now().toString()), HISTORY_UPDATE_KEY)
  await openSettings(page)

  const historySwitch = page.getByTestId('homepage-settings').getByRole('switch').nth(0)
  await historySwitch.click()
  await expect
    .poll(() => readExtensionStorage<{ useHistorySuggestion: boolean }>(page, SETTINGS_KEY))
    .toMatchObject({ useHistorySuggestion: true })

  await page.evaluate(key => {
    return chrome.storage.local.set({
      [key]: [
        { id: 'history-add', title: 'Add Me', url: 'https://add.example.com/', visitCount: 10 },
        { id: 'history-delete', title: 'Delete Me', url: 'https://delete.example.com/', visitCount: 5 },
      ],
    })
  }, HISTORY_SUGGESTIONS_KEY)
  await page.keyboard.press('Escape')

  const suggestions = page.getByTestId('history-suggestion')
  await expect(suggestions).toHaveCount(2)
  await suggestions.filter({ hasText: 'Add Me' }).click({ button: 'right' })
  await page.getByTestId('history-suggestion-add').click()
  await expect(suggestions).toHaveCount(1)
  await expect
    .poll(() => readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY))
    .toContainEqual(expect.objectContaining({ id: 'history-add' }))

  await suggestions.filter({ hasText: 'Delete Me' }).click({ button: 'right' })
  await page.getByTestId('history-suggestion-delete').click()
  await expect(suggestions).toHaveCount(0)
})

test('appearance settings persist theme, URL, and local wallpaper', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  await page.route('https://wallhaven.cc/api/v1/search**', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-appearance').click()
  await expect(page.getByTestId('appearance-settings')).toBeVisible()

  await page.getByTestId('theme-toggle').click()
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('dark')

  const wallpaperUrl = 'https://example.com/wallpaper.jpg'
  await page.getByTestId('wallpaper-url').fill(wallpaperUrl)
  await expect
    .poll(() => readExtensionStorage<{ wallpaperUrl: string }>(page, SETTINGS_KEY))
    .toMatchObject({
      wallpaperUrl,
    })

  await page.getByTestId('local-wallpaper-input').setInputFiles({
    name: 'wallpaper.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZpWQAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.locator('img[alt="Local wallpaper"]')).toBeVisible()
  await expect
    .poll(() => readExtensionStorage<{ wallpaperType: string }>(page, SETTINGS_KEY))
    .toMatchObject({
      wallpaperType: 'local',
    })

  await page.reload()
  await expect(page.locator('img[alt="background wallpaper"]')).toHaveAttribute('src', /^data:image\/png;base64,/)
  expect(pageErrors).toEqual([])
})

test('local wallpaper rejects invalid files, can be reselected, and clears cleanly', async ({ page, extensionId }) => {
  await page.route('https://wallhaven.cc/api/v1/search**', route =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
  )
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-appearance').click()

  const input = page.getByTestId('local-wallpaper-input')
  await input.setInputFiles({ name: 'wallpaper.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await expect(page.getByTestId('local-wallpaper-error')).toContainText('Invalid file type')
  await expect(page.getByTestId('local-wallpaper-preview')).toHaveCount(0)

  await input.setInputFiles({
    name: 'too-large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(page.getByTestId('local-wallpaper-error')).toContainText('File too large')

  await input.setInputFiles({
    name: 'valid.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZpWQAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  const preview = page.getByTestId('local-wallpaper-preview')
  await expect(preview).toBeVisible()
  await expect
    .poll(() => readExtensionStorage<{ wallpaperType: string }>(page, SETTINGS_KEY))
    .toMatchObject({
      wallpaperType: 'local',
    })

  await page.getByTestId('wallpaper-url').fill('https://example.com/remote.jpg')
  await expect
    .poll(() => readExtensionStorage<{ wallpaperType: string }>(page, SETTINGS_KEY))
    .toMatchObject({
      wallpaperType: 'url',
    })
  await preview.focus()
  await page.keyboard.press('Enter')
  await expect
    .poll(() => readExtensionStorage<{ wallpaperType: string }>(page, SETTINGS_KEY))
    .toMatchObject({
      wallpaperType: 'local',
    })

  await page.getByTestId('local-wallpaper-clear').click()
  await expect(preview).toHaveCount(0)
  await expect
    .poll(() => readExtensionStorage<{ wallpaperType: string }>(page, SETTINGS_KEY))
    .toMatchObject({
      wallpaperType: 'url',
    })
})

test('online wallpaper gallery paginates, sorts, refreshes, and manages history', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  const apiRequests: string[] = []

  await page.route('https://wallhaven.cc/api/v1/search**', async route => {
    const url = new URL(route.request().url())
    const pageNumber = Number(url.searchParams.get('page') ?? '1')
    const sorting = url.searchParams.get('sorting') ?? 'toplist'
    apiRequests.push(url.toString())

    if (pageNumber === 2) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: createWallhavenPage(pageNumber, sorting),
    })
  })
  await page.route('https://wallhaven.cc/w/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(WALLPAPER_THUMBNAIL.split(',')[1], 'base64'),
    }),
  )

  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-appearance').click()

  await expect(page.getByTestId('wallpaper-card')).toHaveCount(12)
  expect(apiRequests[0]).toContain('page=1')
  expect(apiRequests[0]).toContain('sorting=toplist')

  await scrollWallpaperGalleryToBottom(page)
  await scrollWallpaperGalleryToBottom(page)
  await scrollWallpaperGalleryToBottom(page)
  await expect(page.getByTestId('wallpaper-card')).toHaveCount(24)
  expect(apiRequests.filter(request => request.includes('page=2'))).toHaveLength(1)

  await scrollWallpaperGalleryToBottom(page)
  await expect(page.getByTestId('wallpaper-card')).toHaveCount(36)
  await expect(page.getByTestId('wallpaper-end')).toBeVisible()

  const firstWallpaper = page.getByTestId('wallpaper-card').first()
  const selectedUrl = await firstWallpaper.getAttribute('data-wallpaper-id')
  await firstWallpaper.click()
  await expect
    .poll(() => readExtensionStorage<{ wallpaperUrl: string }>(page, SETTINGS_KEY))
    .toMatchObject({ wallpaperUrl: `https://wallhaven.cc/w/${selectedUrl}.jpg` })
  await expect(page.getByTestId('wallpaper-history-card')).toHaveCount(1)

  await page.getByTestId('wallpaper-sort').click()
  await page.getByRole('option', { name: 'Random' }).click()
  await expect(page.getByTestId('wallpaper-card')).toHaveCount(12)
  await expect
    .poll(() => readExtensionStorage<{ wallhavenSortMode: string }>(page, SETTINGS_KEY))
    .toMatchObject({ wallhavenSortMode: 'random' })
  expect(apiRequests.at(-1)).toContain('sorting=random')

  const requestCountBeforeRefresh = apiRequests.length
  await page.getByTestId('wallpaper-refresh').click()
  await expect.poll(() => apiRequests.length).toBe(requestCountBeforeRefresh + 1)
  expect(apiRequests.at(-1)).toContain('page=1')
  expect(apiRequests.at(-1)).toContain('sorting=random')

  await page.getByTestId('wallpaper-history-delete').click()
  await expect(page.getByTestId('wallpaper-history-card')).toHaveCount(0)
  await expect
    .poll(() => readExtensionStorage<{ history: unknown[] }>(page, WALLPAPER_HISTORY_KEY))
    .toEqual({ history: [] })
  expect(pageErrors).toEqual([])
})

test('online wallpaper gallery recovers from rate limiting', async ({ page, extensionId }) => {
  let requestCount = 0
  await page.route('https://wallhaven.cc/api/v1/search**', async route => {
    requestCount++
    if (requestCount === 1) {
      await route.fulfill({ status: 429, contentType: 'application/json', body: '{}' })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', json: createWallhavenPage(1, 'toplist', 1) })
  })

  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-appearance').click()

  await expect(page.getByTestId('wallpaper-error')).toBeVisible()
  await page.getByTestId('wallpaper-refresh').click()
  await expect(page.getByTestId('wallpaper-error')).toHaveCount(0)
  await expect(page.getByTestId('wallpaper-card')).toHaveCount(12)
  await expect(page.getByTestId('wallpaper-end')).toBeVisible()
})

test('command palette resolves calculator and RMB commands', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  await openNewTab(page, extensionId)

  const commandInput = page.getByTestId('command-input')
  await commandInput.fill('=1+2*3')
  await expect(page.getByText('1+2*3 = 7', { exact: true })).toBeVisible()

  await commandInput.fill('rmb 123.45')
  await expect(page.getByText('壹佰贰拾叁元肆角伍分', { exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('command palette resolves history, bookmarks, open tabs, and web search', async ({
  page,
  context,
  extensionId,
}) => {
  const pageErrors = collectPageErrors(page)
  await context.route('https://commands.example.com/**', route => {
    const title = route.request().url().includes('history') ? 'History Regression Page' : 'Open Tab Regression Page'
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<title>${title}</title>` })
  })

  await openNewTab(page, extensionId)

  const historyPage = await context.newPage()
  await historyPage.goto('https://commands.example.com/history')
  await expect(historyPage).toHaveTitle('History Regression Page')
  await historyPage.close()

  const openTab = await context.newPage()
  await openTab.goto('https://commands.example.com/open-tab')
  await expect(openTab).toHaveTitle('Open Tab Regression Page')
  await page.bringToFront()
  const openTabId = await page.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: 'https://commands.example.com/open-tab' })
    return tab.id
  })
  expect(openTabId).toBeDefined()

  await page.evaluate(() =>
    chrome.bookmarks.create({ title: 'Bookmark Regression Page', url: 'https://bookmark.example.com/' }),
  )

  const commandInput = page.getByTestId('command-input')
  await commandInput.fill('h History Regression')
  await expect(page.getByTestId('command-result').filter({ hasText: 'History Regression Page' })).toBeVisible()

  await commandInput.fill('b Bookmark Regression')
  await expect(page.getByTestId('command-result').filter({ hasText: 'Bookmark Regression Page' })).toBeVisible()

  await commandInput.fill('Open Tab Regression')
  await expect(page.locator(`[data-command-result-id="${openTabId}"]`)).toContainText('Open Tab Regression Page')

  await commandInput.fill('g ocean regression')
  const webSearchResult = page.locator('[data-command-result-id="search-unique-key"]')
  await expect(webSearchResult).toContainText('Search for "ocean regression"')

  const searchPagePromise = context.waitForEvent('page')
  await webSearchResult.click()
  const searchPage = await searchPagePromise
  await expect.poll(() => decodeURIComponent(searchPage.url()).replaceAll('+', ' ')).toContain('ocean regression')
  await searchPage.close()
  await openTab.close()
  expect(pageErrors).toEqual([])
})

test('quick links can be added, edited, persisted, and deleted', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)

  await page.getByTestId('add-quick-link').click()
  const addForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Add' }) })
  await addForm.locator('input').nth(0).fill('Example')
  await addForm.locator('input').nth(1).fill('https://example.com/')
  await addForm.getByRole('button', { name: 'Add' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('quick-link-card')).toContainText('Example')

  await page.reload()
  const card = page.getByTestId('quick-link-card')
  await expect(card).toContainText('Example')
  await card.click({ button: 'right' })
  await page.getByTestId('quick-link-edit').click()

  const editDialog = page.getByRole('dialog')
  await editDialog.locator('input').nth(0).fill('Example Updated')
  await editDialog.locator('input').nth(1).fill('https://example.org/')
  await editDialog.getByRole('button', { name: 'Save' }).click()
  await expect(card).toContainText('Example Updated')

  await card.click({ button: 'right' })
  await page.getByTestId('quick-link-delete').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByTestId('quick-link-card')).toHaveCount(0)
  await expect.poll(() => readExtensionStorage<unknown[]>(page, QUICK_LINKS_KEY)).toEqual([])
})

test('quick links support keyboard selection and opening', async ({ page, extensionId }) => {
  await page.route('https://b.example.com/', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Opened quick link</title>' }),
  )
  await openNewTab(page, extensionId)
  await page.evaluate(key => {
    return chrome.storage.local.set({
      [key]: [
        { id: 'a', title: 'A', url: 'https://a.example.com/' },
        { id: 'b', title: 'B', url: 'https://b.example.com/' },
        { id: 'c', title: 'C', url: 'https://c.example.com/' },
      ],
    })
  }, QUICK_LINKS_KEY)

  const cards = page.getByTestId('quick-link-card')
  await expect(cards).toHaveCount(3)
  await page.locator('body').click({ position: { x: 10, y: 10 } })

  await page.keyboard.press('ArrowRight')
  await expect(cards.nth(0)).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(cards.nth(1)).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="quick-link-card"][aria-current="true"]')).toHaveCount(0)

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('https://b.example.com/')
  await expect(page).toHaveTitle('Opened quick link')
})

test('quick links can be reordered by dragging', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(key => {
    return chrome.storage.local.set({
      [key]: [
        { id: 'a', title: 'A', url: 'https://a.example.com/' },
        { id: 'b', title: 'B', url: 'https://b.example.com/' },
        { id: 'c', title: 'C', url: 'https://c.example.com/' },
      ],
    })
  }, QUICK_LINKS_KEY)

  const cards = page.getByTestId('quick-link-card')
  await expect(cards).toHaveCount(3)
  const source = await cards.nth(0).boundingBox()
  const target = await cards.nth(2).boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()

  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(450)
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(async () => (await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).map(item => item.id))
    .toEqual(['b', 'c', 'a'])
  await page.reload()
  await expect(page.getByTestId('quick-link-card').nth(0)).toHaveAttribute('data-quick-link-id', 'b')
})

test('quick link context menu shows related bookmarks and open tabs', async ({ page, context, extensionId }) => {
  await context.route('https://related.example.com/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Related page</title>' }),
  )
  await openNewTab(page, extensionId)
  await page.evaluate(async key => {
    await chrome.storage.local.set({
      [key]: [{ id: 'related', title: 'Related', url: 'https://related.example.com/current' }],
    })
    await chrome.bookmarks.create({ title: 'Current Bookmark', url: 'https://related.example.com/current' })
    await chrome.bookmarks.create({ title: 'Related Bookmark', url: 'https://related.example.com/bookmarked' })
    await chrome.bookmarks.create({ title: 'Other Bookmark', url: 'https://other.example.com/' })
    await chrome.tabs.create({ url: 'https://related.example.com/open', active: false })
  }, QUICK_LINKS_KEY)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const [relatedTab] = await chrome.tabs.query({ url: '*://related.example.com/open' })
        return relatedTab?.url
      }),
    )
    .toBe('https://related.example.com/open')

  const card = page.getByTestId('quick-link-card')
  await expect(card).toHaveCount(1)
  await card.click({ button: 'right' })

  await expect(page.getByTestId('related-bookmark')).toHaveCount(1)
  await expect(page.getByTestId('related-bookmark')).toContainText('Related Bookmark')
  await expect(page.getByTestId('related-tab')).toHaveCount(1)
  await expect(page.getByTestId('related-tab')).toContainText('related.example.com')
})

test('domain history dialog filters exact-domain history', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(async key => {
    await chrome.storage.local.set({
      [key]: [{ id: 'history-domain', title: 'History Domain', url: 'https://history.example.com/current' }],
    })
    await chrome.history.deleteAll()
    await chrome.history.addUrl({ url: 'https://history.example.com/older' })
    await chrome.history.addUrl({ url: 'https://history.example.com/newest-keyword' })
    await chrome.history.addUrl({ url: 'https://other.example.com/keyword' })
  }, QUICK_LINKS_KEY)

  const card = page.getByTestId('quick-link-card')
  await expect(card).toHaveCount(1)
  await card.click({ button: 'right' })
  await page.getByTestId('quick-link-history').click()

  await expect(page.getByTestId('domain-history-dialog')).toBeVisible()
  await expect(page.getByTestId('domain-history-item')).toHaveCount(2)
  await page.getByTestId('domain-history-search').fill('keyword')
  await expect(page.getByTestId('domain-history-item')).toHaveCount(1)
  await expect(page.getByTestId('domain-history-item')).toContainText('newest-keyword')
})

test('command plugins react to disabled, global, and custom trigger settings', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  const commandInput = page.getByTestId('command-input')
  await commandInput.click()
  await expect(page.locator('[data-command-result-id="plugin-list-calculator"]')).toBeVisible()

  await page.evaluate(async key => {
    const current = (await chrome.storage.local.get(key))[key] ?? {}
    await chrome.storage.local.set({
      [key]: {
        ...current,
        calculator: {
          priority: -10,
          activeKey: '=',
          includeInGlobal: true,
          ...current.calculator,
          active: false,
        },
      },
    })
  }, COMMAND_SETTINGS_KEY)
  await commandInput.fill('=2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toHaveCount(0)

  await page.evaluate(async key => {
    const current = (await chrome.storage.local.get(key))[key]
    await chrome.storage.local.set({
      [key]: {
        ...current,
        calculator: {
          ...current.calculator,
          active: true,
          activeKey: 'calc',
          includeInGlobal: false,
        },
      },
    })
  }, COMMAND_SETTINGS_KEY)
  await commandInput.fill('2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toHaveCount(0)

  await commandInput.fill('calc 2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('2+2 = 4')
})

test('command and server settings update nested storage', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)

  await page.getByTestId('settings-tab-command').click()
  const commandPanel = page.getByTestId('command-settings')
  const commandSwitches = commandPanel.getByRole('switch')
  await commandSwitches.nth(0).click()
  await commandSwitches.nth(1).click()

  const calculatorPlugin = page.getByTestId('command-plugin-calculator')
  await calculatorPlugin.getByRole('button').first().click()
  await calculatorPlugin.getByRole('switch').nth(0).click()

  await expect
    .poll(() => readExtensionStorage<Record<string, { active: boolean }>>(page, COMMAND_SETTINGS_KEY))
    .toMatchObject({
      calculator: { active: false },
    })

  await page.getByTestId('settings-tab-server').click()
  const serverPanel = page.getByTestId('server-settings')
  await expect(serverPanel.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled()
  await expect
    .poll(() => page.evaluate(() => chrome.permissions.contains({ origins: ['wss://broker.emqx.io:8084/*'] })))
    .toBe(false)
  await serverPanel.getByRole('switch').click()
  await serverPanel.locator('input').nth(0).fill('TEST-SECRET')
  await serverPanel.locator('input').nth(1).fill('test-user')

  await expect
    .poll(() => readExtensionStorage<Record<string, unknown>>(page, SETTINGS_KEY))
    .toMatchObject({
      autoFocusCommandInput: true,
      doubleClickBackgroundFocusCommand: true,
      mqttSettings: {
        enabled: true,
        secretKey: 'TEST-SECRET',
        username: 'test-user',
      },
    })
  await expect
    .poll(() => readExtensionStorage<{ connected: boolean }>(page, MQTT_STATE_KEY))
    .toEqual({
      connected: false,
    })
})

test('data settings export, import, and restart onboarding', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-data').click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-settings').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^nexttab-settings-1\.4\.1-\d{4}-\d{2}-\d{2}\.json$/)

  await page.getByTestId('import-settings-input').setInputFiles({
    name: 'settings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        theme: 'light',
        settings: { useHistorySuggestion: true, wallpaperType: 'url' },
        quickUrls: [{ id: 'imported', title: 'Imported Link', url: 'https://example.com/' }],
      }),
    ),
  })

  await expect
    .poll(() => readExtensionStorage<unknown[]>(page, QUICK_LINKS_KEY))
    .toEqual([{ id: 'imported', title: 'Imported Link', url: 'https://example.com/' }])
  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('light')

  await page.getByTestId('restart-onboarding').click()
  await expect(page.getByTestId('onboarding-start')).toBeVisible()
})

test('data settings report malformed files and partially import valid sections', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-data').click()
  await page.evaluate(key => {
    return chrome.storage.local.set({
      [key]: [{ id: 'existing', title: 'Existing', url: 'https://existing.example.com/' }],
    })
  }, QUICK_LINKS_KEY)

  const input = page.getByTestId('import-settings-input')
  await input.setInputFiles({ name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByText(/Failed to import settings:/)).toBeVisible()

  await input.setInputFiles({
    name: 'partial.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        theme: 'dark',
        quickUrls: [{ id: 'invalid', title: 'Invalid', url: 'not a URL' }],
      }),
    ),
  })

  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('dark')
  await expect(page.getByText(/quickUrls:/)).toBeVisible()
  await expect
    .poll(() => readExtensionStorage<unknown[]>(page, QUICK_LINKS_KEY))
    .toEqual([{ id: 'existing', title: 'Existing', url: 'https://existing.example.com/' }])
})

test('about page exposes version and opens project links', async ({ page, context, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-about').click()

  const about = page.getByTestId('about-settings')
  await expect(about).toContainText('1.4.1')
  await expect(page.getByTestId('open-repository')).toBeVisible()
  await expect(page.getByTestId('open-issue')).toBeVisible()
  await expect(page.getByTestId('open-releases')).toBeVisible()

  const newPagePromise = context.waitForEvent('page')
  await page.getByTestId('open-repository').click()
  const repositoryPage = await newPagePromise
  await expect.poll(() => repositoryPage.url()).toBe('https://github.com/N0I0C0K/NextTab')
  await repositoryPage.close()
})

test('popup renders and shares quick links through extension storage', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  await page.goto(`chrome-extension://${extensionId}/popup.html`)

  await expect(page).toHaveTitle('Popup')
  await expect(page.locator('.popup-container')).toBeVisible()
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(0)
  await expect(page.getByTestId('add-current-page')).toBeEnabled()

  await page.getByTestId('add-current-page').click()
  await expect(page.getByTestId('popup-quick-link')).toHaveAttribute('aria-label', 'Popup')
  await expect(page.getByTestId('add-current-page')).toBeDisabled()

  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: [{ id: 'popup-link', title: 'Popup Link', url: 'https://example.com/' }],
      }),
    QUICK_LINKS_KEY,
  )
  await expect(page.getByTestId('popup-quick-link')).toHaveAttribute('aria-label', 'Popup Link')

  await page.reload()
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(1)
  expect(pageErrors).toEqual([])
})

test('popup warns for a same-host page but only blocks exact duplicates', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.evaluate(
    ({ key, newTabUrl }) =>
      chrome.storage.local.set({
        [key]: [{ id: 'same-host', title: 'New Tab', url: newTabUrl }],
      }),
    { key: QUICK_LINKS_KEY, newTabUrl: `chrome-extension://${extensionId}/newtab.html` },
  )

  await expect(page.getByText('Site already has other pages')).toBeVisible()
  await expect(page.getByTestId('add-current-page')).toBeEnabled()

  await page.getByTestId('add-current-page').click()
  await expect(page.getByText('Page already exists')).toBeVisible()
  await expect(page.getByTestId('add-current-page')).toBeDisabled()
  await expect(page.getByTestId('popup-quick-link')).toHaveCount(2)
})
