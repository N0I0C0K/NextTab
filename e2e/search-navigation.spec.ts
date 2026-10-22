import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

async function prepare(page: Page, extensionId: string, count = 35) {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async total => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'settings-storage': {
        autoFocusCommandInput: false,
        showRecentPages: false,
        quickUrlSortMode: 'manual',
        showBookmarksInQuickUrlMenu: true,
        showOpenTabsInQuickUrlMenu: true,
        bookmarkFolderId: null,
      },
      'quick-url-item-storage-key': Array.from({ length: total }, (_, index) => ({
        id: String(index),
        title: `Saved project ${String(index).padStart(2, '0')}`,
        url: `https://navigation.example/project?q=${index}`,
      })),
    })
  }, count)
  await page.reload()
  await expect(page.getByTestId('command-input')).toBeVisible()
}

test('quick links search all records, paginate, accept a changed trigger and open exactly one new tab', async ({
  page,
  context,
  extensionId,
}, testInfo) => {
  await context.route('https://navigation.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Opened saved page</title>' }),
  )
  await prepare(page, extensionId)
  await page.getByTestId('command-shortcut-quickLinks').click()
  const input = page.getByTestId('command-input')
  await input.fill('saved')
  await expect(page.getByTestId('command-result')).toHaveCount(9)
  await page.locator('[data-command-result-id="quick-links-all"]').click()
  const dialog = page.getByTestId('quick-links-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await dialog.getByRole('textbox').press('ArrowDown')
  await expect(dialog.locator('.nt-navigation-open').first()).toBeFocused()
  await dialog.locator('.nt-navigation-open').first().press('ArrowDown')
  await expect(dialog.locator('.nt-navigation-open').nth(1)).toBeFocused()
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect(dialog.getByRole('textbox')).toBeInViewport()
    await expect(dialog.locator('.nt-navigation-pagination')).toBeInViewport()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`quick-list-${viewport.width}-${viewport.height}.png`) })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByRole('button', { name: '下一页' }).click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(15)
  await expect(dialog.locator('.nt-navigation-open').first()).toBeFocused()
  await dialog.getByRole('textbox').fill('q=34')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await expect(dialog.getByTestId('navigation-row')).toContainText('Saved project 34')
  await dialog.getByRole('textbox').fill('saved')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog.getByTestId('navigation-row').first()).toContainText('Saved project 00')
  await dialog.getByRole('textbox').fill('q=34')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  const listPopupPromise = context.waitForEvent('page')
  await dialog.locator('.nt-navigation-open').first().press('Control+Enter')
  const listPopup = await listPopupPromise
  await listPopup.waitForURL('https://navigation.example/project?q=34')
  await expect(page).toHaveURL(`chrome-extension://${extensionId}/newtab.html`)
  await listPopup.close()
  await dialog.getByRole('textbox').press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(input).toBeFocused()
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'command-settings-storage': {
        quickLinks: { active: true, includeInGlobal: false, priority: 3, activeKey: 'saved' },
      },
    })
  })
  await page.getByTestId('command-clear-mode').click()
  await input.fill('')
  await expect(page.getByTestId('command-shortcut-quickLinks').first()).toHaveAttribute('title', /saved/)
  await input.fill('saved q=34')
  await expect(page.getByTestId('command-clear-mode')).toHaveText('快捷链接')
  await expect(input).toHaveValue('q=34')
  await expect(page.getByTestId('command-result')).toHaveCount(1)
  const pagesBefore = context.pages().length
  const popupPromise = context.waitForEvent('page')
  await input.press('Control+Enter')
  const popup = await popupPromise
  await popup.waitForURL('https://navigation.example/project?q=34')
  await expect(page).toHaveURL(`chrome-extension://${extensionId}/newtab.html`)
  expect(context.pages()).toHaveLength(pagesBefore + 1)
  await popup.close()
  await input.click()
  await expect(page.getByTestId('command-result')).toHaveCount(1)
  const clickedPagePromise = context.waitForEvent('page')
  await page.getByTestId('command-result').click({ modifiers: ['Control'] })
  const clickedPage = await clickedPagePromise
  await clickedPage.waitForURL('https://navigation.example/project?q=34')
  await expect(page).toHaveURL(`chrome-extension://${extensionId}/newtab.html`)
  expect(context.pages()).toHaveLength(pagesBefore + 1)
  await clickedPage.close()
})

