import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const ONBOARDING_KEY = 'onboarding-completed-key'
const SETTINGS_KEY = 'settings-storage'
const THEME_KEY = 'theme-storage-key'
const QUICK_LINKS_KEY = 'quick-url-item-storage-key'
const COMMAND_SETTINGS_KEY = 'command-settings-storage'
const MQTT_STATE_KEY = 'mqtt-state-storage'

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
  await openNewTab(page, extensionId, false)

  await expect(page).toHaveTitle('New Tab')
  await expect(page.getByTestId('onboarding-start')).toBeVisible()
  await page.getByTestId('onboarding-start').click()
  await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-skip-step').click()
  await page.getByTestId('onboarding-complete').click()

  await expect(page.getByTestId('settings-trigger')).toBeVisible()
  await expect(page.locator('.nt-links-panel')).toBeVisible()
  await expect(page.locator('.x-bg-img')).toHaveCount(0)
  await expect.poll(() => readExtensionStorage<boolean>(page, ONBOARDING_KEY)).toBe(true)
  await page.reload()
  await expect(page.getByTestId('onboarding-start')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('onboarding preserves selections when navigating back and cannot be dismissed', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId, false)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('onboarding-start')).toBeVisible()
  await page.getByTestId('onboarding-start').click()

  const darkTheme = page.getByTestId('onboarding-theme-dark')
  await darkTheme.click()
  await expect(darkTheme).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('dark')
  await page.getByTestId('onboarding-next').click()

  await expect(page.getByTestId('onboarding-skip-step')).toBeVisible()
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

test('settings drawer remains aligned and controls fit at narrow widths', async ({ page, extensionId }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openNewTab(page, extensionId)
  await openSettings(page)

  const drawer = page.locator('[data-slot="dialog-content"]')
  const desktopBounds = await drawer.boundingBox()
  expect(desktopBounds).not.toBeNull()
  expect(desktopBounds!.x).toBeGreaterThanOrEqual(670)
  expect(desktopBounds!.y).toBe(0)
  expect(desktopBounds!.height).toBe(900)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBounds = await drawer.boundingBox()
  expect(mobileBounds).not.toBeNull()
  expect(mobileBounds!.x).toBe(0)
  expect(mobileBounds!.width).toBe(390)

  const cardBounds = await page.locator('.nt-setting-item-stacked').boundingBox()
  const selectBounds = await page.locator('.nt-setting-item-stacked [data-slot="select-trigger"]').boundingBox()
  expect(cardBounds).not.toBeNull()
  expect(selectBounds).not.toBeNull()
  expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(390)
  expect(selectBounds!.x + selectBounds!.width).toBeLessThanOrEqual(cardBounds!.x + cardBounds!.width)
})

test('settings navigation and cards stay aligned while long descriptions remain accessible', async ({
  page,
  extensionId,
}) => {
  await openNewTab(page, extensionId)
  await openSettings(page)

  const tabs = page.locator('.nt-settings-tab-list [data-slot="tabs-trigger"]')
  await expect(tabs).toHaveCount(6)
  for (const tab of await tabs.all()) {
    await expect(tab.locator('svg')).toHaveCount(1)
  }

  const cards = page.getByTestId('homepage-settings').locator('.nt-setting-item')
  await expect(cards).toHaveCount(3)
  const heights = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2)

  const description = cards.nth(1).locator('.nt-setting-description')
  const fullDescription = await description.getAttribute('aria-label')
  expect(fullDescription?.length).toBeGreaterThan(30)
  await description.hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(fullDescription!)
  await page.mouse.move(0, 0)
  await description.focus()
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(fullDescription!)

  await page.setViewportSize({ width: 390, height: 844 })
  const cardBounds = await cards.nth(1).boundingBox()
  const selectBounds = await cards.nth(1).locator('[data-slot="select-trigger"]').boundingBox()
  expect(cardBounds).not.toBeNull()
  expect(selectBounds).not.toBeNull()
  expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(390)
  expect(selectBounds!.x + selectBounds!.width).toBeLessThanOrEqual(cardBounds!.x + cardBounds!.width)
  const switchBounds = await cards.first().getByRole('switch').boundingBox()
  expect(switchBounds).not.toBeNull()
  expect(switchBounds!.x + switchBounds!.width).toBeLessThanOrEqual(390)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

  await page.getByTestId('settings-tab-server').click()
  const serverInputs = page.getByTestId('server-settings').locator('.nt-setting-item-stacked [data-slot="input"]')
  await expect(serverInputs).toHaveCount(2)
  for (const input of await serverInputs.all()) {
    const bounds = await input.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeGreaterThan(240)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  }
})

