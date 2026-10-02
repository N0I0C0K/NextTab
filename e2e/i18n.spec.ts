import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

const ONBOARDING_KEY = 'onboarding-completed-key'
const QUICK_LINKS_KEY = 'quick-url-item-storage-key'

async function openDeleteConfirmation(page: Page, extensionId: string) {
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.evaluate(
    ({ onboardingKey, quickLinksKey }) =>
      chrome.storage.local.set({
        [onboardingKey]: true,
        [quickLinksKey]: [{ id: 'github', title: 'Github', url: 'https://github.com/' }],
      }),
    { onboardingKey: ONBOARDING_KEY, quickLinksKey: QUICK_LINKS_KEY },
  )
  await page.reload()
  await page.getByTestId('quick-link-card').click({ button: 'right' })
  await page.getByTestId('quick-link-delete').click()
  return page.getByRole('dialog')
}

for (const locale of [
  {
    code: 'en-US',
    title: 'Delete "Github"?',
    warning: 'This cannot be undone.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    close: 'Close',
  },
  {
    code: 'zh-CN',
    title: '删除“Github”？',
    warning: '删除后无法恢复。',
    confirm: '确认',
    cancel: '取消',
    close: '关闭',
  },
  {
    code: 'zh-TW',
    title: '刪除「Github」？',
    warning: '刪除後無法復原。',
    confirm: '確認',
    cancel: '取消',
    close: '關閉',
  },
  {
    code: 'de',
    title: '„Github“ löschen?',
    warning: 'Dieser Vorgang kann nicht rückgängig gemacht werden.',
    confirm: 'Bestätigen',
    cancel: 'Abbrechen',
    close: 'Schließen',
  },
]) {
  test.describe(`native ${locale.code} translations`, () => {
    test.use({ extensionLocale: locale.code })

    test('shows the localized delete dialog through Chrome i18n', async ({ page, extensionId }, testInfo) => {
      const dialog = await openDeleteConfirmation(page, extensionId)
      const uiLocale = await page.evaluate(() => chrome.i18n.getUILanguage())
      expect(uiLocale.toLowerCase()).toBe(locale.code.toLowerCase())
      await expect(dialog.getByRole('heading')).toHaveText(locale.title)
      await expect(dialog).toContainText(locale.warning)
      await expect(dialog.getByRole('button', { name: locale.confirm, exact: true })).toBeVisible()
      await expect(dialog.getByRole('button', { name: locale.close, exact: true })).toBeVisible()
      for (const viewport of [
        { width: 1440, height: 1000 },
        { width: 320, height: 360 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(dialog).toBeInViewport({ ratio: 1 })
        await expect(dialog.getByRole('button', { name: locale.confirm, exact: true })).toBeInViewport({ ratio: 1 })
        await expect(dialog.getByRole('button', { name: locale.cancel, exact: true })).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: testInfo.outputPath(`${viewport.width}.png`), animations: 'disabled' })
      }
      await dialog.getByRole('button', { name: locale.cancel, exact: true }).click()
      await expect(page.getByTestId('quick-link-card')).toHaveCount(1)
    })
  })
}

test.describe('stale native translation catalog', () => {
  test.use({
    extensionLocale: 'zh-CN',
    missingMessages: ['deleteQuickItemConfirm', 'deleteQuickItemWarning', 'confirm', 'cancel', 'close'],
  })

  test('keeps confirmation text visible when Chrome has not loaded the new keys', async ({
    page,
    extensionId,
  }, testInfo) => {
    await page.goto(`chrome-extension://${extensionId}/newtab.html`)
    const nativeMessage = await page.evaluate(() => chrome.i18n.getMessage('deleteQuickItemConfirm'))
    expect(nativeMessage).toBe('')
    const dialog = await openDeleteConfirmation(page, extensionId)
    await expect(dialog.getByRole('heading')).toHaveText('删除“Github”？')
    await expect(dialog).toContainText('删除后无法恢复。')
    await expect(dialog.getByRole('button', { name: '确认', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('stale-catalog.png'), animations: 'disabled' })
  })
})