test('engine settings support ordered edits, disable, delete and undo, with responsive editor controls', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId, 1)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'search-engines': [
        { id: 'a', name: 'Documentation', url: 'https://docs.example/search?q=%s', enabled: true },
        { id: 'b', name: 'Repository', url: 'https://code.example/find/%s', enabled: true },
      ],
      'theme-storage-key': 'dark',
    })
  })
  await page.reload()
  await page.getByTestId('command-input').fill('g ')
  await page.locator('[data-command-result-id="manage-search-engines"]').click()
  const dialog = page.getByRole('dialog')
  const rows = dialog.getByTestId('engine-row')
  await rows
    .nth(1)
    .getByRole('button', { name: /Repository/ })
    .click()
  await dialog.getByRole('button', { name: '上移' }).click()
  await expect(rows.first()).toContainText('Repository')
  await rows.first().getByRole('switch').click()
  await expect(rows.first().getByRole('switch')).not.toBeChecked()
  await dialog.getByRole('button', { name: '删除', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Repository')
  await expect(rows.first().getByRole('switch')).not.toBeChecked()
  await rows
    .first()
    .getByRole('button', { name: /Repository/ })
    .click()
  await dialog.getByRole('button', { name: '编辑', exact: true }).click()
  await dialog.getByTestId('engine-name').fill('Documentation')
  await expect(dialog.getByTestId('engine-save')).toBeDisabled()
  await dialog.getByTestId('engine-name').fill('Repository with a deliberately long name')
  await dialog.getByTestId('engine-url').fill('https://code.example/search?q=%s&kind=repository#%s')
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 700 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await dialog.getByTestId('engine-save').scrollIntoViewIfNeeded()
    await expect(dialog.getByTestId('engine-save')).toBeInViewport()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`engine-editor-${viewport.width}-${viewport.height}.png`) })
  }
  await dialog.getByTestId('engine-save').click()
  await expect(rows.first()).toContainText('Repository with a deliberately long name')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByTestId('command-input').fill('needle')
  await expect(page.locator('[data-command-result-id^="search-engine-"]')).toHaveCount(1)
  await expect(page.locator('[data-command-result-id^="search-engine-"]')).toContainText('Documentation')
})

test('a rejected engine save keeps the draft and the next save can recover', async ({ page, extensionId }) => {
  await prepare(page, extensionId, 1)
  await page.getByTestId('command-input').fill('g ')
  await page.locator('[data-command-result-id="manage-search-engines"]').click()
  await page.getByTestId('engine-add').click()
  await page.getByTestId('engine-name').fill('Recoverable engine')
  await page.getByTestId('engine-url').fill('https://recover.example/?q=%s')
  await page.evaluate(() => {
    const original = chrome.storage.local.set.bind(chrome.storage.local)
    let failed = false
    Object.defineProperty(chrome.storage.local, 'set', {
      value: (values: Record<string, unknown>) => {
        if ('search-engines' in values && !failed) {
          failed = true
          return Promise.reject(new Error('Test: storage write unavailable'))
        }
        return original(values)
      },
    })
  })
  await page.getByTestId('engine-save').click()
  await expect(page.getByTestId('engine-name')).toHaveValue('Recoverable engine')
  await expect(page.getByTestId('engine-save')).toBeEnabled()
  expect(
    await page.evaluate(async () => (await chrome.storage.local.get('search-engines'))['search-engines']),
  ).toBeUndefined()
  await page.getByTestId('engine-save').click()
  await expect(page.getByTestId('engine-row')).toHaveCount(1)
})

