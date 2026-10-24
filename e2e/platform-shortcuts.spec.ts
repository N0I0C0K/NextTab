import { test, expect } from './fixtures'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const platforms = [
  { name: 'Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', mac: false },
  { name: 'macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', mac: true },
  { name: 'Linux', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', mac: false },
]

for (const locale of [
  { code: 'en-US', control: 'Ctrl' },
  { code: 'zh-CN', control: 'Ctrl' },
  { code: 'de', control: 'Strg' },
]) {
  test.describe(`platform shortcuts in ${locale.code}`, () => {
    test.use({ extensionLocale: locale.code })

    for (const platform of platforms) {
      test(`shows ${platform.name} keys and focuses the command input with the advertised shortcut`, async ({
        page,
        extensionId,
      }) => {
        await page.addInitScript(userAgent => {
          Object.defineProperty(navigator, 'userAgent', { get: () => userAgent })
        }, platform.userAgent)
        await page.setViewportSize({ width: 480, height: 480 })
        await page.goto(`chrome-extension://${extensionId}/popup.html`)
        await page.evaluate(() =>
          chrome.storage.local.set({
            'onboarding-completed-key': true,
            'quick-url-item-storage-key': [{ id: 'shortcut', title: 'Shortcut example', url: 'https://example.com/' }],
          }),
        )
        await page.locator('.popup-help-button').click()
        const help = page.getByRole('dialog')
        await expect(help).toBeVisible()
        const labels = await page.evaluate(() => ({
          newTab: chrome.i18n.getMessage('popupOpenTab'),
          allSaved: chrome.i18n.getMessage('popupHelpAllSaved'),
        }))
        await expect(help.getByText(labels.newTab, { exact: true }).locator('..').locator('kbd')).toHaveText([
          platform.mac ? '⌘' : locale.control,
          'Enter',
        ])
        await expect(help.getByText(labels.allSaved, { exact: true }).locator('..').locator('kbd')).toHaveText([
          platform.mac ? 'Option' : 'Alt',
          '1',
        ])
        if (locale.code === 'zh-CN') {
          const folder = path.resolve('artifacts/requirements/pr-108-release')
          await mkdir(folder, { recursive: true })
          await page.screenshot({ path: path.join(folder, `popup-${platform.name}-light.png`) })
          await page.setViewportSize({ width: 320, height: 340 })
          await page.evaluate(() => chrome.storage.local.set({ 'theme-storage-key': 'dark' }))
          await expect(page.locator('html')).toHaveClass(/dark/)
          await expect(help.getByRole('button')).toBeInViewport()
          await help.locator('.popup-help-body').evaluate(element => {
            element.scrollTop = element.scrollHeight
          })
          await expect(help.locator('.popup-help-body > div').last()).toBeInViewport()
          await page.screenshot({ path: path.join(folder, `popup-${platform.name}-dark-short.png`) })
        }
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.goto(`chrome-extension://${extensionId}/newtab.html`)
        const command = page.getByTestId('command-input')
        await expect(command).toBeVisible()
        await expect(page.getByText(platform.mac ? '⌘+K' : 'Alt+K', { exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(command).not.toBeFocused()
        await page.keyboard.press(platform.mac ? 'Meta+k' : 'Alt+k')
        await expect(command).toBeFocused()
        if (locale.code === 'zh-CN' && platform.name === 'Windows') {
          const folder = path.resolve('artifacts/requirements/pr-108-release')
          for (const [width, height] of [
            [1440, 1000],
            [390, 700],
            [900, 360],
          ]) {
            await page.setViewportSize({ width, height })
            await expect(command).toBeInViewport()
            await expect(page.locator('svg.nt-brand-mark')).toBeVisible()
            await page.screenshot({ path: path.join(folder, `newtab-${width}-${height}.png`) })
          }
        }
      })
    }
  })
}