test('command settings use consistent card surfaces, borders, and icon sizes', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-command').click()
  await expect(page.getByTestId('command-settings')).toBeVisible()
  await expect(page.locator('[data-slot="accordion-item"]').first()).toBeVisible()

  const styles = await page.evaluate(() => {
    const settingCard = document.querySelector<HTMLElement>(
      '[data-testid="command-settings"] [data-slot="setting-item-copy"]',
    )?.parentElement
    const pluginCard = document.querySelector<HTMLElement>('[data-slot="accordion-item"]')
    const header = document.querySelector<HTMLElement>('[data-slot="dialog-header"]')
    const settingIcon = settingCard?.querySelector('svg')
    const pluginIcon = pluginCard?.querySelector('[data-slot="accordion-trigger"] svg:not([data-slot])')
    if (!settingCard || !pluginCard || !header || !settingIcon || !pluginIcon) return null

    return {
      settingBackground: getComputedStyle(settingCard).backgroundColor,
      pluginBackground: getComputedStyle(pluginCard).backgroundColor,
      settingBorder: getComputedStyle(settingCard).borderBottomColor,
      pluginBorder: getComputedStyle(pluginCard).borderBottomColor,
      headerBorder: getComputedStyle(header).borderBottomColor,
      settingIconWidth: settingIcon.getBoundingClientRect().width,
      pluginIconWidth: pluginIcon.getBoundingClientRect().width,
    }
  })

  expect(styles).not.toBeNull()
  expect(styles!.pluginBackground).toBe(styles!.settingBackground)
  expect(styles!.pluginBorder).toBe(styles!.settingBorder)
  expect(styles!.headerBorder).toBe(styles!.settingBorder)
  expect(styles!.settingIconWidth).toBe(24)
  expect(styles!.pluginIconWidth).toBe(24)
})

test('homepage settings persist after reload', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)

  const switches = page.getByTestId('homepage-settings').getByRole('switch')
  await expect(switches).toHaveCount(2)
  await switches.nth(0).click()
  await switches.nth(1).click()

  await expect
    .poll(() => readExtensionStorage<Record<string, boolean>>(page, SETTINGS_KEY))
    .toMatchObject({
      showBookmarksInQuickUrlMenu: false,
      showOpenTabsInQuickUrlMenu: false,
    })

  await page.reload()
  await openSettings(page)
  const persistedSwitches = page.getByTestId('homepage-settings').getByRole('switch')
  await expect(persistedSwitches.nth(0)).toHaveAttribute('aria-checked', 'false')
  await expect(persistedSwitches.nth(1)).toHaveAttribute('aria-checked', 'false')
})

test('appearance keeps the theme readable without a wallpaper', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-appearance').click()

  await page.getByTestId('theme-toggle').click()
  await page.getByRole('menuitem', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect.poll(() => readExtensionStorage<string>(page, THEME_KEY)).toBe('dark')
  await expect(page.getByTestId('appearance-settings')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.nt-page')).toHaveCSS('background-color', 'rgb(16, 17, 20)')
  await expect(page.locator('img[alt="background wallpaper"]')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})

test('theme setting card opens its menu on the first press', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await openSettings(page)
  await page.getByTestId('settings-tab-appearance').click()

  const trigger = page.getByTestId('theme-toggle')
  const bounds = await trigger.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThan(300)
  const centerX = bounds!.x + bounds!.width / 2
  const centerY = bounds!.y + bounds!.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + 24, centerY, { steps: 2 })
  await page.mouse.up()

  await expect(page.getByRole('menuitem', { name: 'Dark' })).toBeVisible({ timeout: 1000 })
  await page.keyboard.press('Escape')
  await trigger.focus()
  await trigger.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'System' })).toBeVisible()
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

