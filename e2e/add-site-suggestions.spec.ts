import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import type { ActivitySnapshot } from '../utils/page-activity/model'

function activity(sites: { title: string; url: string }[]): ActivitySnapshot {
  const now = Date.now()
  return {
    now,
    bytes: 0,
    activeViewId: null,
    pages: sites.map((site, i) => ({ ...site, id: i + 1, key: new URL(site.url).origin + new URL(site.url).pathname })),
    events: sites.flatMap((_, i) => [
      {
        id: i * 2,
        pageId: i + 1,
        viewId: String(i),
        type: 'enter' as const,
        source: 'tab' as const,
        at: now - 1000000,
      },
      {
        id: i * 2 + 1,
        pageId: i + 1,
        viewId: String(i),
        type: 'leave' as const,
        source: 'tab' as const,
        at: now - 1000000 + (sites.length - i) * 60000,
      },
    ]),
  }
}

test.use({ extensionLocale: 'zh-CN' })

const sites = [
  { title: 'Saved', url: 'https://saved.suggest.test/deep/page' },
  { title: 'GitHub', url: 'https://github.suggest.test/project?q=private#readme' },
  { title: 'Duplicate', url: 'http://www.github.suggest.test/another' },
  { title: 'Figma', url: 'https://figma.suggest.test/' },
  {
    title: 'MDN Web Docs · JavaScript 与浏览器开发参考文档和非常长的网站标题',
    url: 'https://developer.mozilla.suggest.test/a-very-long-path',
  },
  { title: 'Notion', url: 'https://notion.suggest.test/' },
  { title: 'Extra', url: 'https://extra.suggest.test/' },
]

async function prepare(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(() =>
    chrome.storage.local.set({
      'onboarding-completed-key': true,
      'theme-storage-key': 'light',
      'quick-url-item-storage-key': [{ id: 'saved', title: 'Saved', url: 'http://www.saved.suggest.test/another' }],
    }),
  )
  await page.reload()
  await expect(page.locator('.nt-return-pages')).toHaveAttribute('aria-busy', 'false')
  await page.evaluate(value => {
    Object.defineProperty(chrome.runtime, 'sendMessage', { configurable: true, value: async () => value })
  }, activity(sites))
}

