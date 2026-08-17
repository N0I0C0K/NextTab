import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const ONBOARDING_KEY = 'onboarding-completed-key'
const SETTINGS_KEY = 'settings-storage'
const THEME_KEY = 'theme-storage-key'
const QUICK_LINKS_KEY = 'quick-url-item-storage-key'
const COMMAND_SETTINGS_KEY = 'command-settings-storage'

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
  await page.getByTestId('onboarding-skip-step').click()
  await page.getByTestId('onboarding-complete').click()

  await expect(page.getByTestId('settings-trigger')).toBeVisible()
  await expect.poll(() => readExtensionStorage<boolean>(page, ONBOARDING_KEY)).toBe(true)
  await page.reload()
  await expect(page.getByTestId('onboarding-start')).toHaveCount(0)
  expect(pageErrors).toEqual([])
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

test('appearance settings persist theme, URL, and local wallpaper', async ({ page, extensionId }) => {
  const pageErrors = collectPageErrors(page)
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
