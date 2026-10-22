import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

async function prepare(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    const current = (await chrome.storage.local.get('settings-storage'))['settings-storage'] ?? {}
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': { ...current, autoFocusCommandInput: false },
    })
    await chrome.bookmarks.create({ title: 'beta Command Bookmark', url: 'https://bookmark.example/beta' })
  })
  await page.reload()
  await expect(page.getByTestId('command-input')).toBeVisible()
}

test('history, bookmarks and tabs show defaults on entry and after clearing the query', async ({
  page,
  context,
  extensionId,
}) => {
  await context.route('https://command-default.example/**', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Recent Command Page</title>' }),
  )
  await prepare(page, extensionId)
  const target = await context.newPage()
  await target.goto('https://command-default.example/recent')
  await expect(target).toHaveTitle('Recent Command Page')
  await page.bringToFront()
  const input = page.getByTestId('command-input')
  for (const [mode, title] of [
    ['history', 'Recent Command Page'],
    ['bookmarks', 'beta Command Bookmark'],
    ['tabs', 'Recent Command Page'],
  ]) {
    await page.getByRole('button', { name: '全部功能', exact: true }).click()
    await page.locator(`[data-command-result-id="plugin-list-${mode}"]`).click()
    await expect(input).toHaveValue('')
    await expect(page.getByTestId('command-result').filter({ hasText: title })).toHaveCount(1)
    await input.fill('no-match-for-command-defaults')
    await expect(page.getByTestId('command-result')).toHaveCount(0)
    await input.fill('')
    await expect(page.getByTestId('command-result').filter({ hasText: title })).toHaveCount(1)
    await input.fill('   ')
    await expect(page.getByTestId('command-result').filter({ hasText: title })).toHaveCount(1)
    await input.fill('')
    await input.press('ArrowDown')
    await expect(input).toBeFocused()
  }
})

test('shortcuts select explicit modes, preserve keywords, and include modes without trigger keys', async ({
  page,
  context,
  extensionId,
}) => {
  await context.route('https://command-layout.example/**', route =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<title>beta Command Tab</title>',
    }),
  )
  await prepare(page, extensionId)
  const tab = await context.newPage()
  await tab.goto('https://command-layout.example/beta')
  await page.bringToFront()
  const input = page.getByTestId('command-input')

  await expect(page.getByTestId('command-panel')).toHaveCount(0)
  await input.fill('beta')
  await page.getByTestId('command-panel').getByTestId('command-shortcut-bookmarks').click()
  await expect(page.getByTestId('command-clear-mode')).toHaveText('书签')
  await expect(input).toHaveValue('beta')
  // A literal query beginning with the bookmark trigger must keep its first letter.
  await input.fill('beta')
  await expect(page.getByTestId('command-result')).toHaveCount(1)
  await expect(page.getByTestId('command-result')).toContainText('beta Command Bookmark')

  const panel = page.getByTestId('command-panel')
  await panel.getByTestId('command-shortcut-tabs').focus()
  await panel.getByTestId('command-shortcut-tabs').press('Enter')
  await expect(page.getByTestId('command-clear-mode')).toHaveText('已开标签')
  await expect(input).toHaveValue('beta')
  await expect(input).toBeFocused()
  await expect(page.getByTestId('command-result')).toHaveCount(1)
  await expect(page.getByTestId('command-result')).toContainText('beta Command Tab')

  await page.getByTestId('command-clear-mode').click()
  await expect(input).toHaveValue('beta')
  await expect(page.getByTestId('command-clear-mode')).toHaveCount(0)
  await input.fill('')
  await expect(page.locator('[data-command-result-id="plugin-list-tabs"]')).toBeVisible()
  await page.locator('[data-command-result-id="plugin-list-numberToRmb"]').click()
  await input.fill('1234.56')
  await expect(page.locator('[data-command-result-id="number-to-rmb-result"]')).toContainText(
    '壹仟贰佰叁拾肆元伍角陆分',
  )
})