test('settings tabs and accordion cannot silently discard an engine draft', async ({ page, extensionId }) => {
  await prepare(page, extensionId, 1)
  await page.getByTestId('settings-trigger').click()
  await page.getByTestId('settings-tab-command').click()
  const webSearch = page.getByTestId('command-plugin-webSearch')
  await webSearch.getByRole('button').first().click()
  await page.getByTestId('engine-add').click()
  await page.getByTestId('engine-name').fill('Unfinished engine')
  await page.getByTestId('engine-url').fill('https://draft.example/search?q=%s')
  await page.getByTestId('settings-tab-data').click()
  await expect(page.getByTestId('engine-editor')).toBeVisible()
  await expect(page.getByText('放弃尚未保存的修改？')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click()
  await expect(page.getByTestId('engine-name')).toHaveValue('Unfinished engine')
  await webSearch.getByRole('button').first().click()
  await expect(page.getByTestId('engine-editor')).toBeVisible()
  await expect(page.getByText('放弃尚未保存的修改？')).toBeVisible()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await expect(page.getByTestId('engine-editor')).toHaveCount(0)
  await page.getByTestId('settings-tab-data').click()
  await expect(page.getByTestId('export-settings')).toBeVisible()
})

test('deleting history while bookmarks load does not cancel their first result', async ({ page, extensionId }) => {
  await prepare(page, extensionId, 1)
  await page.evaluate(async () => {
    for (let index = 0; index < 6; index++)
      await chrome.bookmarks.create({
        title: `Loading bookmark ${index}`,
        url: `https://navigation.example/saved/${index}`,
      })
  })
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  await expect(page.getByTestId('related-bookmark')).toHaveCount(5)
  await page.evaluate(() => {
    const original = chrome.bookmarks.getTree.bind(chrome.bookmarks)
    Object.defineProperty(chrome.bookmarks, 'getTree', {
      value: () =>
        new Promise(resolve => {
          sessionStorage.setItem('review-bookmarks-pending', 'true')
          window.addEventListener(
            'review-release-bookmarks',
            () => {
              void original().then(resolve)
            },
            { once: true },
          )
        }),
    })
  })
  await page.getByTestId('all-site-bookmarks').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('review-bookmarks-pending'))).toBe('true')
  await page.evaluate(async () => {
    chrome.history.onVisitRemoved.addListener(() => {
      sessionStorage.setItem('review-history-deleted', 'true')
    })
    await chrome.history.deleteAll()
  })
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('review-history-deleted'))).toBe('true')
  await expect(dialog.locator('.nt-navigation-pagination')).toContainText('—')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('review-release-bookmarks'))
  })
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(6)
  await expect(dialog.locator('.nt-navigation-pagination')).toContainText('共 6 条')
})

test('a bookmark refresh failure preserves the last list and can be retried', async ({ page, extensionId }) => {
  await prepare(page, extensionId, 1)
  await page.evaluate(async () => {
    for (let index = 0; index < 6; index++)
      await chrome.bookmarks.create({ title: `Recover ${index}`, url: `https://navigation.example/?q=${index}` })
  })
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  await page.getByTestId('all-site-bookmarks').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(6)
  await dialog.getByRole('textbox').press('Escape')
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  await expect(page.getByTestId('related-bookmark')).toHaveCount(5)
  await page.evaluate(() => {
    const original = chrome.bookmarks.getTree.bind(chrome.bookmarks)
    let failed = false
    Object.defineProperty(chrome.bookmarks, 'getTree', {
      value: () => {
        if (!failed) {
          failed = true
          return Promise.reject(new Error('Test: bookmarks read unavailable'))
        }
        return original()
      },
    })
  })
  await page.getByTestId('all-site-bookmarks').click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(6)
  await expect(dialog.getByRole('button', { name: '重试', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '重试', exact: true })).toHaveCount(0)
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(6)
})

test('site previews show five records and the full source searches folders without merging duplicates', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId, 1)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'quick-url-item-storage-key': [{ id: 'site', title: 'Navigation site', url: 'https://navigation.example/' }],
    })
    const folder = await chrome.bookmarks.create({ title: 'Research folder' })
    for (let index = 0; index < 27; index++)
      await chrome.bookmarks.create({
        parentId: folder.id,
        title: `Bookmark ${String(index).padStart(2, '0')} with a long localized title for navigation`,
        url: `https://navigation.example/project?q=${index}`,
      })
    await chrome.bookmarks.create({
      parentId: folder.id,
      title: 'Duplicate bookmark',
      url: 'https://navigation.example/project?q=1',
    })
    await chrome.bookmarks.create({ title: 'Wrong subdomain', url: 'https://sub.navigation.example/' })
  })
  await page.reload()
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  const menu = page.locator('[data-slot="context-menu-content"]')
  await expect(menu.getByTestId('related-bookmark')).toHaveCount(5)
  await menu.getByTestId('all-site-bookmarks').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await dialog.getByRole('textbox').fill('Research folder q=26')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await dialog.getByRole('textbox').fill('q=1')
  await expect(dialog.getByTestId('navigation-row').filter({ hasText: 'Duplicate bookmark' })).toHaveCount(1)
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 768, height: 700 },
    { width: 390, height: 700 },
    { width: 320, height: 600 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => {
        const rect = await dialog.boundingBox()
        return rect !== null && rect.y >= 15 && rect.y + rect.height <= viewport.height - 15
      })
      .toBe(true)
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeGreaterThan(Math.min(700, viewport.width - 40))
    expect(bounds!.y).toBeGreaterThanOrEqual(12)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 12)
    await expect(dialog.getByRole('textbox')).toBeVisible()
    await expect(dialog.locator('.nt-navigation-pagination')).toBeVisible()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`site-${viewport.width}-${viewport.height}.png`) })
  }
})