test('command results return after copying a calculator result and editing the input', async ({
  page,
  extensionId,
}) => {
  await openNewTab(page, extensionId)

  const commandInput = page.getByTestId('command-input')
  await commandInput.fill('1+1')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('1+1 = 2')
  await commandInput.press('ArrowDown')
  await commandInput.press('Enter')
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('calculator_history') ?? '[]')))
    .toContainEqual(expect.objectContaining({ expression: '1+1', result: '2' }))
  await expect(commandInput).toBeFocused()
  await commandInput.press('ControlOrMeta+A')
  await page.keyboard.type('2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('2+2 = 4')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toBeVisible()
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

test('quick link row opens from its text area', async ({ page, extensionId }) => {
  await page.route('https://row.example.com/', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Opened row</title>' }),
  )
  await openNewTab(page, extensionId)
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: [{ id: 'row', title: 'Open this row', url: 'https://row.example.com/' }],
      }),
    QUICK_LINKS_KEY,
  )

  await page.getByRole('button', { name: 'Open this row — https://row.example.com/' }).click()
  await expect(page).toHaveURL('https://row.example.com/')
  await expect(page).toHaveTitle('Opened row')
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
  const handle = cards.nth(0).getByTestId('quick-link-drag-handle')
  await expect(handle).toHaveCSS('opacity', '0')

  const source = await cards.nth(0).locator('.nt-link-open').boundingBox()
  const target = await cards.nth(2).boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()

  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 10 })
  await page.mouse.up()
  expect((await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).map(item => item.id)).toEqual([
    'a',
    'b',
    'c',
  ])

  const handleBox = await handle.boundingBox()
  expect(handleBox).not.toBeNull()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await expect(handle).toHaveCSS('opacity', '1')
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(async () => (await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).map(item => item.id))
    .toEqual(['b', 'c', 'a'])
  await page.reload()
  await expect(page.getByTestId('quick-link-card').nth(0)).toHaveAttribute('data-quick-link-id', 'b')
})

test('quick link drag handle supports keyboard reordering', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: [
          { id: 'a', title: 'A', url: 'https://a.example.com/' },
          { id: 'b', title: 'B', url: 'https://b.example.com/' },
        ],
      }),
    QUICK_LINKS_KEY,
  )

  const handle = page.getByTestId('quick-link-card').nth(0).getByTestId('quick-link-drag-handle')
  await handle.focus()
  await expect(handle).toHaveCSS('opacity', '1')
  await handle.press('ArrowDown')
  await expect
    .poll(async () => (await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).map(item => item.id))
    .toEqual(['b', 'a'])
})

test('missing favicons use link initials in NewTab and popup', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: [
          { id: 'latin', title: '  (Framer)', url: 'https://missing-favicon-one.invalid/' },
          { id: 'han', title: '吉他练习', url: 'https://missing-favicon-two.invalid/' },
        ],
      }),
    QUICK_LINKS_KEY,
  )

  const newTabIcons = page.getByTestId('quick-link-card').locator('.nt-link-icon')
  await expect(newTabIcons).toHaveCount(2)
  await expect(newTabIcons.nth(0)).toHaveAttribute('data-icon-status', 'fallback')
  await expect(newTabIcons.nth(1)).toHaveAttribute('data-icon-status', 'fallback')
  await expect(newTabIcons.nth(0)).toHaveText('F')
  await expect(newTabIcons.nth(1)).toHaveText('吉')

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  const popupIcons = page.getByTestId('popup-quick-link').locator('.popup-quick-link-icon')
  await expect(popupIcons).toHaveCount(2)
  await expect(popupIcons.nth(0)).toHaveAttribute('data-icon-status', 'fallback')
  await expect(popupIcons.nth(1)).toHaveAttribute('data-icon-status', 'fallback')
  await expect(popupIcons.nth(0)).toHaveText('F')
  await expect(popupIcons.nth(1)).toHaveText('吉')
})