test('keyboard confirmation keeps input usable and disabled modes disappear immediately', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  const input = page.getByTestId('command-input')
  await page.getByTestId('command-shortcut-calculator').click()
  await input.fill('1+1')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('1+1 = 2')
  await input.press('Enter')
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('calculator_history') ?? '[]')))
    .toContainEqual(expect.objectContaining({ expression: '1+1', result: '2' }))
  await expect(input).toBeFocused()
  await expect(page.getByTestId('command-panel')).toHaveCount(0)
  await input.fill('2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('2+2 = 4')
  await input.press('Escape')
  await expect(page.getByTestId('command-panel')).toHaveCount(0)
  await input.press('Alt+K')
  await expect(input).toBeFocused()
  await expect(page.getByTestId('command-panel')).toBeVisible()

  await page.evaluate(async () => {
    const current = (await chrome.storage.local.get('command-settings-storage'))['command-settings-storage'] ?? {}
    await chrome.storage.local.set({
      'command-settings-storage': {
        ...current,
        calculator: { priority: -10, active: false, activeKey: 'calc', includeInGlobal: false },
      },
    })
  })
  await expect(page.getByTestId('command-shortcut-calculator')).toHaveCount(0)
  await expect(page.getByTestId('command-clear-mode')).toHaveCount(0)
  await page.getByTestId('command-panel').getByTestId('command-all-functions').click()
  await expect(page.locator('[data-command-result-id="plugin-list-calculator"]')).toHaveCount(0)
})

test('typed prefixes and clicks share the selected mode while normal words stay intact', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  const input = page.getByTestId('command-input')
  const mode = page.getByTestId('command-clear-mode')
  await expect(page.getByTestId('command-shortcut-bookmarks')).toHaveAttribute('title', '触发键：b')
  await input.focus()
  await expect(page.locator('[data-command-result-id="plugin-list-bookmarks"] kbd')).toHaveText('b')
  await page.setViewportSize({ width: 320, height: 600 })
  await expect(page.locator('[data-command-result-id="plugin-list-bookmarks"] kbd')).toBeVisible()
  await expect(page.locator('[data-slot="command-input-wrapper"] kbd')).toBeHidden()
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const word of ['github', 'history', 'beta']) {
    await input.fill(word)
    await expect(mode).toHaveCount(0)
    await expect(input).toHaveValue(word)
  }
  await expect(page.getByTestId('command-result').filter({ hasText: 'beta Command Bookmark' })).toBeVisible()
  await input.fill('')
  await input.pressSequentially('b')
  await expect(mode).toHaveCount(0)
  await input.press('Space')
  await expect(mode).toHaveText('书签')
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  const panel = page.getByTestId('command-panel')
  await expect(panel.getByTestId('command-shortcut-bookmarks')).toHaveAttribute('aria-pressed', 'true')
  await input.pressSequentially('beta')
  await expect(page.getByTestId('command-result')).toContainText('beta Command Bookmark')

  await panel.getByTestId('command-shortcut-history').click()
  await expect(mode).toHaveText('历史记录')
  await expect(input).toHaveValue('beta')
  await input.fill('b beta')
  await expect(mode).toHaveText('历史记录')
  await expect(input).toHaveValue('b beta')

  await input.fill('')
  await input.press('Backspace')
  await expect(mode).toHaveCount(0)
  await expect(input).toBeFocused()
  await input.fill('=128 × 0.85')
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('=128 × 0.85')
  await input.fill('=')
  await expect(mode).toHaveCount(0)
  await input.press('Space')
  await expect(mode).toHaveText('计算器')
  await expect(input).toHaveValue('')
  await input.pressSequentially('128 × 0.85')
  await expect(input).toHaveValue('128 × 0.85')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('128 × 0.85 = 108.8')
  await expect(page.getByTestId('command-panel').getByTestId('command-shortcut-calculator')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await input.press('Backspace')
  await expect(mode).toHaveText('计算器')
  await input.fill('')
  await input.press('Backspace')
  await expect(mode).toHaveCount(0)
  await input.fill('rmb 1234.56')
  await expect(mode).toHaveText('金额大写')
  await expect(input).toHaveValue('1234.56')
  await expect(page.locator('[data-command-result-id="number-to-rmb-result"]')).toContainText(
    '壹仟贰佰叁拾肆元伍角陆分',
  )
})