test('custom engines validate, retain unsaved drafts, persist and return one result per enabled engine', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId, 1)
  await page.getByTestId('settings-trigger').click()
  await page.getByTestId('settings-tab-command').click()
  await page.getByTestId('command-plugin-webSearch').getByRole('button').first().click()
  await page.getByTestId('engine-add').click()
  await page.getByTestId('engine-name').fill('GitHub')
  await page.getByTestId('engine-url').fill('https://github.com/search')
  await expect(page.getByTestId('engine-save')).toBeDisabled()
  await page.getByTestId('engine-url').fill('https://%s.github.com/search')
  await expect(page.getByTestId('engine-save')).toBeDisabled()
  await page.getByTestId('engine-url').fill('https://github.com/search?q=%s')
  await expect(page.getByTestId('engine-save')).toBeEnabled()
  await page.getByTestId('engine-editor').press('Escape')
  await expect(page.getByText('放弃尚未保存的修改？')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByTestId('engine-editor')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click()
  await page.getByTestId('engine-save').click()
  await expect(page.getByTestId('engine-row')).toHaveCount(1)
  await page.getByTestId('settings-tab-data').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('export-settings').click()
  const download = await downloadPromise
  const { readFile } = await import('node:fs/promises')
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(exported.searchEngines).toEqual([
    expect.objectContaining({ name: 'GitHub', url: 'https://github.com/search?q=%s', enabled: true }),
  ])
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  const input = page.getByTestId('command-input')
  await input.fill('g 中文 & C++')
  await expect(page.locator('[data-command-result-id^="search-engine-"]')).toHaveCount(1)
  await expect(page.locator('[data-command-result-id^="search-engine-"]')).toContainText(
    'https://github.com/search?q=' + encodeURIComponent('中文 & C++'),
  )
  await expect(page.locator('[data-command-result-id="search-unique-key"]')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('engine-search.png') })
})

test('duplicate open tabs stay independent and close targets a single current tab', async ({
  page,
  context,
  extensionId,
}) => {
  test.setTimeout(60000)
  await context.route('https://navigation.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Shared navigation tab</title>' }),
  )
  await prepare(page, extensionId, 1)
  const ids = await page.evaluate(async () => {
    const ids: number[] = []
    for (let index = 0; index < 7; index++) {
      const tab = await chrome.tabs.create({ url: 'https://navigation.example/shared?exact=1', active: false })
      ids.push(tab.id!)
    }
    return ids
  })
  await page.bringToFront()
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  await page.getByTestId('all-site-tabs').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(7)
  await page.evaluate(async id => {
    await chrome.tabs.move(id, { index: 0 })
  }, ids[6])
  await expect(dialog.getByTestId('navigation-row').first()).toHaveAttribute('data-item-id', String(ids[6]))
  const first = dialog.getByTestId('navigation-row').first()
  const target = Number(await first.getAttribute('data-item-id'))
  await first.getByRole('button', { name: /关闭标签页/ }).click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(6)
  await expect(dialog.locator('.nt-navigation-open').first()).toBeFocused()
  const current = await page.evaluate(async () => (await chrome.tabs.query({})).map(tab => tab.id))
  expect(current).not.toContain(target)
  expect(ids.filter(id => id !== target).every(id => current.includes(id))).toBe(true)
})

test('closing the only tab on the last page focuses its preceding record', async ({ page, context, extensionId }) => {
  test.setTimeout(60000)
  await context.route('https://navigation.example/**', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Paginated tab</title>' }),
  )
  await prepare(page, extensionId, 1)
  await page.evaluate(async () => {
    for (let index = 0; index < 21; index++)
      await chrome.tabs.create({ url: `https://navigation.example/page?index=${index}`, active: false })
  })
  await page.bringToFront()
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  await page.getByTestId('all-site-tabs').click()
  const dialog = page.getByTestId('site-pages-dialog')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await dialog.getByRole('button', { name: '下一页' }).click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(1)
  await dialog.getByRole('button', { name: /关闭标签页/ }).click()
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog.locator('.nt-navigation-open').last()).toBeFocused()
  await page.evaluate(async () => {
    await chrome.tabs.create({ url: 'https://navigation.example/page?index=new', active: false })
  })
  await expect(dialog.getByTestId('navigation-list')).toHaveAttribute('data-total', '21')
  await expect(dialog.getByTestId('navigation-row')).toHaveCount(20)
  await expect(dialog.locator('.nt-navigation-open').last()).toBeFocused()
})
