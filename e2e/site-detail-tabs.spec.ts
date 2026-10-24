import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

test('site details expose all three sources with only four tabs and preserve saved record identities', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await context.route('https://site-detail.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>NextTab 项目资料与长标题导航测试</title>' }),
  )
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': {
        autoFocusCommandInput: false,
        showRecentPages: false,
        showBookmarksInQuickUrlMenu: true,
        showOpenTabsInQuickUrlMenu: true,
        quickUrlSortMode: 'manual',
      },
      'quick-url-item-storage-key': [
        { id: 'site', title: 'Github', url: 'https://site-detail.example/' },
        { id: 'quick', title: 'Copilot · 首页快捷链接', url: 'https://site-detail.example/copilot?q=1' },
        { id: 'variant', title: 'Copilot · 查询变体', url: 'https://site-detail.example/copilot?q=2' },
      ],
    })
    const folder = await chrome.bookmarks.create({ title: '开发 / 产品资料' })
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Copilot · 浏览器书签',
      url: 'https://site-detail.example/copilot?q=1',
    })
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: '架构设计文档',
      url: 'https://site-detail.example/docs',
    })
    await chrome.bookmarks.create({ title: 'Wrong subdomain', url: 'https://sub.site-detail.example/' })
    for (let index = 0; index < 4; index++)
      await chrome.tabs.create({ url: 'https://site-detail.example/copilot?q=1', active: false })
  })
  await page.reload()
  await page.bringToFront()
  const card = page.getByTestId('quick-link-card').first()
  await card.click({ button: 'right' })
  await expect(page.getByTestId('all-site-tabs')).toContainText('4')
  await expect(page.getByTestId('all-site-bookmarks')).toContainText('2')
  await page.screenshot({ path: testInfo.outputPath('entry-menu.png'), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await card.locator('.nt-link-expand').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByRole('tab')).toHaveCount(3)
  await expect(dialog.getByTestId('site-tab-tabs')).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(4)
  await page.screenshot({ path: testInfo.outputPath('tabs-desktop.png'), animations: 'disabled' })
  const firstTabRow = dialog.getByTestId('navigation-row').first()
  expect(((await firstTabRow.locator('.nt-return-meta').textContent())?.match(/窗口/g) ?? []).length).toBe(1)
  await firstTabRow.hover()
  await firstTabRow.locator('.nt-return-more').click()
  await expect(page.getByTestId('save-quick-link')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '复制链接', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '关闭标签页', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  await dialog.getByRole('textbox').fill('no matching tab')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(0)
  await expect(dialog.getByTestId('site-tab-tabs')).toContainText('4')
  await dialog.getByTestId('site-tab-saved').click()
  await expect(dialog.getByRole('textbox')).toHaveValue('')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(5)
  await expect(dialog.getByTestId('site-tab-saved')).toContainText('5')
  await expect(dialog.locator('[data-item-id="quick:quick"]')).toContainText('首页快捷链接')
  await expect(dialog.getByTestId('navigation-row').filter({ hasText: 'Copilot · 浏览器书签' })).toContainText(
    '开发 / 产品资料',
  )
  await dialog.getByRole('textbox').fill('开发 架构')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await dialog.getByRole('textbox').fill('copilot?q=2')
  await dialog.getByRole('textbox').press('ArrowDown')
  const saved = dialog.locator('.nt-return-open')
  await expect(saved).toBeFocused()
  const before = context.pages().length
  await saved.press('Control+Enter')
  await expect.poll(() => context.pages().length).toBe(before + 1)
  await expect
    .poll(async () =>
      (await page.evaluate(async () => chrome.tabs.query({}))).some(
        tab => tab.url === 'https://site-detail.example/copilot?q=2',
      ),
    )
    .toBe(true)
  await page.bringToFront()
  await dialog.getByRole('textbox').fill('')
  await dialog.getByTestId('navigation-row').first().hover()
  await dialog.getByTestId('navigation-row').first().locator('.nt-return-more').click()
  await expect(page.getByRole('menuitem', { name: '复制链接', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog.getByTestId('navigation-row').first().locator('.nt-return-more')).toBeFocused()
  await dialog.getByRole('heading', { name: 'Github', exact: true }).focus()
  await page.mouse.move(0, 0)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('textbox')).toBeInViewport()
    await expect(dialog.getByRole('button', { name: '打开网站', exact: true })).toBeInViewport()
    await expect(dialog.getByTestId('site-tab-history')).toBeInViewport()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`saved-${viewport.width}-${viewport.height}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map(animation => animation.finished.catch(() => {})),
    ),
  )
  await page.screenshot({ path: testInfo.outputPath('saved-dark.png'), animations: 'disabled' })
})

test('empty site tabs stay visible and history can be saved without moving the active row', async ({
  page,
  extensionId,
}, testInfo) => {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': {
        showRecentPages: false,
        autoFocusCommandInput: false,
        showOpenTabsInQuickUrlMenu: true,
        showBookmarksInQuickUrlMenu: true,
      },
      'quick-url-item-storage-key': [{ id: 'site', title: 'Docs', url: 'https://empty-site.example/' }],
    })
    await chrome.history.addUrl({ url: 'https://empty-site.example/recent' })
  })
  await page.reload()
  const expand = page.getByTestId('quick-link-card').first().locator('.nt-link-expand')
  await expand.click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByTestId('site-tab-tabs')).toContainText('0')
  await expect(dialog).toContainText('当前没有此网站的标签页')
  await expect(dialog.getByRole('tab')).toHaveCount(3)
  await dialog.getByTestId('site-tab-tabs').press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(dialog.getByTestId('site-tab-saved')).toHaveAttribute('aria-selected', 'true')
  await dialog.getByTestId('site-tab-history').click()
  const row = dialog.getByTestId('return-page-row')
  await expect(row).toHaveCount(1)
  await row.hover()
  await row.locator('.nt-return-more').click()
  await page.getByTestId('save-quick-link').click()
  await expect(row.locator('.nt-return-more')).toBeFocused()
  await expect(dialog.getByTestId('site-tab-history')).toHaveAttribute('aria-selected', 'true')
  await expect(row).toHaveCount(1)
  await expect(dialog.getByTestId('site-tab-saved')).toContainText('2')
  await page.screenshot({ path: testInfo.outputPath('history.png') })
  await page.keyboard.press('Escape')
  await expect(expand).toBeFocused()
})

test('disabling bookmarks during an in-flight read never reveals the late result', async ({ page, extensionId }) => {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': { showRecentPages: false, autoFocusCommandInput: false, showBookmarksInQuickUrlMenu: true },
      'quick-url-item-storage-key': [{ id: 'site', title: 'Docs', url: 'https://scope-site.example/' }],
    })
    await chrome.bookmarks.create({ title: 'Late private bookmark', url: 'https://scope-site.example/secret' })
  })
  await page.reload()
  await page.evaluate(() => {
    const read = chrome.bookmarks.getTree.bind(chrome.bookmarks)
    Object.defineProperty(chrome.bookmarks, 'getTree', {
      value: () =>
        new Promise(resolve => {
          sessionStorage.setItem('site-bookmarks-pending', 'true')
          window.addEventListener(
            'release-site-bookmarks',
            () => {
              void read().then(resolve)
            },
            { once: true },
          )
        }),
    })
  })
  await page.getByTestId('quick-link-card').first().locator('.nt-link-expand').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await dialog.getByTestId('site-tab-saved').click()
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('site-bookmarks-pending'))).toBe('true')
  await expect(dialog.getByTestId('site-tab-saved')).toContainText('—')
  await expect(dialog.locator('.nt-navigation-pagination [role="status"]')).toHaveText('—')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await page.evaluate(async () => {
    const key = 'settings-storage'
    const settings = (await chrome.storage.local.get(key))[key]
    await chrome.storage.local.set({ [key]: { ...settings, showBookmarksInQuickUrlMenu: false } })
    window.dispatchEvent(new Event('release-site-bookmarks'))
  })
  await expect(dialog.getByTestId('site-tab-saved')).toContainText('1')
  await expect(dialog.getByText('Late private bookmark')).toHaveCount(0)
  await expect(dialog.getByRole('tab')).toHaveCount(3)
})

test('saved page details keep their explanation open across unrelated tab updates', async ({ page, extensionId }) => {
  await page.goto('chrome-extension://' + extensionId + '/newtab.html')
  await page.evaluate(() =>
    chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': {
        autoFocusCommandInput: false,
        showRecentPages: false,
        showOpenTabsInQuickUrlMenu: true,
        showBookmarksInQuickUrlMenu: true,
      },
      'quick-url-item-storage-key': [{ id: 'site', title: 'Docs', url: 'https://detail-stability.example/' }],
    }),
  )
  await page.reload()
  await page.getByTestId('quick-link-card').locator('.nt-link-expand').click()
  const site = page.getByTestId('site-pages-dialog')
  await site.getByTestId('site-tab-saved').click()
  await site.getByTestId('return-page-row').hover()
  await site.locator('.nt-return-more').click()
  await page.getByRole('menuitem', { name: '详细信息', exact: true }).click()
  const details = page.getByTestId('page-details-dialog')
  await expect(details.locator('.nt-page-details-body')).toHaveAttribute('aria-busy', 'false')
  const helpLabel = await page.evaluate(() => chrome.i18n.getMessage('returnDetailsUsageHelp'))
  await details.getByRole('button', { name: helpLabel, exact: true }).click()
  const explanation = page.locator('.nt-return-rules')
  await expect(explanation).toBeVisible()
  const tabId = await page.evaluate(async () => (await chrome.tabs.create({ url: 'about:blank', active: false })).id!)
  await page.evaluate(async id => chrome.tabs.move(id, { index: 0 }), tabId)
  // Wait for the real hook refresh, then keep the explanation and loaded details.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)))
  await expect(explanation).toBeVisible()
  await expect(details.locator('.nt-page-details-body')).toHaveAttribute('aria-busy', 'false')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(site).toBeVisible()
  await expect(site.locator('.nt-return-more')).toBeFocused()
})