test('keyboard navigation after closing results does not crash the command input', async ({ page, extensionId }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await prepare(page, extensionId)
  const input = page.getByTestId('command-input')

  await input.fill('= 1+1')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('1+1 = 2')
  await input.press('Enter')
  await expect(input).toBeFocused()
  await expect(page.getByTestId('command-panel')).toHaveCount(0)

  // The input remains focused while cmdk's list is unmounted. These keys must
  // not enumerate a missing list or execute a stale, hidden result.
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) {
    await page.keyboard.press(key)
  }
  expect(pageErrors).toEqual([])
  await expect(input).toBeFocused()
  await expect(page.getByTestId('command-panel')).toHaveCount(0)

  await input.fill('')
  await input.press('Backspace')
  await expect(page.getByTestId('command-clear-mode')).toHaveCount(0)
  await expect(input).toBeFocused()
  await input.fill('= 2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('2+2 = 4')
  expect(pageErrors).toEqual([])
})

test('leaving a mode preserves literal prefixes and composition does not change modes mid-input', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await page.evaluate(() =>
    chrome.bookmarks.create({ title: 'h betax Literal Bookmark', url: 'https://bookmark.example/literal' }),
  )
  const input = page.getByTestId('command-input')
  const mode = page.getByTestId('command-clear-mode')
  await page.getByTestId('command-shortcut-bookmarks').click()
  await input.fill('h beta')
  await expect(mode).toHaveText('书签')
  await expect(input).toHaveValue('h beta')
  await mode.click()
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('h beta')
  await expect(page.getByTestId('command-result').filter({ hasText: 'h betax Literal Bookmark' })).toBeVisible()
  await input.press('End')
  await input.pressSequentially('x')
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('h betax')
  await expect(page.getByTestId('command-result').filter({ hasText: 'h betax Literal Bookmark' })).toBeVisible()

  await input.fill('')
  await input.dispatchEvent('compositionstart')
  await input.fill('h ')
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('h ')
  await input.dispatchEvent('compositionend')
  await expect(mode).toHaveText('历史记录')
  await expect(input).toHaveValue('')
  await input.dispatchEvent('keydown', { key: 'Backspace', code: 'Backspace', isComposing: true })
  await expect(mode).toHaveText('历史记录')
  await input.press('Backspace')
  await expect(mode).toHaveCount(0)
})

test('shared trigger keys search every matching plugin and clicking narrows the mode', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await page.evaluate(async () => {
    await chrome.history.addUrl({ url: 'https://history.example/beta' })
    const key = 'command-settings-storage'
    const current = (await chrome.storage.local.get(key))[key] ?? {}
    await chrome.storage.local.set({
      [key]: {
        ...current,
        bookmarks: { priority: 5, active: true, activeKey: 's', includeInGlobal: false },
        history: { priority: 0, active: true, activeKey: 's', includeInGlobal: false },
      },
    })
  })
  const input = page.getByTestId('command-input')
  const mode = page.getByTestId('command-clear-mode')
  await expect(page.getByTestId('command-shortcut-bookmarks')).toHaveAttribute('title', '触发键：s')
  await input.fill('s beta')
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('s beta')
  await expect(page.getByTestId('command-result')).toHaveCount(2)
  await expect(page.getByTestId('command-result').filter({ hasText: 'beta Command Bookmark' })).toBeVisible()
  await expect(page.getByTestId('command-result').filter({ hasText: 'https://history.example/beta' })).toBeVisible()
  await expect(page.locator('[data-command-result-id="search-unique-key"]')).toHaveCount(0)
  await input.pressSequentially(' Command')
  await expect(page.getByTestId('command-result')).toHaveCount(1)
  await input.fill('s beta')
  await expect(page.getByTestId('command-result')).toHaveCount(2)
  await page.getByTestId('command-panel').getByTestId('command-shortcut-bookmarks').click()
  await expect(mode).toHaveText('书签')
  await expect(input).toHaveValue('beta')
  await expect(page.getByTestId('command-result')).toHaveCount(1)
  await expect(page.getByTestId('command-result')).toContainText('beta Command Bookmark')
  await input.fill('s beta')
  await mode.click()
  await input.press('End')
  await input.pressSequentially(' Command')
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('s beta Command')
  await expect(page.locator('[data-command-result-id="search-unique-key"]')).toBeVisible()
  await expect(page.getByTestId('command-result').filter({ hasText: 'beta Command Bookmark' })).toHaveCount(0)
})