test('suggestions only fill the editable form, keep keyboard focus and filter saved websites on reopening', async ({
  page,
  extensionId,
}, testInfo) => {
  await prepare(page, extensionId)
  await page.getByTestId('add-quick-link').click()
  const dialog = page.getByRole('dialog')
  const suggestions = dialog.getByTestId('quick-link-suggestion')
  await expect(suggestions).toHaveCount(4)
  await expect(suggestions.first()).toHaveAccessibleName('GitHub')
  await expect(dialog.locator('input[name=title]')).toBeFocused()
  await suggestions.first().focus()
  await suggestions.first().press('Enter')
  await expect(dialog.locator('input[name=title]')).toHaveValue('GitHub')
  await expect(dialog.locator('input[name=url]')).toHaveValue('https://github.suggest.test/')
  await expect(dialog.locator('input[name=title]')).toBeFocused()
  expect(
    await page.evaluate(
      async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'].length,
    ),
  ).toBe(1)
  await dialog.locator('input[name=title]').fill('GitHub 工作')
  await dialog.locator('input[name=url]').fill('https://github.suggest.test/my-team?view=all#work')
  await dialog.getByRole('button', { name: '添加网站', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('add-quick-link')).toBeFocused()
  const stored = await page.evaluate(
    async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'],
  )
  expect(stored).toHaveLength(2)
  expect(stored[1]).toMatchObject({ title: 'GitHub 工作', url: 'https://github.suggest.test/my-team?view=all#work' })
  await page.getByTestId('add-quick-link').click()
  await expect(suggestions).toHaveCount(4)
  await expect(suggestions).not.toContainText(['GitHub'])
  await expect(dialog.locator('input[name=title]')).toHaveValue('')
  await suggestions.filter({ hasText: 'MDN' }).click()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => chrome.storage.local.set({ 'theme-storage-key': value }), theme)
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 700 },
      { width: 320, height: 600 },
      { width: 900, height: 360 },
    ]) {
      await page.setViewportSize(viewport)
      await expect
        .poll(async () => {
          const popup = await dialog.boundingBox()
          return (
            !!popup &&
            popup.width >= (viewport.width > 600 ? 470 : viewport.width - 34) &&
            popup.y >= 15 &&
            popup.y + popup.height <= viewport.height - 15
          )
        })
        .toBe(true)
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      expect(
        await suggestions.evaluateAll(elements =>
          elements.every(element => element.getBoundingClientRect().width <= 224.5),
        ),
      ).toBe(true)
      await dialog.locator('input[name=title]').scrollIntoViewIfNeeded()
      await expect(dialog.locator('input[name=title]')).toBeInViewport({ ratio: 1 })
      await page.screenshot({ path: testInfo.outputPath(`suggestions-${theme}-${viewport.width}.png`) })
      await dialog.getByRole('button', { name: '添加网站', exact: true }).scrollIntoViewIfNeeded()
      await expect(dialog.getByRole('button', { name: '添加网站', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport({ ratio: 1 })
    }
  }
  await dialog.locator('input[name=url]').press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('optional recommendations do not block manual input, failed saves retain fields and duplicates stay open', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await page.evaluate(() => {
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      configurable: true,
      value: async () => {
        throw new Error('Unavailable')
      },
    })
    const set = chrome.storage.local.set.bind(chrome.storage.local)
    let rejectOnce = true
    Object.defineProperty(chrome.storage.local, 'set', {
      configurable: true,
      value: (items: Record<string, unknown>) => {
        if (rejectOnce && 'quick-url-item-storage-key' in items) {
          rejectOnce = false
          return Promise.reject(new Error('Storage unavailable'))
        }
        return set(items)
      },
    })
  })
  await page.getByTestId('add-quick-link').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('quick-link-suggestion')).toHaveCount(0)
  await dialog.locator('input[name=title]').fill('Manual')
  await dialog.locator('input[name=url]').fill('https://manual.suggest.test/')
  await dialog.getByRole('button', { name: '添加网站', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('添加失败，请重试。')
  await expect(dialog.locator('input[name=title]')).toHaveValue('Manual')
  await expect(dialog.locator('input[name=url]')).toHaveValue('https://manual.suggest.test/')
  await dialog.getByRole('button', { name: '添加网站', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByTestId('add-quick-link').click()
  await dialog.locator('input[name=title]').fill('Duplicate')
  await dialog.locator('input[name=url]').fill('https://manual.suggest.test/')
  await dialog.getByRole('button', { name: '添加网站', exact: true }).click()
  await expect(dialog.getByRole('alert')).toHaveText('已在常用网站中')
  await expect(dialog).toBeVisible()
  expect(
    await page.evaluate(
      async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'].length,
    ),
  ).toBe(2)
})

test('late recommendation results do not overwrite drafts, reappear after history deletion or leak across openings', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await page.evaluate(() => {
    let request = 0
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      configurable: true,
      value: () =>
        new Promise(resolve => {
          const id = ++request
          const listener = (event: Event) => {
            const result = (event as CustomEvent).detail
            if (result.id !== id) return
            document.removeEventListener('release-sites', listener)
            resolve(result.sites)
          }
          document.addEventListener('release-sites', listener)
        }),
    })
  })
  await page.getByTestId('add-quick-link').click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[name=title]').fill('My draft')
  await dialog.locator('input[name=url]').fill('https://draft.suggest.test/')
  await page.evaluate(
    value => document.dispatchEvent(new CustomEvent('release-sites', { detail: { id: 1, sites: value } })),
    activity(sites),
  )
  await expect(dialog.getByTestId('quick-link-suggestion')).toHaveCount(4)
  await expect(dialog.locator('input[name=title]')).toHaveValue('My draft')
  await dialog.locator('input[name=url]').press('Escape')
  await page.getByTestId('add-quick-link').click()
  await dialog.locator('input[name=title]').fill('Second draft')
  await dialog.locator('input[name=url]').press('Escape')
  await page.getByTestId('add-quick-link').click()
  await dialog.locator('input[name=title]').fill('Third draft')
  await page.evaluate(
    value => document.dispatchEvent(new CustomEvent('release-sites', { detail: { id: 2, sites: value } })),
    activity(sites),
  )
  await expect(dialog.getByTestId('quick-link-suggestion')).toHaveCount(0)
  await page.evaluate(async () => {
    await chrome.history.addUrl({ url: 'https://delete.suggest.test/' })
    await chrome.history.deleteAll()
  })
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0)
  await page.evaluate(
    value => document.dispatchEvent(new CustomEvent('release-sites', { detail: { id: 3, sites: value } })),
    activity(sites),
  )
  await expect(dialog.getByTestId('quick-link-suggestion')).toHaveCount(0)
  await expect(dialog.locator('input[name=title]')).toHaveValue('Third draft')
})

test('a save finishing after close does not close a newly opened form or lose its draft', async ({
  page,
  extensionId,
}) => {
  await prepare(page, extensionId)
  await page.getByTestId('add-quick-link').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByTestId('quick-link-suggestion').first().click()
  await page.evaluate(() => {
    const set = chrome.storage.local.set.bind(chrome.storage.local)
    Object.defineProperty(chrome.storage.local, 'set', {
      configurable: true,
      value: (items: Record<string, unknown>) => {
        if (!('quick-url-item-storage-key' in items)) return set(items)
        return new Promise<void>(resolve => {
          document.addEventListener(
            'release-save',
            () => {
              void set(items).then(() => resolve())
            },
            { once: true },
          )
        })
      },
    })
  })
  await dialog.getByRole('button', { name: '添加网站', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '添加网站', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByTestId('add-quick-link').click()
  await dialog.locator('input[name=title]').fill('Keep this new draft')
  await page.evaluate(() => document.dispatchEvent(new Event('release-save')))
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await chrome.storage.local.get('quick-url-item-storage-key'))['quick-url-item-storage-key'].length,
      ),
    )
    .toBe(2)
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input[name=title]')).toHaveValue('Keep this new draft')
})