test('quick link sorting persists without overwriting the manual order', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: [
          { id: 'z', title: 'Zulu', url: 'https://z.example.com/' },
          { id: 'a', title: 'Alpha', url: 'https://a.example.com/' },
          { id: 'b', title: 'Beta', url: 'https://b.example.com/' },
        ],
      }),
    QUICK_LINKS_KEY,
  )

  const cards = page.getByTestId('quick-link-card')
  await expect(cards.first()).toHaveAttribute('data-quick-link-id', 'z')
  await expect(page.getByTestId('quick-link-sort-trigger')).toContainText('Sort')
  await page.getByTestId('quick-link-sort-trigger').click()
  await expect(page.getByTestId('quick-link-sort-manual')).toContainText('Original order')
  await expect(page.getByTestId('quick-link-sort-alphabetical')).toContainText('Alphabetical')
  await page.getByTestId('quick-link-sort-alphabetical').click()
  await expect(cards.first()).toHaveAttribute('data-quick-link-id', 'a')
  await expect(page.getByTestId('quick-link-drag-handle')).toHaveCount(0)
  await expect
    .poll(() => readExtensionStorage<{ quickUrlSortMode: string }>(page, SETTINGS_KEY))
    .toMatchObject({ quickUrlSortMode: 'alphabetical' })
  expect((await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).map(item => item.id)).toEqual([
    'z',
    'a',
    'b',
  ])

  await page.reload()
  await expect(cards.first()).toHaveAttribute('data-quick-link-id', 'a')
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await expect(page.getByTestId('popup-quick-link').first()).toHaveAttribute('aria-label', 'Alpha')

  await openNewTab(page, extensionId)
  await page.setViewportSize({ width: 320, height: 700 })
  await page.getByTestId('quick-link-sort-trigger').click()
  await page.getByTestId('quick-link-sort-manual').click()
  await expect(cards.first()).toHaveAttribute('data-quick-link-id', 'z')
  await expect(page.getByTestId('quick-link-drag-handle')).toHaveCount(3)
  expect((await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).map(item => item.id)).toEqual([
    'z',
    'a',
    'b',
  ])
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
})