test('custom and disabled triggers update keyboard activation and hints together', async ({ page, extensionId }) => {
  await prepare(page, extensionId)
  await page.evaluate(async () => {
    const current = (await chrome.storage.local.get('command-settings-storage'))['command-settings-storage'] ?? {}
    await chrome.storage.local.set({
      'command-settings-storage': {
        ...current,
        calculator: { priority: -10, active: true, activeKey: 'calc', includeInGlobal: false },
        tabs: { priority: 0, active: true, activeKey: 'tab', includeInGlobal: true },
      },
    })
  })
  const input = page.getByTestId('command-input')
  const mode = page.getByTestId('command-clear-mode')
  await expect(page.getByTestId('command-shortcut-calculator')).toHaveAttribute('title', '触发键：calc')
  await input.focus()
  await expect(page.locator('[data-command-result-id="plugin-list-calculator"] kbd')).toHaveText('calc')
  await input.fill('calculator')
  await expect(mode).toHaveCount(0)
  await input.fill('= 2+2')
  await expect(mode).toHaveCount(0)
  await expect(page.locator('[data-command-result-id="calc-result"]')).toHaveCount(0)
  await input.fill('calc 2+2')
  await expect(mode).toHaveText('计算器')
  await expect(input).toHaveValue('2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toContainText('2+2 = 4')
  await input.fill('')
  await input.press('Backspace')
  await input.fill('tab ')
  await expect(mode).toHaveText('已开标签')
  await expect(input).toHaveValue('')
  await input.press('Backspace')
  await page.evaluate(async () => {
    const current = (await chrome.storage.local.get('command-settings-storage'))['command-settings-storage']
    await chrome.storage.local.set({
      'command-settings-storage': { ...current, calculator: { ...current.calculator, active: false } },
    })
  })
  await expect(page.getByTestId('command-shortcut-calculator')).toHaveCount(0)
  await input.fill('calc 2+2')
  await expect(mode).toHaveCount(0)
  await expect(input).toHaveValue('calc 2+2')
  await expect(page.locator('[data-command-result-id="calc-result"]')).toHaveCount(0)
})

test('results connect to the input and shortcuts stay below the scrolling list at every window size', async ({
  page,
  extensionId,
}, testInfo) => {
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  await prepare(page, extensionId)
  await page.evaluate(async () => {
    for (let index = 0; index < 15; index++) {
      await chrome.bookmarks.create({
        title: `布局检查 ${index} · NextTab 命令模块的长标题、历史记录和标签页切换说明`.repeat(3),
        url: `https://layout.example/very/long/path/${index}?query=${'localized-metadata-'.repeat(15)}`,
      })
    }
  })
  await page.getByTestId('command-shortcut-bookmarks').click()
  await expect(page.getByTestId('command-result')).toHaveCount(10)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 700 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    const input = page.getByTestId('command-input')
    const panel = page.getByTestId('command-panel')
    const list = page.getByTestId('command-results')
    const shortcuts = panel.getByTestId('command-shortcuts')
    await expect(shortcuts.getByTestId('command-all-functions')).toBeInViewport({ ratio: 1 })
    const inputBounds = await input.boundingBox()
    const commandBounds = await page.locator('.nt-command').boundingBox()
    const borderWidth = await page
      .locator('.nt-command')
      .evaluate(element => Number.parseFloat(getComputedStyle(element).borderLeftWidth))
    const panelBounds = await panel.boundingBox()
    const listBounds = await list.boundingBox()
    const shortcutBounds = await shortcuts.boundingBox()
    expect(Math.abs(panelBounds!.y - (inputBounds!.y + inputBounds!.height))).toBeLessThan(5)
    expect(Math.abs(panelBounds!.x - commandBounds!.x - borderWidth)).toBeLessThan(0.5)
    expect(Math.abs(panelBounds!.width - (commandBounds!.width - borderWidth * 2))).toBeLessThan(0.5)
    expect(shortcutBounds!.y).toBeGreaterThanOrEqual(listBounds!.y + listBounds!.height)
    expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(viewport.height - 14)
    expect(panelBounds!.height).toBeLessThanOrEqual(440)
    expect(
      Math.abs(commandBounds!.y + commandBounds!.height - (panelBounds!.y + panelBounds!.height) - borderWidth),
    ).toBeLessThan(0.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({ path: testInfo.outputPath(`command-${viewport.width}x${viewport.height}.png`) })
  }
  for (let index = 0; index < 9; index++) await page.getByTestId('command-input').press('ArrowDown')
  await expect(page.getByTestId('command-result').last()).toBeInViewport({ ratio: 1 })
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const zoom of [1.25, 1.5]) {
    await page.evaluate(zoom => {
      document.documentElement.style.zoom = String(zoom)
      window.dispatchEvent(new Event('resize'))
    }, zoom)
    const frame = page.locator('.nt-command')
    const inputWrapper = frame.locator('[data-slot="command-input-wrapper"]')
    const panel = page.getByTestId('command-panel')
    const frameBounds = await frame.boundingBox()
    const wrapperBounds = await inputWrapper.boundingBox()
    const panelBounds = await panel.boundingBox()
    expect(Math.abs(wrapperBounds!.x - panelBounds!.x)).toBeLessThan(0.1)
    expect(Math.abs(wrapperBounds!.width - panelBounds!.width)).toBeLessThan(0.1)
    expect(frameBounds!.y + frameBounds!.height).toBeLessThanOrEqual(1000 - 14)
    await expect(panel.getByTestId('command-all-functions')).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath(`command-zoom-${zoom}.png`) })
  }
  await page.evaluate(() => {
    document.documentElement.style.zoom = ''
    window.dispatchEvent(new Event('resize'))
  })
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByTestId('command-input')).toHaveCSS('color', 'rgb(250, 250, 250)')
  await page.screenshot({ path: testInfo.outputPath('command-dark.png') })
  expect(errors).toEqual([])
})

