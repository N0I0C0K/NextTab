import { expect, test } from './fixtures'

test.use({ extensionLocale: 'zh-CN' })

test('the existing homepage setting hides return pages and restores them across reloads and short windows', async ({
  page,
  extensionId,
}, testInfo) => {
  const pageErrors: Error[] = []
  page.on('pageerror', error => pageErrors.push(error))
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(async () => {
    await chrome.storage.local.set({
      'onboarding-completed-key': true,
      'quick-url-item-storage-key': [],
    })
    await chrome.history.addUrl({ url: 'https://gitlab.example.com/project/merge-request' })
  })
  await page.reload()
  await expect(page.getByTestId('return-pages-section')).toBeVisible()
  await page.getByTestId('settings-trigger').click()
  await page.getByTestId('show-return-pages').click()
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await chrome.storage.local.get('settings-storage'))['settings-storage']?.showRecentPages,
      ),
    )
    .toBe(false)
  await page.reload()
  await expect(page.getByTestId('return-pages-section')).toHaveCount(0)
  await page.getByTestId('settings-trigger').click()
  const visibilitySwitch = page.getByTestId('show-return-pages')
  await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false')
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 700 },
    { width: 900, height: 360 },
  ]) {
    await page.setViewportSize(viewport)
    await visibilitySwitch.scrollIntoViewIfNeeded()
    await expect(visibilitySwitch).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: testInfo.outputPath(`return-setting-${viewport.width}.png`) })
  }
  await visibilitySwitch.click()
  await expect(page.getByTestId('return-pages-section')).toBeAttached()
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await chrome.storage.local.get('settings-storage'))['settings-storage']?.showRecentPages,
      ),
    )
    .toBe(true)
  await page.reload()
  await expect(page.getByTestId('return-pages-section')).toBeVisible()
  await expect(page.getByTestId('return-page-row').first()).toBeVisible()
  await page.getByTestId('settings-trigger').click()
  await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'true')
  await visibilitySwitch.click()
  await page.reload()
  await expect(page.getByTestId('return-pages-section')).toHaveCount(0)
  expect(pageErrors).toEqual([])
})