test('quick link rows stay aligned and reorder across responsive layouts', async ({ page, extensionId }) => {
  await openNewTab(page, extensionId)
  await page.evaluate(key => {
    return chrome.storage.local.set({
      [key]: Array.from({ length: 24 }, (_, index) => ({
        id: `item-${index}`,
        title: `Link ${index}`,
        url: `https://example.com/${index}`,
      })),
    })
  }, QUICK_LINKS_KEY)

  const cards = page.getByTestId('quick-link-card')
  await expect(cards).toHaveCount(24)

  for (const [width, columns] of [
    [1440, 3],
    [800, 3],
    [640, 2],
    [390, 1],
    [320, 1],
  ]) {
    await page.setViewportSize({ width, height: 1000 })
    const layout = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('.nt-links-grid')!
      const card = document.querySelector<HTMLElement>('.nt-link')!
      const icon = document.querySelector<HTMLElement>('.nt-link-icon')!
      const label = document.querySelector<HTMLElement>('.nt-link-label')!
      const gridRect = grid.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const iconRect = icon.getBoundingClientRect()
      const labelRect = label.getBoundingClientRect()
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        gridInset: cardRect.left - gridRect.left,
        iconCenterOffset: Math.abs(iconRect.top + iconRect.height / 2 - (cardRect.top + cardRect.height / 2)),
        labelCenterOffset: Math.abs(labelRect.top + labelRect.height / 2 - (cardRect.top + cardRect.height / 2)),
        cardHeight: cardRect.height,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        shortcutVisible: getComputedStyle(document.querySelector<HTMLElement>('.nt-command kbd')!).display !== 'none',
      }
    })
    expect(layout.columns).toBe(columns)
    expect(Math.abs(layout.gridInset)).toBeLessThan(2)
    expect(layout.iconCenterOffset).toBeLessThan(2)
    expect(layout.labelCenterOffset).toBeLessThan(2)
    expect(layout.cardHeight).toBe(60)
    expect(layout.horizontalOverflow).toBe(false)
    expect(layout.shortcutVisible).toBe(width > 360)
  }

  await page.setViewportSize({ width: 390, height: 1000 })
  await cards.nth(11).scrollIntoViewIfNeeded()
  const source = await cards.nth(8).getByTestId('quick-link-drag-handle').boundingBox()
  const target = await cards.nth(11).boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()

  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 })
  await page.mouse.up()

  await expect
    .poll(async () =>
      (await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).findIndex(
        item => item.id === 'item-8',
      ),
    )
    .toBe(11)

  await page.reload()
  await expect(cards).toHaveCount(24)
  await page.setViewportSize({ width: 390, height: 700 })
  await cards.nth(20).scrollIntoViewIfNeeded()
  const scrolledSource = await cards.nth(20).getByTestId('quick-link-drag-handle').boundingBox()
  const scrolledTarget = await cards.nth(17).boundingBox()
  expect(scrolledSource).not.toBeNull()
  expect(scrolledTarget).not.toBeNull()
  await page.mouse.move(scrolledSource!.x + scrolledSource!.width / 2, scrolledSource!.y + scrolledSource!.height / 2)
  await page.mouse.down()
  await page.mouse.move(scrolledTarget!.x + scrolledTarget!.width / 2, scrolledTarget!.y + 20, { steps: 12 })
  await page.mouse.up()

  await expect
    .poll(async () =>
      (await readExtensionStorage<Array<{ id: string }>>(page, QUICK_LINKS_KEY)).findIndex(
        item => item.id === 'item-20',
      ),
    )
    .toBe(17)
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
  await page.bringToFront()
  await card.click({ button: 'right' })

  await expect(page.getByTestId('quick-link-edit')).toBeVisible()
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
  await serverPanel.locator('input:not([type="checkbox"])').nth(0).fill('TEST-SECRET')
  await serverPanel.locator('input:not([type="checkbox"])').nth(1).fill('test-user')

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

test('popup quick links use compact rows and remain scrollable with many sites', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.evaluate(
    key =>
      chrome.storage.local.set({
        [key]: Array.from({ length: 30 }, (_, index) => ({
          id: `popup-${index}`,
          title: `Site ${index}`,
          url: `https://example.com/${index}`,
        })),
      }),
    QUICK_LINKS_KEY,
  )

  const links = page.getByTestId('popup-quick-link')
  await expect(links).toHaveCount(30)
  const layout = await page.evaluate(() => {
    const scrollArea = document.querySelector<HTMLElement>('.popup-content')!
    const grid = document.querySelector<HTMLElement>('.quick-url-grid')!
    const firstLink = document.querySelector<HTMLElement>('.popup-quick-link')!
    const header = document.querySelector<HTMLElement>('.popup-header')!
    return {
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      cardHeight: firstLink.getBoundingClientRect().height,
      headerBorder: getComputedStyle(header).borderBottomWidth,
      scrollable: scrollArea.scrollHeight > scrollArea.clientHeight,
    }
  })
  expect(layout).toEqual({ columns: 2, cardHeight: 60, headerBorder: '0px', scrollable: true })

  await page.locator('.popup-content').evaluate(element => {
    element.scrollTop = element.scrollHeight
  })
  await expect(links.last()).toBeInViewport()
  await expect(page.getByTestId('add-current-page')).toBeVisible()

  await page.evaluate(key => chrome.storage.local.set({ [key]: 'dark' }), THEME_KEY)
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('.popup-container')).toHaveCSS('background-color', 'rgb(16, 17, 20)')

  // Chrome initially measures action popups in a very narrow viewport. The popup
  // itself must establish its width instead of inheriting that viewport width.
  await page.setViewportSize({ width: 25, height: 600 })
  await expect(page.locator('body')).toHaveCSS('width', '480px')
  await expect(page.locator('.quick-url-grid')).toHaveCSS('grid-template-columns', /\d+px \d+px/)
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