test('opening and closing the command panel keeps the page below it in place', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId)
  await expect(page.locator('.nt-return-empty')).toBeVisible()
  const input = page.getByTestId('command-input')
  const positions = () =>
    page.evaluate(() =>
      ['.nt-search-section', '.nt-return-section', '.nt-links-section'].map(selector => {
        const bounds = document.querySelector(selector)!.getBoundingClientRect()
        return { top: bounds.top, height: bounds.height }
      }),
    )
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    for (const zoom of [1, 1.25]) {
      await page.evaluate(zoom => {
        document.documentElement.style.zoom = String(zoom)
        window.dispatchEvent(new Event('resize'))
      }, zoom)
      const idle = await positions()
      await input.focus()
      await expect(page.getByTestId('command-panel')).toBeVisible()
      expect(await positions()).toEqual(idle)
      await input.press('Escape')
      await expect(page.getByTestId('command-panel')).toHaveCount(0)
      expect(await positions()).toEqual(idle)

      await page.getByRole('button', { name: '书签', exact: true }).click()
      await expect(page.getByTestId('command-result')).toHaveCount(1)
      expect(await positions()).toEqual(idle)
      await page.screenshot({
        path: testInfo.outputPath(`command-stable-${viewport.width}x${viewport.height}-${zoom}.png`),
      })
      await input.press('Escape')
      expect(await positions()).toEqual(idle)
    }
  }
})
